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

  // ✅ cache-bust는 fetch에만 사용 (항상 최신)
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

  // ✅ registryUrl이 &t=... 로 넘어와도 캐시 키는 고정되게 정규화
  function normalizeCacheUrl(url) {
    try {
      const u = new URL(String(url));
      u.searchParams.delete("t");
      u.searchParams.delete("_ts");
      u.searchParams.delete("cache");
      return u.toString();
    } catch {
      // URL 파싱이 안되면 문자열에서 대충 제거(최후)
      return String(url).replace(/([?&])(t|_ts|cache)=[^&]*/g, "$1").replace(/[?&]$/, "");
    }
  }

  function cacheKey(registryUrl) {
    return "NKG_DATAHUB_CACHE::" + normalizeCacheUrl(registryUrl);
  }

  function clearNkgCache() {
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith("NKG_DATAHUB_CACHE::")) localStorage.removeItem(k);
      }
    } catch {}
  }

  function saveCache(registryUrl, payload) {
    const key = cacheKey(registryUrl);
    const value = JSON.stringify(payload);

    try {
      localStorage.setItem(key, value);
      return;
    } catch (e) {
      // ✅ quota 초과면 NKG 캐시만 비우고 1회 재시도
      const msg = String(e?.message || e);
      if (msg.includes("exceeded the quota") || msg.includes("QuotaExceededError")) {
        clearNkgCache();
        try {
          localStorage.setItem(key, value);
          return;
        } catch (e2) {
          console.warn("DataHub cache save failed even after cleanup:", e2);
          return; // 캐시 저장 실패해도 로딩은 계속
        }
      }
      console.warn("DataHub cache save failed:", e);
    }
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
        registryUrl: normalizeCacheUrl(registryUrl), // 메타에도 정규화된 값
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
