(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const sb = SiteData.client;
  const demo = new URLSearchParams(location.search).has("demo");

  let content = null;     // المحتوى الذي يتم تحريره
  let savedJson = "";     // آخر نسخة محفوظة للمقارنة
  let gallery = [];       // عناصر المعرض
  let current = "hero";   // اللوحة الحالية
  const openItems = {};   // العناصر المفتوحة في كل قائمة
  const pendingDeletes = new Set(); // ملفات أُزيلت من المحتوى وتُحذف من التخزين بعد الحفظ

  // ---------- Helpers ----------
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k in el && k !== "list") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  }
  const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) {
    const keys = p.split(".");
    const last = keys.pop();
    const target = keys.reduce((a, k) => (a[k] ??= {}), o);
    target[last] = v;
  }

  let toastTimer;
  function toast(msg, error = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("error", error);
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), error ? 4500 : 2400);
  }

  // كل قيم "path" داخل عنصر (لحذف ملفاته من التخزين عند حذفه)
  const collectPaths = (o, out = []) => {
    if (Array.isArray(o)) o.forEach((x) => collectPaths(x, out));
    else if (o && typeof o === "object")
      for (const [k, v] of Object.entries(o)) k === "path" && typeof v === "string" ? out.push(v) : collectPaths(v, out);
    return out;
  };

  const isDirty = () => JSON.stringify(content) !== savedJson;
  const refreshDirty = () => ($("#dirtyFlag").hidden = !isDirty());
  window.addEventListener("beforeunload", (e) => {
    if (content && isDirty()) { e.preventDefault(); e.returnValue = ""; }
  });

  function friendlyError(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/row-level security|violates|permission|unauthorized|403/i.test(m))
      return "ليس لديك صلاحية التعديل — تأكد أن بريدك مطابق للبريد في setup.sql";
    if (/Invalid login credentials/i.test(m)) return "البريد أو كلمة المرور غير صحيحة";
    if (/Failed to fetch|NetworkError/i.test(m)) return "تعذّر الاتصال بالخادم — تحقق من الإنترنت";
    if (/exceeded the maximum allowed size|Payload too large/i.test(m)) return "حجم الملف أكبر من المسموح (10MB)";
    return m;
  }

  // ضغط الصور قبل الرفع (أقصى بُعد 2000px)
  async function compressImage(file, maxDim = 2000, quality = 0.85) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const img = await createImageBitmap(file).catch(() => null);
    if (!img) return file;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise((r) => canvas.toBlob(r, "image/webp", quality));
    let ext = "webp";
    if (!blob || blob.type !== "image/webp") {
      blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
      ext = "jpg";
    }
    if (!blob || (scale === 1 && blob.size >= file.size)) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type: blob.type });
  }

  const requireBackend = () => {
    if (demo || !sb) { toast("الرفع يتطلب ربط Supabase (غير متاح في الوضع التجريبي)", true); return false; }
    return true;
  };

  // ---------- Panels schema ----------
  const catOptions = () => (content.projectCategories || []).map((c) => [c.key, c.label || c.key]);

  const PANELS = [
    {
      id: "hero", icon: "🏠", title: "الواجهة الرئيسية", desc: "أول ما يراه الزائر: الاسم، التعريف، الصورة والأرقام",
      cards: [
        { title: "التعريف", fields: [
          { key: "hero.greeting", label: "التحية" },
          { key: "hero.name", label: "الاسم" },
          { key: "hero.role", label: "المسمى الثابت" },
          { key: "hero.rotating", label: "العبارات المتبدلة", type: "lines", hint: "عبارة في كل سطر" },
          { key: "hero.lead", label: "الفقرة التعريفية", type: "textarea", full: true, hint: "استخدم **نص** للخط الغامق" },
          { key: "hero.showAvailable", label: "إظهار شارة «متاح للعمل»", type: "checkbox" },
          { key: "hero.availableText", label: "نص الشارة" },
        ]},
        { title: "الصورة والملفات", fields: [
          { key: "hero.avatarUrl", label: "الصورة الشخصية", type: "image", folder: "profile", full: true, hint: "يفضّل صورة مربعة. إن تُركت فارغة تظهر الأحرف الأولى" },
          { key: "hero.initials", label: "الأحرف الأولى (بديل الصورة)" },
          { key: "hero.chips", label: "الكلمات العائمة حول الصورة", type: "tags", hint: "حتى 3، افصل بفاصلة" },
          { key: "hero.cvUrl", label: "ملف السيرة الذاتية (PDF)", type: "file", folder: "files", accept: "application/pdf", full: true },
        ]},
        { title: "الأرقام السريعة", fields: [
          { key: "stats", type: "list", compact: true, newItem: () => ({ value: 0, plus: false, label: "" }),
            fields: [
              { key: "value", label: "الرقم", type: "number" },
              { key: "plus", label: "+", type: "checkbox" },
              { key: "label", label: "الوصف" },
            ]},
        ]},
        { title: "عنوان التبويب ووصف الصفحة", desc: "يغيّر عنوان تبويب المتصفح فقط. صورة ونص المعاينة عند مشاركة الرابط ثابتان في ملف index.html", fields: [
          { key: "meta.title", label: "عنوان الصفحة", full: true },
          { key: "meta.description", label: "وصف الصفحة", type: "textarea", full: true },
        ]},
      ],
    },
    {
      id: "about", icon: "👤", title: "نبذة مهنية", desc: "النبذة، التعليم، ومجالات الخبرة",
      cards: [
        { title: "النبذة", fields: [
          { key: "about.paragraphs", label: "الفقرات", type: "paras", full: true, hint: "افصل بين الفقرات بسطر فارغ. ==نص== للتظليل، **نص** للغامق" },
        ]},
        { title: "التعليم", fields: [
          { key: "about.education", type: "list", newItem: () => ({ degree: "", school: "", years: "" }), titleKey: "degree",
            fields: [
              { key: "degree", label: "الدرجة / الشهادة" },
              { key: "school", label: "الجامعة · المدينة" },
              { key: "years", label: "السنوات" },
            ]},
        ]},
        { title: "مجالات الخبرة", fields: [
          { key: "about.expertise", type: "list", compact: true, newItem: () => ({ icon: "⭐", text: "" }),
            fields: [
              { key: "icon", label: "رمز", width: 80 },
              { key: "text", label: "المجال" },
            ]},
        ]},
      ],
    },
    {
      id: "experience", icon: "💼", title: "الخبرة العملية", desc: "الوظائف والتدريب والعمل الحر",
      cards: [
        { title: "الوظائف", fields: [
          { key: "experience", type: "list", titleKey: "title", newItem: () => ({ title: "وظيفة جديدة", org: "", date: "", bullets: [], tags: [] }),
            fields: [
              { key: "title", label: "المسمى الوظيفي" },
              { key: "org", label: "الجهة" },
              { key: "date", label: "الفترة", hint: "مثال: يونيو 2025 – الآن" },
              { key: "tags", label: "الأدوات / الوسوم", type: "tags" },
              { key: "bullets", label: "المهام والإنجازات", type: "lines", full: true, hint: "نقطة في كل سطر" },
            ]},
        ]},
      ],
    },
    {
      id: "projects", icon: "🧩", title: "المشاريع", desc: "المشاريع التقنية وتصنيفاتها",
      cards: [
        { title: "المشاريع", fields: [
          { key: "projects", type: "list", titleKey: "title",
            newItem: () => ({ type: "", title: "مشروع جديد", date: "", category: (content.projectCategories[0] || {}).key || "", bullets: [], tags: [], results: [], link: "", images: [] }),
            fields: [
              { key: "title", label: "عنوان المشروع", full: true },
              { key: "images", label: "صور المشروع", type: "images", folder: "projects", hint: "الصورة الأولى هي غلاف المشروع — استخدم الأسهم لتغيير الترتيب" },
              { key: "type", label: "نوع المشروع (الشارة)" },
              { key: "category", label: "التصنيف", type: "select", options: catOptions },
              { key: "date", label: "الفترة" },
              { key: "link", label: "رابط (اختياري)", type: "url", hint: "GitHub أو عرض حي" },
              { key: "results", label: "النتائج والأرقام", type: "tags", full: true, hint: "تظهر بشكل بارز أعلى المشروع. مثال: Accuracy 94%، F1 0.91، 12 عميلاً — افصل بفاصلة" },
              { key: "tags", label: "التقنيات", type: "tags", full: true },
              { key: "bullets", label: "التفاصيل", type: "lines", full: true, hint: "نقطة في كل سطر" },
            ]},
        ]},
        { title: "تصنيفات المشاريع", desc: "تظهر كأزرار تصفية فوق المشاريع", fields: [
          { key: "projectCategories", type: "list", compact: true, newItem: () => ({ key: "cat" + Date.now().toString(36).slice(-4), label: "" }),
            fields: [
              { key: "label", label: "اسم التصنيف" },
              { key: "key", label: "المعرّف (لاتيني)", width: 160 },
            ]},
        ]},
      ],
    },
    { id: "gallery", icon: "🖼️", title: "معرض الأعمال", desc: "ارفع صور أعمالك ونظّمها في تصنيفات", custom: renderGallery },
    {
      id: "skills", icon: "🛠️", title: "المهارات واللغات", desc: "مجموعات المهارات ومستوى اللغات",
      cards: [
        { title: "مجموعات المهارات", fields: [
          { key: "skills", type: "list", titleKey: "title", newItem: () => ({ icon: "★", title: "مجموعة جديدة", items: [] }),
            fields: [
              { key: "title", label: "اسم المجموعة" },
              { key: "icon", label: "رمز" },
              { key: "items", label: "المهارات", type: "tags", full: true },
            ]},
        ]},
        { title: "اللغات", fields: [
          { key: "languages", type: "list", compact: true, newItem: () => ({ name: "", level: "", percent: 50 }),
            fields: [
              { key: "name", label: "اللغة" },
              { key: "level", label: "المستوى" },
              { key: "percent", label: "النسبة %", type: "number", width: 100 },
            ]},
        ]},
      ],
    },
    {
      id: "contact", icon: "✉️", title: "التواصل والروابط", desc: "بيانات التواصل وحسابات التواصل الاجتماعي",
      cards: [
        { title: "بيانات التواصل", fields: [
          { key: "socials.email", label: "البريد الإلكتروني", ltr: true },
          { key: "socials.phone", label: "الهاتف", ltr: true },
          { key: "socials.whatsapp", label: "رقم واتساب (أرقام فقط)", ltr: true },
          { key: "socials.linkedin", label: "LinkedIn", type: "url" },
          { key: "socials.instagram", label: "Instagram", type: "url" },
          { key: "socials.behance", label: "Behance", type: "url" },
          { key: "socials.github", label: "GitHub", type: "url" },
        ]},
        { title: "قسم التواصل", fields: [
          { key: "contact.title", label: "العنوان", full: true },
          { key: "contact.text", label: "النص", type: "textarea", full: true },
          { key: "footer", label: "نص التذييل", full: true },
        ]},
      ],
    },
    { id: "backup", icon: "💾", title: "النسخ الاحتياطي", desc: "تصدير واستيراد المحتوى", custom: renderBackup },
  ];

  // ---------- Field rendering ----------
  function parseValue(def, el) {
    switch (def.type) {
      case "number": return el.value === "" ? 0 : Number(el.value);
      case "checkbox": return el.checked;
      case "lines": return el.value.split("\n").map((s) => s.trim()).filter(Boolean);
      case "paras": return el.value.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
      case "tags": return el.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
      default: return el.value;
    }
  }
  function displayValue(def, v) {
    if (def.type === "lines") return (v || []).join("\n");
    if (def.type === "paras") return (v || []).join("\n\n");
    if (def.type === "tags") return (v || []).join("، ");
    return v ?? "";
  }

  function renderField(def, path, onChange) {
    const value = getPath(content, path);
    const update = (el) => {
      setPath(content, path, parseValue(def, el));
      refreshDirty();
      onChange && onChange();
    };
    const label = (...kids) => h("label", { class: "field" + (def.full ? " full" : ""), style: def.width ? `flex:0 0 ${def.width}px` : null },
      def.label ? h("span", {}, def.label) : null, ...kids, def.hint ? h("small", { class: "hint" }, def.hint) : null);

    if (def.type === "list") return renderList(def, path);
    // div وليس label: الـ label يحوّل النقر على الصور إلى أول زر بداخله
    if (def.type === "images")
      return h("div", { class: "field full" }, h("span", {}, def.label), renderImages(def, path), h("small", { class: "hint" }, def.hint));

    if (def.type === "checkbox") {
      return h("label", { class: "field check" },
        h("input", { type: "checkbox", checked: !!value, onchange: (e) => update(e.target) }),
        h("span", {}, def.label));
    }
    if (def.type === "select") {
      const opts = def.options();
      return label(h("select", { onchange: (e) => update(e.target) },
        opts.map(([v, l]) => h("option", { value: v, selected: v === value }, l))));
    }
    if (["textarea", "lines", "paras"].includes(def.type)) {
      const rows = def.type === "paras" ? 8 : def.type === "lines" ? 4 : 3;
      return label(h("textarea", { rows, value: displayValue(def, value), oninput: (e) => update(e.target) }));
    }
    if (def.type === "image" || def.type === "file") return label(renderUpload(def, path, value, update));

    return label(h("input", {
      type: def.type === "number" ? "number" : "text",
      value: displayValue(def, value),
      dir: def.ltr || def.type === "url" ? "ltr" : null,
      placeholder: def.type === "url" ? "https://" : null,
      oninput: (e) => update(e.target),
    }));
  }

  function renderUpload(def, path, value, update) {
    const isImg = def.type === "image";
    const urlInput = h("input", { type: "text", dir: "ltr", value: value || "", placeholder: "رابط أو ارفع ملفاً",
      oninput: (e) => { update(e.target); setThumb(e.target.value); } });
    const thumb = h("div", { class: "thumb" });
    const setThumb = (u) => {
      thumb.innerHTML = "";
      if (isImg && u) thumb.append(h("img", { src: u, alt: "" }));
      else thumb.textContent = u ? "PDF" : "—";
    };
    setThumb(value);
    const fileInput = h("input", { type: "file", accept: def.accept || "image/*", hidden: true,
      onchange: async (e) => {
        const f = e.target.files[0];
        e.target.value = "";
        if (!f || !requireBackend()) return;
        btn.disabled = true; btn.textContent = "جارٍ الرفع…";
        try {
          const up = await SiteData.uploadFile(isImg ? await compressImage(f, 1000) : f, def.folder);
          urlInput.value = up.url;
          update(urlInput);
          setThumb(up.url);
          toast("تم الرفع — لا تنسَ حفظ التغييرات");
        } catch (err) { toast(friendlyError(err), true); }
        btn.disabled = false; btn.textContent = "رفع ملف";
      } });
    const btn = h("button", { type: "button", class: "btn btn-ghost sm", onclick: () => fileInput.click() }, "رفع ملف");
    const clear = h("button", { type: "button", class: "icon-btn danger", title: "إزالة", onclick: () => { urlInput.value = ""; update(urlInput); setThumb(""); } }, "✕");
    return h("div", { class: "upload" }, thumb, urlInput, btn, clear, fileInput);
  }

  function renderList(def, path) {
    const wrap = h("div", { class: "full" });
    const opened = (openItems[path] ??= new Set());
    const draw = () => {
      const arr = getPath(content, path) || [];
      const list = h("div", { class: "list" });
      arr.forEach((item, i) => {
        const titleOf = () => (def.titleKey && item[def.titleKey]) || `عنصر ${i + 1}`;
        const titleEl = h("span", { class: "t" }, titleOf());
        const move = (d) => {
          const j = i + d;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          const a = opened.has(i), b = opened.has(j);
          opened.delete(i); opened.delete(j);
          if (a) opened.add(j);
          if (b) opened.add(i);
          refreshDirty(); draw();
        };
        const tools = h("div", { class: "item-tools", onclick: (e) => e.stopPropagation() },
          h("button", { type: "button", class: "icon-btn", title: "تحريك للأعلى", disabled: i === 0, onclick: () => move(-1) }, "↑"),
          h("button", { type: "button", class: "icon-btn", title: "تحريك للأسفل", disabled: i === arr.length - 1, onclick: () => move(1) }, "↓"),
          h("button", { type: "button", class: "icon-btn danger", title: "حذف", onclick: () => {
            if (!confirm(`حذف «${titleOf()}»؟`)) return;
            collectPaths(arr.splice(i, 1)).forEach((p) => pendingDeletes.add(p));
            const next = new Set([...opened].filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)));
            opened.clear(); next.forEach((x) => opened.add(x));
            refreshDirty(); draw();
          } }, "🗑"));

        const fields = def.fields.map((f) => renderField(f, `${path}.${i}.${f.key}`, () => (titleEl.textContent = titleOf())));
        const el = h("div", { class: "item" + (def.compact ? " compact" : "") + (opened.has(i) ? " open" : "") });
        if (def.compact) {
          el.append(h("div", { class: "item-body" }, h("div", { class: "compact-row" }, fields, tools)));
        } else {
          el.append(
            h("div", { class: "item-head", onclick: () => { el.classList.toggle("open"); el.classList.contains("open") ? opened.add(i) : opened.delete(i); } },
              h("span", { class: "num" }, String(i + 1).padStart(2, "0")), titleEl, tools, h("span", { class: "chev" }, "‹")),
            h("div", { class: "item-body" }, h("div", { class: "grid" }, fields)));
        }
        list.append(el);
      });
      if (!arr.length) list.append(h("p", { class: "empty" }, "لا توجد عناصر بعد"));
      const add = h("button", { type: "button", class: "btn btn-ghost add-btn", onclick: () => {
        arr.push(def.newItem());
        if (!getPath(content, path)) setPath(content, path, arr);
        opened.add(arr.length - 1);
        refreshDirty(); draw();
        wrap.querySelector(".item:last-child input, .item:last-child textarea")?.focus();
      } }, "+ إضافة");
      wrap.replaceChildren(list, add);
    };
    draw();
    return wrap;
  }

  function renderImages(def, path) {
    const wrap = h("div");
    const status = h("p", { class: "img-status", hidden: true });
    const fileInput = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true,
      onchange: (e) => { add([...e.target.files]); e.target.value = ""; } });
    const changed = () => { refreshDirty(); draw(); };

    async function add(files) {
      if (!files.length || !requireBackend()) return;
      let arr = getPath(content, path);
      if (!arr) { arr = []; setPath(content, path, arr); }
      status.hidden = false;
      let n = 0, ok = 0;
      for (const f of files) {
        status.textContent = `جارٍ رفع ${++n} من ${files.length}…`;
        try {
          const up = await SiteData.uploadFile(await compressImage(f), def.folder);
          arr.push({ url: up.url, path: up.path, caption: "" });
          ok++;
          changed();
        } catch (err) { toast(friendlyError(err), true); }
      }
      status.hidden = true;
      if (ok) toast(`تم رفع ${ok} صورة — اضغط «حفظ التغييرات» لنشرها`);
    }

    function draw() {
      const arr = getPath(content, path) || [];
      const tiles = arr.map((im, i) => {
        const move = (d) => { [arr[i], arr[i + d]] = [arr[i + d], arr[i]]; changed(); };
        return h("div", { class: "img-tile" },
          h("div", { class: "img-box" },
            h("img", { src: im.url, alt: "", loading: "lazy" }),
            h("div", { class: "img-tools" },
              h("div", {},
                h("button", { type: "button", class: "icon-btn", title: "تقديم", disabled: i === 0, onclick: () => move(-1) }, "→"),
                h("button", { type: "button", class: "icon-btn", title: "تأخير", disabled: i === arr.length - 1, onclick: () => move(1) }, "←")),
              h("button", { type: "button", class: "icon-btn danger", title: "حذف", onclick: () => {
                if (!confirm("حذف هذه الصورة من المشروع؟")) return;
                const [rm] = arr.splice(i, 1);
                if (rm.path) pendingDeletes.add(rm.path);
                changed();
              } }, "🗑")),
            i === 0 ? h("span", { class: "cover-badge" }, "الغلاف") : null),
          h("input", { type: "text", value: im.caption || "", placeholder: "وصف الصورة (اختياري)",
            oninput: (e) => { im.caption = e.target.value; refreshDirty(); } }));
      });
      const addTile = h("button", { type: "button", class: "img-add",
        onclick: () => requireBackend() && fileInput.click(),
        ondragover: (e) => { e.preventDefault(); addTile.classList.add("over"); },
        ondragleave: () => addTile.classList.remove("over"),
        ondrop: (e) => { e.preventDefault(); addTile.classList.remove("over"); add([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))); },
      }, h("span", { class: "big" }, "+"), "إضافة صور", h("small", {}, "أو اسحبها هنا"));
      wrap.replaceChildren(h("div", { class: "img-grid" }, tiles, addTile), status, fileInput);
    }

    draw();
    return wrap;
  }

  // ---------- Panels ----------
  function renderNav() {
    $("#sideNav").replaceChildren(...PANELS.map((p) =>
      h("button", { type: "button", class: p.id === current ? "active" : "", onclick: () => go(p.id) },
        h("span", { class: "ni" }, p.icon), p.title)));
  }

  function go(id) {
    current = PANELS.some((p) => p.id === id) ? id : "hero";
    history.replaceState(null, "", "#" + current);
    $("#sidebar").classList.remove("open");
    renderNav();
    renderPanel();
    window.scrollTo(0, 0);
  }

  function renderPanel() {
    const p = PANELS.find((x) => x.id === current);
    $("#panelTitle").textContent = p.title;
    $("#panelDesc").textContent = p.desc;
    const panel = $("#panel");
    panel.replaceChildren();
    if (p.custom) return p.custom(panel);
    p.cards.forEach((c) => panel.append(card(c.title, c.desc, h("div", { class: "grid" }, c.fields.map((f) => renderField(f, f.key))))));
  }

  const card = (title, desc, ...body) =>
    h("section", { class: "card" },
      h("div", { class: "card-head" }, h("div", {}, h("h3", {}, title), desc ? h("p", {}, desc) : null)), ...body);

  // ---------- Gallery ----------
  function renderGallery(panel) {
    panel.append(card("عنوان القسم", "يظهر هذا القسم في الموقع فقط عند وجود صور",
      h("div", { class: "grid" },
        renderField({ key: "gallery.title", label: "العنوان" }, "gallery.title"),
        renderField({ key: "gallery.subtitle", label: "الوصف" }, "gallery.subtitle"))));

    const cats = () => [...new Set(gallery.map((g) => g.category).filter(Boolean))];
    const datalist = h("datalist", { id: "catList" }, cats().map((c) => h("option", { value: c })));

    // رفع
    const catInput = h("input", { type: "text", placeholder: "مثال: شعارات، هويات بصرية، تصوير", list: "catList" });
    catInput.setAttribute("list", "catList");
    const bar = h("i");
    const progress = h("div", { class: "progress", hidden: true }, bar);
    const fileInput = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: (e) => { upload([...e.target.files]); e.target.value = ""; } });
    const dz = h("div", { class: "dropzone", tabindex: 0, role: "button",
      onclick: () => requireBackend() && fileInput.click(),
      onkeydown: (e) => { if (e.key === "Enter") dz.click(); },
      ondragover: (e) => { e.preventDefault(); dz.classList.add("over"); },
      ondragleave: () => dz.classList.remove("over"),
      ondrop: (e) => { e.preventDefault(); dz.classList.remove("over"); upload([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))); },
    }, h("span", { class: "big" }, "⬆"), h("b", {}, "اسحب الصور هنا أو اضغط للاختيار"), h("p", {}, "JPG · PNG · WEBP · GIF — يتم ضغط الصور تلقائياً"));

    async function upload(files) {
      if (!files.length || !requireBackend()) return;
      progress.hidden = false;
      let minOrder = gallery.reduce((m, g) => Math.min(m, g.sort_order), 0);
      let done = 0, failed = 0;
      for (const f of files) {
        try {
          const up = await SiteData.uploadFile(await compressImage(f), "gallery");
          const row = { title: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "), category: catInput.value.trim(), description: "",
            image_path: up.path, image_url: up.url, sort_order: --minOrder };
          const { data, error } = await sb.from("gallery").insert(row).select().single();
          if (error) { await SiteData.removeFile(up.path).catch(() => {}); throw error; }
          gallery.unshift(data);
        } catch (err) { failed++; toast(friendlyError(err), true); }
        bar.style.width = `${(++done / files.length) * 100}%`;
      }
      if (done - failed) toast(`تم رفع ${done - failed} صورة ✓`);
      setTimeout(() => { progress.hidden = true; bar.style.width = "0"; }, 600);
      renderPanel();
    }

    const uploadCard = card("رفع صور جديدة", "تُنشر الصور فوراً في الموقع", dz, fileInput,
      h("div", { class: "upload-opts" }, h("label", { class: "field" }, h("span", {}, "تصنيف الصور المرفوعة"), catInput)), progress, datalist);
    if (demo || !sb) uploadCard.prepend(h("p", { class: "notice warn" }, "رفع الصور يتطلب ربط Supabase — راجع SETUP.md"));
    panel.append(uploadCard);

    // الصور الحالية
    const grid = h("div", { class: "g-grid" });
    gallery.forEach((g, i) => grid.append(galleryCard(g, i)));
    panel.append(card(`الصور الحالية (${gallery.length})`, "التعديلات هنا تُحفظ تلقائياً",
      gallery.length ? grid : h("p", { class: "empty" }, "لم تُرفع أي صور بعد")));
  }

  function galleryCard(g, i) {
    const status = h("span", { class: "g-status" });
    let timer;
    const saveField = (key, val) => {
      g[key] = val;
      clearTimeout(timer);
      status.textContent = "…";
      timer = setTimeout(async () => {
        const { error } = await sb.from("gallery").update({ [key]: val }).eq("id", g.id);
        status.textContent = error ? "✕ فشل الحفظ" : "تم الحفظ ✓";
        if (error) toast(friendlyError(error), true);
      }, 600);
    };
    const move = async (d) => {
      const j = i + d;
      [gallery[i], gallery[j]] = [gallery[j], gallery[i]];
      const changed = gallery.map((x, k) => ({ x, k })).filter(({ x, k }) => x.sort_order !== k);
      changed.forEach(({ x, k }) => (x.sort_order = k));
      renderPanel();
      const results = await Promise.all(changed.map(({ x }) => sb.from("gallery").update({ sort_order: x.sort_order }).eq("id", x.id)));
      const err = results.find((r) => r.error);
      if (err) toast(friendlyError(err.error), true);
    };
    const del = async () => {
      if (!confirm(`حذف «${g.title || "هذه الصورة"}» نهائياً؟`)) return;
      const { error } = await sb.from("gallery").delete().eq("id", g.id);
      if (error) return toast(friendlyError(error), true);
      await SiteData.removeFile(g.image_path).catch(() => {});
      gallery.splice(i, 1);
      toast("تم الحذف");
      renderPanel();
    };
    const cat = h("input", { type: "text", value: g.category || "", placeholder: "التصنيف", oninput: (e) => saveField("category", e.target.value.trim()) });
    cat.setAttribute("list", "catList");
    return h("div", { class: "g-card" },
      h("div", { class: "g-img" },
        h("a", { href: g.image_url, target: "_blank", rel: "noopener" }, h("img", { src: g.image_url, alt: g.title || "", loading: "lazy" })),
        h("div", { class: "g-tools" },
          h("div", {},
            h("button", { type: "button", class: "icon-btn", title: "تقديم", disabled: i === 0, onclick: () => move(-1) }, "→"),
            h("button", { type: "button", class: "icon-btn", title: "تأخير", disabled: i === gallery.length - 1, onclick: () => move(1) }, "←")),
          h("button", { type: "button", class: "icon-btn danger", title: "حذف", onclick: del }, "🗑"))),
      h("div", { class: "g-body" },
        h("input", { type: "text", value: g.title || "", placeholder: "عنوان العمل", oninput: (e) => saveField("title", e.target.value) }),
        cat,
        h("textarea", { rows: 2, value: g.description || "", placeholder: "وصف قصير (يظهر عند تكبير الصورة)", oninput: (e) => saveField("description", e.target.value) }),
        status));
  }

  // ---------- Backup ----------
  function renderBackup(panel) {
    const importInput = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (e) => {
      const f = e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        content = SiteData.merge(SiteData.clone(window.DEFAULT_CONTENT), data);
        refreshDirty();
        toast("تم الاستيراد — راجع المحتوى ثم اضغط حفظ");
      } catch { toast("الملف غير صالح", true); }
    } });
    panel.append(
      card("تصدير المحتوى", "حمّل نسخة احتياطية من كل النصوص بصيغة JSON (لا تشمل الصور)",
        h("button", { type: "button", class: "btn btn-ghost", onclick: () => {
          const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
          const a = h("a", { href: URL.createObjectURL(blob), download: `portfolio-content-${new Date().toISOString().slice(0, 10)}.json` });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        } }, "⬇ تصدير JSON")),
      card("استيراد المحتوى", "استبدل المحتوى الحالي بنسخة احتياطية سابقة",
        h("button", { type: "button", class: "btn btn-ghost", onclick: () => importInput.click() }, "⬆ استيراد JSON"), importInput),
      card("استعادة المحتوى الأصلي", "إرجاع كل النصوص إلى المحتوى المأخوذ من السيرة الذاتية",
        h("button", { type: "button", class: "btn btn-danger", onclick: () => {
          if (!confirm("سيتم استبدال كل النصوص بالمحتوى الأصلي. متابعة؟")) return;
          content = SiteData.clone(window.DEFAULT_CONTENT);
          refreshDirty();
          toast("تمت الاستعادة — اضغط حفظ لتطبيقها");
        } }, "↺ استعادة")));
  }

  // ---------- Save ----------
  $("#saveBtn").addEventListener("click", async () => {
    if (demo) return toast("الوضع التجريبي: لا يتم حفظ التغييرات", true);
    const btn = $("#saveBtn");
    btn.disabled = true; btn.textContent = "جارٍ الحفظ…";
    try {
      await SiteData.saveContent(content);
      savedJson = JSON.stringify(content);
      refreshDirty();
      // حذف الملفات التي لم تعد مستخدمة (مع تجاهل أي ملف ما زال مذكوراً في المحتوى)
      const unused = [...pendingDeletes].filter((p) => !savedJson.includes(JSON.stringify(p)));
      pendingDeletes.clear();
      await Promise.all(unused.map((p) => SiteData.removeFile(p).catch(() => {})));
      toast("تم حفظ التغييرات ونشرها ✓");
    } catch (e) { toast(friendlyError(e), true); }
    btn.disabled = false; btn.textContent = "حفظ التغييرات";
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !$("#appView").hidden) { e.preventDefault(); $("#saveBtn").click(); }
  });

  $("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (content && id && id !== current) go(id);
  });

  // ---------- Auth & boot ----------
  const show = (id) => ["setupView", "loginView", "appView"].forEach((v) => ($("#" + v).hidden = v !== id));

  async function openApp(email) {
    content = await SiteData.loadContent();
    savedJson = JSON.stringify(content);
    gallery = demo ? [] : await SiteData.loadGallery();
    $("#userEmail").textContent = email;
    $("#demoBadge").hidden = !demo;
    show("appView");
    go(location.hash.slice(1));
    refreshDirty();
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#loginBtn");
    const err = $("#loginError");
    btn.disabled = true; err.hidden = true;
    const { data, error } = await sb.auth.signInWithPassword({ email: $("#loginEmail").value.trim(), password: $("#loginPass").value });
    btn.disabled = false;
    if (error) { err.textContent = friendlyError(error); err.hidden = false; return; }
    $("#loginPass").value = "";
    openApp(data.user.email);
  });

  $("#logoutBtn").addEventListener("click", async () => {
    if (isDirty() && !confirm("لديك تغييرات غير محفوظة. الخروج على أي حال؟")) return;
    if (demo) return (location.href = "admin.html");
    content = null;
    await sb.auth.signOut();
    show("loginView");
  });

  (async () => {
    if (demo) return openApp("وضع تجريبي");
    if (!SiteData.configured) return show("setupView");
    const { data } = await sb.auth.getSession();
    if (data.session) openApp(data.session.user.email);
    else show("loginView");
  })();
})();
