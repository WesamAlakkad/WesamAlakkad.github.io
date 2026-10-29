// طبقة البيانات المشتركة بين الموقع ولوحة التحكم
window.SiteData = (() => {
  const cfg = window.SITE_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const client = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const bucket = cfg.BUCKET || "works";

  const clone = (o) => JSON.parse(JSON.stringify(o));

  // دمج المحتوى المحفوظ فوق الافتراضي حتى لا تنكسر الصفحة إذا أُضيف حقل جديد لاحقاً
  function merge(base, over) {
    if (Array.isArray(base) || Array.isArray(over)) return over ?? base;
    if (base && typeof base === "object" && over && typeof over === "object") {
      const out = { ...base };
      for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
      return out;
    }
    return over ?? base;
  }

  const withTimeout = (p, ms) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

  async function loadContent() {
    const def = clone(window.DEFAULT_CONTENT);
    if (!client) return def;
    try {
      const { data, error } = await withTimeout(
        client.from("site_content").select("data").eq("id", 1).maybeSingle(), 4000
      );
      if (error) throw error;
      return data ? merge(def, data.data) : def;
    } catch (e) {
      console.warn("تعذّر تحميل المحتوى من Supabase، يتم عرض المحتوى الافتراضي.", e);
      return def;
    }
  }

  async function saveContent(content) {
    const { error } = await client
      .from("site_content")
      .upsert({ id: 1, data: content, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async function loadGallery() {
    if (!client) return [];
    try {
      const { data, error } = await withTimeout(
        client.from("gallery").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false }), 4000
      );
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("تعذّر تحميل المعرض.", e);
      return [];
    }
  }

  function publicUrl(path) {
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  async function uploadFile(file, folder) {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await client.storage.from(bucket).upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type || undefined,
    });
    if (error) throw error;
    return { path, url: publicUrl(path) };
  }

  async function removeFile(path) {
    if (!path) return;
    const { error } = await client.storage.from(bucket).remove([path]);
    if (error) throw error;
  }

  // ---------- عدّاد الزيارات ----------
  // بلا Cookies وبلا عنوان IP: معرّف عشوائي في المتصفح + المصدر + نوع الجهاز + المنطقة الزمنية
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} },
  };
  const SESSION_MS = 30 * 60 * 1000;

  const isExcluded = () => store.get("v_exclude") === "1";
  const setExcluded = (on) => (on ? store.set("v_exclude", "1") : store.del("v_exclude"));

  async function trackVisit() {
    if (!client) return;
    try {
      const host = location.hostname;
      if (!host || host === "localhost" || host === "127.0.0.1" || location.protocol === "file:") return;
      if (navigator.webdriver || /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|linkedin|discord/i.test(navigator.userAgent)) return;
      const params = new URLSearchParams(location.search);
      if (params.has("notrack")) setExcluded(true);
      if (isExcluded()) return;

      // تحديثات الصفحة خلال نصف ساعة تُعدّ زيارة واحدة
      const now = Date.now();
      const last = +store.get("v_last") || 0;
      store.set("v_last", String(now));
      if (now - last < SESSION_MS) return;

      let id = store.get("v_id");
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + now.toString(36));
        store.set("v_id", id);
      }
      // ?ref=cv في الرابط يحدد المصدر يدوياً (مفيد لرابط السيرة الذاتية مثلاً)
      let source = params.get("ref") || params.get("utm_source") || "";
      if (!source && document.referrer) {
        try {
          const r = new URL(document.referrer);
          if (r.hostname !== host) source = r.hostname.replace(/^www\./, "");
        } catch {}
      }
      const ua = navigator.userAgent;
      const device = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? "tablet"
        : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";

      await client.from("visits").insert({
        visitor: id.slice(0, 40),
        source: source.slice(0, 100),
        device,
        lang: (navigator.language || "").slice(0, 20),
        tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || "").slice(0, 60),
      });
    } catch {
      // الإحصائيات يجب ألا تعطل الموقع أبداً
    }
  }

  async function visitCount() {
    if (!client) return null;
    const { data, error } = await client.rpc("visit_count");
    return error ? null : data;
  }

  return { client, configured, bucket, clone, merge, loadContent, saveContent, loadGallery, uploadFile, removeFile, publicUrl,
    trackVisit, visitCount, isExcluded, setExcluded };
})();

// تحويل النص البسيط إلى HTML آمن: **غامق** و ==مظلل==
window.richText = (s = "") =>
  String(s)
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/==(.+?)==/g, "<mark>$1</mark>");

window.esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
