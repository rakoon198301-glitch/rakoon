// datahub.js
export const DataHub = (() => {
  const FETCH_OPTS = { cache: "no-store" };
  const DEFAULT_TIMEOUT_MS = 15000;

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') {
          field += '"'; i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === "," && !inQuotes) {
        row.push(field); field = "";
        continue;
      }

      if (ch === "\n" && !inQuotes) {
        row.push(field); field = "";
        rows.push(row.map(v => (v ?? "").replace(/\r/g, "")));
        row = [];
        continue;
      }

      field += ch;
    }

    if (field.length || row.length) {
      row.push(field);
      rows.push(row.map(v => (v ?? "").replace(/\r/g, "")));
    }

    return rows.filter(r => r.some(c => String(c ?? "").trim() !== ""));
  }

  function withTimeout(promiseFactory, ms = DEFAULT_TIMEOUT_MS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return (async () => {
      try {
        return await promiseFactory(ctrl.signal);
      } finally {
        clearTimeout(t);
      }
    })();
  }

  async function fetchText(url, signal) {
    const bust = Date.now();
    const u = url + (url.includes("?") ? "&" : "?") + "t=" + bust;
    const res = await fetch(u, { ...FETCH_OPTS, signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }

  function normalizeRegistry(rows) {
    const body = rows.slice(1);
    return body
      .map(r => ({
        enabled: String(r[0] ?? "").trim(),
        key: String(r[1] ?? "").trim(),
        name: String(r[2] ?? "").trim(),
        url: String(r[3] ?? "").trim(),
      }))
      .filter(x => x.key && x.url)
      .filter(x => x.enabled === "1" || x.enabled.toLowerCase() === "true");
  }

  function cacheKey(registryUrl) {
    return "NKG_DATAHUB_CACHE::" + registryUrl;
  }

  function saveCache(registryUrl, payload) {
    localStorage.setItem(cacheKey(registryUrl), JSON.stringify(payload));
  }

  function loadCache(registryUrl) {
    try {
      const raw = localStorage.getItem(cacheKey(registryUrl));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async function loadAll(registryUrl, onProgress) {
    onProgress?.({ phase: "registry", status: "loading" });

    let regText;
    try {
      regText = await withTimeout((signal) => fetchText(registryUrl, signal), 12000);
    } catch (e) {
      onProgress?.({ phase: "registry", status: "error", error: e });
      const cached = loadCache(registryUrl);
      if (cached) {
        onProgress?.({ phase: "registry", status: "cached" });
        return cached;
      }
      throw e;
    }

    const regRows = parseCsv(regText);
    const sources = normalizeRegistry(regRows);

    onProgress?.({ phase: "registry", status: "ok", count: sources.length });

    const result = {
      meta: {
        registryUrl,
        loadedAt: new Date().toISOString(),
        sourceCount: sources.length,
      },
      sources: {}, // key -> {enabled,key,name,url,rows}
      status: {},  // key -> {ok, rows|error}
    };

    await Promise.allSettled(
      sources.map(async (s) => {
        onProgress?.({ phase: "source", key: s.key, name: s.name, status: "loading" });

        try {
          const text = await withTimeout((signal) => fetchText(s.url, signal), 15000);
          const rows = parseCsv(text);
          result.sources[s.key] = { ...s, rows };
          result.status[s.key] = { ok: true, rows: rows.length };
          onProgress?.({ phase: "source", key: s.key, name: s.name, status: "ok", rows: rows.length });
        } catch (e) {
          result.sources[s.key] = { ...s, rows: [] };
          result.status[s.key] = { ok: false, error: String(e?.message || e) };
          onProgress?.({ phase: "source", key: s.key, name: s.name, status: "error", error: e });
        }
      })
    );

    saveCache(registryUrl, result);
    return result;
  }

  return { loadAll };
})();
