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

  return { client, configured, bucket, clone, merge, loadContent, saveContent, loadGallery, uploadFile, removeFile, publicUrl };
})();

// تحويل النص البسيط إلى HTML آمن: **غامق** و ==مظلل==
window.richText = (s = "") =>
  String(s)
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/==(.+?)==/g, "<mark>$1</mark>");

window.esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
