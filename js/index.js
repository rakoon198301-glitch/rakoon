// =========================
// js/index.js
// - 출고 누계: daily (전체합)
// - 출고 요약: sap_doc (오늘 전체)
// - 상차중: 연노랑 강조 + 글자 굵게
// =========================

// ✅ CSV URL
const URL_DAILY =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=430924108&single=true&output=csv";

const URL_SAP_DOC =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=1210262064&single=true&output=csv";

// ✅ DOM
const $ = (id) => document.getElementById(id);

// ✅ util
function norm(v) {
  return String(v ?? "").replace(/\r/g, "").trim();
}
function toNum(v) {
  const s = String(v ?? "").replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
const fmt = new Intl.NumberFormat("ko-KR");

// ✅ KST YYYY-MM-DD
const KST_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function getKRYMD(offsetDays = 0) {
  return KST_YMD.format(new Date(Date.now() + offsetDays * 86400_000));
}

// ✅ KST 현재 시각(시/분 비교)
function getKSTNowParts() {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (t) => parts.find((p) => p.type === t)?.value ?? "00";
  return { hh: Number(get("hour")), mm: Number(get("minute")) };
}

// ✅ CSV fetch + parse
async function fetchText(url) {
  const u = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) throw new Error("CSV 로딩 실패: HTTP " + res.status);
  return await res.text();
}

// 따옴표/콤마/줄바꿈 대응
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if (ch === "\n" && !inQuotes) {
      row.push(field);
      rows.push(row.map((v) => (v ?? "").replace(/\r/g, "")));
      row = [];
      field = "";
      continue;
    }

    field += ch;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row.map((v) => (v ?? "").replace(/\r/g, "")));
  }
  return rows;
}

// ✅ 날짜 문자열 → YYYY-MM-DD로 최대한 정규화
function toYMD(s) {
  s = norm(s);
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;

  return s;
}

// ✅ "07시" / "07:00" / "7" 등 파싱 → {h,m} or null
function parseKoreanTime(s) {
  s = norm(s);
  if (!s) return null;

  // "07시 30분"
  let m = s.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (m) return { h: Number(m[1]), m: Number(m[2] ?? 0) };

  // "07:30"
  m = s.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (m) return { h: Number(m[1]), m: Number(m[2]) };

  // "07" / "7"
  m = s.match(/\b(\d{1,2})\b/);
  if (m) return { h: Number(m[1]), m: 0 };

  return null;
}

// ✅ 상태: 상차대기 / 상차중 / 지연
function getStatusByTime(timeStr) {
  const t = parseKoreanTime(timeStr);
  if (!t) return "상차대기";

  const now = getKSTNowParts();
  const nowMin = now.hh * 60 + now.mm;
  const tarMin = t.h * 60 + t.m;

  const diff = nowMin - tarMin;
  if (diff < 0) return "상차대기";
  if (diff >= 0 && diff <= 10) return "상차중";
  return "지연";
}

// =========================
// 1) 출고 누계 (daily) - 전체합
// tbody id="ship_total_tbody"
// =========================
async function renderShipTotal() {
  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  let sum20 = 0, sum40 = 0, sumLcl = 0;

  for (const r of rows) {
    sum20 += toNum(r?.[8]);   // I
    sum40 += toNum(r?.[9]);   // J
    sumLcl += toNum(r?.[11]); // L
  }
  const total = sum20 + sum40 + sumLcl;

  const tb = $("ship_total_tbody");
  if (!tb) return;

  tb.innerHTML = `
    <tr>
      <td class="cut">전체</td>
      <td class="num">${fmt.format(sum20)}</td>
      <td class="num">${fmt.format(sum40)}</td>
      <td class="num">${fmt.format(sumLcl)}</td>
      <td class="num">${fmt.format(total)}</td>
    </tr>
  `;
}

// =========================
// 2) 출고 요약 (sap_doc) - 오늘 전체
// tbody id="ship_today_tbody"
// - 오늘 판단: 출고일 D열(index 3)
// - 표시: A/E/J/T
// - 상차중: 연노랑 + 글자굵게
// =========================
async function renderShipToday() {
  const text = await fetchText(URL_SAP_DOC);
  const rows = parseCsv(text);

  const today = getKRYMD(0);

  // sap_doc 컬럼
  const COL_INV = 0;    // A
  const COL_SHIP_DATE = 3; // ✅ D(출고일) - 오늘 필터
  const COL_COUNTRY = 4; // E
  const COL_CONT = 9;    // J
  const COL_TIME = 19;   // T

  const data = [];

  for (const r of rows) {
    const inv = norm(r?.[COL_INV]);
    if (!inv || inv.includes("인보") || inv === "A") continue;

    const shipDate = toYMD(r?.[COL_SHIP_DATE]);
    if (shipDate !== today) continue; // ✅ 오늘만

    const country = norm(r?.[COL_COUNTRY]);
    const cont = norm(r?.[COL_CONT]);
    const time = norm(r?.[COL_TIME]);

    const status = getStatusByTime(time);

    data.push({ inv, country, cont, time, status });
  }

  const tb = $("ship_today_tbody");
  if (!tb) return;

  if (data.length === 0) {
    tb.innerHTML = `<tr><td colspan="5" class="muted">오늘 출고 없음</td></tr>`;
    return;
  }

  tb.innerHTML = data.map(x => {
    const isLoading = x.status === "상차중";
    const rowCls = isLoading ? "bg-yellow-50" : "";
    const stCls =
      x.status === "상차중" ? "text-amber-700 font-extrabold" :
      x.status === "지연" ? "text-rose-700 font-extrabold" :
      "text-slate-600 font-extrabold";

    return `
      <tr class="${rowCls}">
        <td class="cut ${isLoading ? "font-extrabold" : ""}">${x.inv}</td>
        <td class="cut ${isLoading ? "font-extrabold" : ""}">${x.country || "-"}</td>
        <td class="cut ${isLoading ? "font-extrabold" : ""}">${x.cont || "-"}</td>
        <td class="cut ${isLoading ? "font-extrabold" : ""}">${x.time || "-"}</td>
        <td class="cut ${stCls}">${x.status}</td>
      </tr>
    `;
  }).join("");
}

// =========================
// Run
// =========================
(async () => {
  try {
    await renderShipTotal();
    await renderShipToday();
  } catch (e) {
    console.error("index.js error:", e);
  }
})();
