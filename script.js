(async () => {
  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  const safeUrl = (u) => (/^(https?:|mailto:|tel:|assets\/|\.\/|#)/i.test(String(u || "").trim()) ? String(u).trim() : "#");
  const tagsHtml = (tags = []) =>
    tags.length ? `<div class="tags">${tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : "";
  const bulletsHtml = (items = []) => (items.length ? `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : "");

  // تلوين بسيط لبطاقة الكود: تعليقات، نصوص، رموز الأوامر، دوال، كلمات محجوزة، والمتغير قبل =
  const KEYWORDS = new Set(["while", "for", "in", "if", "else", "elif", "try", "except", "finally", "def", "class", "return",
    "import", "from", "as", "not", "and", "or", "True", "False", "None", "val", "var", "fun", "const", "let", "new"]);
  const TOKEN = /(#.*$|\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(^\s*(?:>>>|\$)(?=\s|$))|([A-Za-z_]\w*)(?=\s*\()|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
  const highlightCode = (code) => String(code).split("\n").map((line) => {
    let out = "", last = 0, first = true;
    for (const m of line.matchAll(TOKEN)) {
      out += esc(line.slice(last, m.index));
      const [t, comment, str, prompt, fn, num, word] = m;
      const span = (cls) => `<span class="${cls}">${esc(t)}</span>`;
      if (comment) out += span("c");
      else if (str) out += span("s");
      else if (prompt) out += span("p");
      else if (fn) out += span("f");
      else if (num) out += span("n");
      else if (KEYWORDS.has(word) || (first && /^\s*=(?!=)/.test(line.slice(m.index + t.length)))) out += span("k");
      else out += esc(t);
      if (!prompt) first = false;
      last = m.index + t.length;
    }
    return out + esc(line.slice(last));
  }).join("\n");

  const ICONS = {
    linkedin: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.4 20.5h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.3V9h3.4v1.6h.1c.5-.9 1.6-1.8 3.4-1.8 3.6 0 4.3 2.4 4.3 5.5v6.2zM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM7.1 20.5H3.6V9h3.5v11.5zM22.2 0H1.8C.8 0 0 .8 0 1.7v20.6c0 .9.8 1.7 1.8 1.7h20.4c1 0 1.8-.8 1.8-1.7V1.7C24 .8 23.2 0 22.2 0z"/></svg>',
    email: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-.9 1.2-.3.2-.6.1a8.2 8.2 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.5 13.5 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.2-.3-.3-.6-.4zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zM20.5 3.5A11.9 11.9 0 0 0 1.7 17.8L0 24l6.3-1.7A11.9 11.9 0 0 0 24 12a11.8 11.8 0 0 0-3.5-8.5z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
    behance: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8.2 11.3c.9-.4 1.5-1.2 1.5-2.3C9.7 6.8 8 6 6 6H1v12h5.2c2.2 0 4.1-1 4.1-3.4 0-1.5-.7-2.8-2.1-3.3zM3.3 8h2.3c.9 0 1.7.3 1.7 1.3S6.7 10.6 5.8 10.6H3.3V8zm2.6 8H3.3v-3.2h2.7c1.1 0 1.9.5 1.9 1.6S7 16 5.9 16zM15.5 2.9h5v1.4h-5zM18 7.2c-2.8 0-4.6 2-4.6 4.7 0 2.8 1.7 4.7 4.6 4.7 2.1 0 3.6-1 4.2-3.1h-2.2c-.2.8-1.1 1.2-1.9 1.2-1.5 0-2.3-.9-2.3-2.4h6.5c.1-3-1.4-5.1-4.3-5.1zm-2.2 3.8c.1-1.1.8-1.9 2-1.9s1.9.8 2 1.9h-4z"/></svg>',
    github: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.1 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.2.9 2.3v3.4c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></svg>',
  };

  // ---------- Theme ----------
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch (e) {}
  if (saved) root.dataset.theme = saved;
  else if (window.matchMedia("(prefers-color-scheme: light)").matches) root.dataset.theme = "light";
  $("#themeToggle").addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
  });

  // ---------- Mobile menu ----------
  const menuToggle = $("#menuToggle");
  const navLinks = $("#navLinks");
  menuToggle.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", open);
  });
  navLinks.addEventListener("click", (e) => {
    if (!e.target.closest("a")) return;
    navLinks.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  });

  // ---------- Load data ----------
  const [C, gallery] = await Promise.all([SiteData.loadContent(), SiteData.loadGallery()]);
  render(C, gallery);
  document.body.classList.remove("loading");
  initInteractions(C, gallery);
  showVisitCount(C);
  SiteData.trackVisit();

  async function showVisitCount(C) {
    const vc = C.visitCounter || {};
    if (!vc.show) return;
    const n = await SiteData.visitCount();
    if (n == null) return;
    const el = $("#visitCount");
    el.textContent = ` · ${Number(n).toLocaleString("en-US")} ${vc.label || ""}`;
    el.hidden = false;
  }

  function render(C, gallery) {
    document.title = C.meta.title;
    $('meta[name="description"]').setAttribute("content", C.meta.description);

    document.querySelectorAll("[data-bind]").forEach((el) => (el.textContent = get(C, el.dataset.bind) ?? ""));
    document.querySelectorAll("[data-rich]").forEach((el) => (el.innerHTML = richText(get(C, el.dataset.rich))));

    // Hero
    $("#heroAvailable").hidden = !C.hero.showAvailable;
    const cv = $("#cvLink");
    cv.hidden = !C.hero.cvUrl;
    cv.href = safeUrl(C.hero.cvUrl);
    if (C.hero.avatarUrl) {
      $("#avatar").innerHTML = `<img src="${esc(safeUrl(C.hero.avatarUrl))}" alt="${esc(C.hero.name)}" />`;
    }
    const snippets = (C.hero.codeSnippets || []).map((s) => (s && s.code) || "").filter((s) => s.trim());
    const codeCard = $("#codeCard");
    codeCard.hidden = !snippets.length;
    if (snippets.length) codeCard.querySelector("code").innerHTML = highlightCode(snippets[Math.floor(Math.random() * snippets.length)]);

    document.querySelectorAll(".chip").forEach((el, i) => {
      el.textContent = C.hero.chips[i] || "";
      el.hidden = !C.hero.chips[i];
    });

    const S = C.socials;
    const socials = [
      S.linkedin && { k: "linkedin", href: S.linkedin, label: "LinkedIn" },
      S.email && { k: "email", href: "mailto:" + S.email, label: "Email" },
      S.whatsapp && { k: "whatsapp", href: "https://wa.me/" + S.whatsapp.replace(/\D/g, ""), label: "WhatsApp" },
      S.instagram && { k: "instagram", href: S.instagram, label: "Instagram" },
      S.behance && { k: "behance", href: S.behance, label: "Behance" },
      S.github && { k: "github", href: S.github, label: "GitHub" },
    ].filter(Boolean);
    $("#heroSocial").innerHTML = socials
      .map((s) => `<li><a href="${esc(safeUrl(s.href))}" target="_blank" rel="noopener" aria-label="${s.label}">${ICONS[s.k]}</a></li>`)
      .join("");

    // Stats
    $("#stats").innerHTML = C.stats
      .map((s) => `<div class="stat reveal"><span class="sr-only">${+s.value || 0}${s.plus ? "+" : ""}</span><span class="stat-val" dir="ltr" aria-hidden="true"><span class="num" data-count="${+s.value || 0}">0</span>${s.plus ? '<span class="plus">+</span>' : ""}</span><p>${esc(s.label)}</p></div>`)
      .join("");
    $("#stats").hidden = !C.stats.length;

    // About
    $("#aboutText").innerHTML =
      C.about.paragraphs.map((p) => `<p>${richText(p)}</p>`).join("") +
      C.about.education
        .map((e) => `
        <div class="edu-card">
          <div class="edu-icon"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg></div>
          <div><h3>${esc(e.degree)}</h3><p>${esc(e.school)}</p></div>
          ${e.years ? `<span class="badge">${esc(e.years)}</span>` : ""}
        </div>`)
        .join("");
    $("#expertise").innerHTML = C.about.expertise
      .map((x) => `<li><span class="ei">${esc(x.icon)}</span>${esc(x.text)}</li>`)
      .join("");

    // Experience
    $("#timeline").innerHTML = C.experience
      .map((x) => `
      <li class="tl-item reveal">
        <div class="tl-dot"></div>
        <div class="tl-card">
          <div class="tl-top">
            <div><h3>${esc(x.title)}</h3><p class="org">${esc(x.org)}</p></div>
            ${x.date ? `<span class="badge">${esc(x.date)}</span>` : ""}
          </div>
          ${bulletsHtml(x.bullets)}${tagsHtml(x.tags)}
        </div>
      </li>`)
      .join("");

    // Projects
    const usedCats = C.projectCategories.filter((c) => C.projects.some((p) => p.category === c.key));
    $("#projectFilters").innerHTML =
      `<button class="filter active" data-filter="all" aria-pressed="true">الكل</button>` +
      usedCats.map((c) => `<button class="filter" data-filter="${esc(c.key)}" aria-pressed="false">${esc(c.label)}</button>`).join("");
    $("#projectFilters").hidden = usedCats.length < 2;
    $("#projectsGrid").innerHTML = C.projects
      .map((p, i) => {
        const imgs = p.images || [];
        return `
      <article class="project reveal" data-cat="${esc(p.category)}">
        ${imgs.length ? `
        <button type="button" class="p-cover" data-p="${i}" aria-label="عرض صور المشروع: ${esc(p.title)}">
          <img src="${esc(safeUrl(imgs[0].url))}" alt="${esc(imgs[0].caption || p.title)}" loading="lazy" />
          <span class="p-count">${imgs.length > 1 ? `${imgs.length} صور` : "عرض الصورة"}</span>
        </button>` : ""}
        <div class="p-head">
          <span class="p-num">${String(i + 1).padStart(2, "0")}</span>
          ${p.type ? `<span class="p-type">${esc(p.type)}</span>` : ""}
        </div>
        <h3>${esc(p.title)}</h3>
        ${p.date ? `<p class="p-date">${esc(p.date)}</p>` : ""}
        ${(p.results || []).length ? `<ul class="p-results" aria-label="النتائج">${p.results.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
        ${bulletsHtml(p.bullets)}${tagsHtml(p.tags)}
        ${p.link ? `<a class="p-link" href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener">عرض المشروع ←</a>` : ""}
      </article>`;
      })
      .join("");

    // Gallery
    const hasGallery = gallery.length > 0;
    $("#gallery").hidden = !hasGallery;
    $(".nav-gallery").hidden = !hasGallery;
    if (hasGallery) {
      const cats = [...new Set(gallery.map((g) => g.category).filter(Boolean))];
      $("#galleryFilters").innerHTML =
        `<button class="filter active" data-filter="all" aria-pressed="true">الكل</button>` +
        cats.map((c) => `<button class="filter" data-filter="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join("");
      $("#galleryFilters").hidden = cats.length < 2;
      $("#galleryGrid").innerHTML = gallery
        .map((g, i) => `
        <figure class="work reveal" data-cat="${esc(g.category || "")}" data-i="${i}" tabindex="0" role="button" aria-label="${esc(g.title || "عرض العمل")}">
          <img src="${esc(g.image_url)}" alt="${esc(g.title || "")}" loading="lazy" />
          <figcaption>
            ${g.category ? `<span class="w-cat">${esc(g.category)}</span>` : ""}
            ${g.title ? `<b>${esc(g.title)}</b>` : ""}
          </figcaption>
        </figure>`)
        .join("");
    }

    // Skills
    $("#skillsGrid").innerHTML = C.skills
      .map((s) => `
      <div class="skill-group reveal">
        <h3><span class="sg-icon">${esc(s.icon)}</span>${esc(s.title)}</h3>
        <div class="tags lg">${s.items.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
      </div>`)
      .join("");
    $("#langs").innerHTML =
      `<h3 class="sub-title">اللغات</h3>` +
      C.languages
        .map((l) => `
        <div class="lang">
          <div class="lang-top"><span>${esc(l.name)}</span><small>${esc(l.level)}</small></div>
          <div class="bar"><i style="--w:${Math.max(0, Math.min(100, +l.percent || 0))}%"></i></div>
        </div>`)
        .join("");
    $("#langs").hidden = !C.languages.length;

    // Contact
    const contacts = [
      S.email && { k: "email", href: "mailto:" + S.email, label: "البريد الإلكتروني", value: S.email },
      S.phone && { k: "phone", href: "tel:" + S.phone.replace(/\s/g, ""), label: "الهاتف", value: S.phone },
      S.linkedin && { k: "linkedin", href: S.linkedin, label: "LinkedIn", value: S.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").split("/").pop().replace(/-[a-z0-9]+$/, "") },
    ].filter(Boolean);
    $("#contactLinks").innerHTML = contacts
      .map((c) => `<a href="${esc(safeUrl(c.href))}" class="c-link" target="_blank" rel="noopener">${ICONS[c.k]}<span><small>${c.label}</small><b dir="ltr">${esc(c.value)}</b></span></a>`)
      .join("");
    $("#copyEmail").hidden = !S.email;

    // ترقيم الأقسام الظاهرة
    let n = 0;
    document.querySelectorAll("main .section").forEach((sec) => {
      if (sec.hidden) return;
      const idx = sec.querySelector(".section-index");
      if (idx) idx.textContent = String(++n).padStart(2, "0");
    });

    $("#year").textContent = new Date().getFullYear();
  }

  function initInteractions(C, gallery) {
    // Header border + active link
    const header = $(".site-header");
    const sections = [...document.querySelectorAll("main section[id]")];
    const links = [...navLinks.querySelectorAll("a")];
    const onScroll = () => {
      header.classList.toggle("scrolled", window.scrollY > 10);
      let current = "";
      for (const s of sections) if (!s.hidden && window.scrollY + 120 >= s.offsetTop) current = s.id;
      links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === "#" + current));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Typing effect
    const typed = $("#typed");
    const words = C.hero.rotating.filter(Boolean);
    typed.textContent = words[0] || "";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (words.length > 1 && !reduce) {
      let wi = 0, ci = words[0].length, deleting = true;
      const tick = () => {
        const w = words[wi];
        ci += deleting ? -1 : 1;
        typed.textContent = w.slice(0, ci);
        let delay = deleting ? 45 : 90;
        if (!deleting && ci === w.length) { deleting = true; delay = 2000; }
        else if (deleting && ci === 0) { deleting = false; wi = (wi + 1) % words.length; delay = 300; }
        setTimeout(tick, delay);
      };
      setTimeout(tick, 2200);
    }

    // Reveal on scroll
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        if (e.target.classList.contains("stat")) countUp(e.target.querySelector(".num"));
        io.unobserve(e.target);
      }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".reveal").forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 70}ms`;
      io.observe(el);
    });

    function countUp(el) {
      const target = +el.dataset.count;
      const start = performance.now();
      const step = (t) => {
        const p = Math.min((t - start) / 1200, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    // Filters (projects + gallery)
    const bindFilters = (bar, items) =>
      bar.addEventListener("click", (e) => {
        const btn = e.target.closest(".filter");
        if (!btn) return;
        bar.querySelectorAll(".filter").forEach((b) => {
          b.classList.toggle("active", b === btn);
          b.setAttribute("aria-pressed", b === btn);
        });
        const f = btn.dataset.filter;
        document.querySelectorAll(items).forEach((p) => p.classList.toggle("hide", f !== "all" && p.dataset.cat !== f));
      });
    bindFilters($("#projectFilters"), ".project");
    bindFilters($("#galleryFilters"), ".work");

    // Card spotlight
    document.querySelectorAll(".project").forEach((card) =>
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      })
    );

    // Lightbox (مشترك بين معرض الأعمال وصور المشاريع)
    const lb = $("#lightbox");
    let lbItems = [], cur = 0, opener = null;
    const show = (i) => {
      cur = i;
      const it = lbItems[i];
      $("#lbImg").src = it.url;
      $("#lbImg").alt = it.title || "";
      $("#lbTitle").textContent = it.title || "";
      $("#lbDesc").textContent = it.desc || "";
      $("#lbPrev").hidden = $("#lbNext").hidden = lbItems.length < 2;
      lb.hidden = false;
      document.body.style.overflow = "hidden";
    };
    // عند الفتح ينتقل التركيز إلى زر الإغلاق، وعند الإغلاق يعود إلى العنصر الذي فتحه (لمستخدمي لوحة المفاتيح وقارئات الشاشة)
    const openLightbox = (items, i = 0) => {
      if (!items.length) return;
      lbItems = items;
      opener = document.activeElement;
      show(Math.max(0, i));
      $("#lbClose").focus();
    };
    const close = () => {
      lb.hidden = true;
      document.body.style.overflow = "";
      opener?.focus?.();
    };
    const step = (d) => show((cur + d + lbItems.length) % lbItems.length);

    const openWork = (w) => {
      const els = [...document.querySelectorAll(".work:not(.hide)")];
      openLightbox(els.map((el) => {
        const g = gallery[+el.dataset.i];
        return { url: g.image_url, title: g.title, desc: g.description };
      }), els.indexOf(w));
    };
    $("#galleryGrid").addEventListener("click", (e) => {
      const w = e.target.closest(".work");
      if (w) openWork(w);
    });
    $("#galleryGrid").addEventListener("keydown", (e) => {
      const w = e.target.closest(".work");
      if (w && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openWork(w); }
    });
    $("#projectsGrid").addEventListener("click", (e) => {
      const c = e.target.closest(".p-cover");
      if (!c) return;
      const p = C.projects[+c.dataset.p];
      const imgs = p.images || [];
      openLightbox(imgs.map((im, k) => ({
        url: safeUrl(im.url),
        title: p.title,
        desc: [im.caption, imgs.length > 1 ? `${k + 1} / ${imgs.length}` : ""].filter(Boolean).join(" · "),
      })));
    });
    $("#lbClose").addEventListener("click", close);
    $("#lbNext").addEventListener("click", () => step(1));
    $("#lbPrev").addEventListener("click", () => step(-1));
    lb.addEventListener("click", (e) => { if (e.target === lb) close(); });
    document.addEventListener("keydown", (e) => {
      if (lb.hidden) return;
      if (e.key === "Escape") close();
      // إبقاء التنقل بـ Tab داخل نافذة العرض
      if (e.key === "Tab") {
        const f = [...lb.querySelectorAll("button")].filter((b) => !b.hidden);
        const idx = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(idx + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
      // RTL: السهم الأيسر = التالي
      if (e.key === "ArrowLeft") step(1);
      if (e.key === "ArrowRight") step(-1);
    });

    // Copy email
    const toast = $("#toast");
    const showToast = (msg) => {
      toast.textContent = msg;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2200);
    };
    $("#copyEmail").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(C.socials.email);
        showToast("تم نسخ البريد الإلكتروني ✓");
      } catch {
        showToast(C.socials.email);
      }
    });
  }
})();
