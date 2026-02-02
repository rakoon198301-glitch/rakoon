// =========================
// index.js — Dashboard (출고)
// =========================

// ===== CSV URL =====
const URL_DAILY =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=430924108&single=true&output=csv";

const URL_SAP_ITEM =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=1124687656&single=true&output=csv";

// ===== DOM =====
const $ = (id) => document.getElementById(id);

// ===== Utils =====
function norm(v) {
  return String(v ?? "").replace(/\r/g, "").trim();
}
function toNum(v) {
  const s = String(v ?? "").replace(/,/g, "").replace(/[^\d.-]/g, "");
  return Number(s) || 0;
}
const fmt = new Intl.NumberFormat("ko-KR");

// ===== KST Date =====
const KST_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function getToday() {
  return KST_FMT.format(new Date());
}
function getNowKST() {
  const p = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(p.find(x => x.type === "hour").value);
  const m = Number(p.find(x => x.type === "minute").value);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// ===== CSV Loader =====
async function loadCsv(url) {
  const res = await fetch(url + "&t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("CSV load fail");
  return parseCsv(await res.text());
}
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQ && text[i + 1] === '"') { field += '"'; i++; }
      else inQ = !inQ;
      continue;
    }
    if (c === "," && !inQ) { row.push(field); field = ""; continue; }
    if (c === "\n" && !inQ) {
      row.push(field); rows.push(row); row = []; field = ""; continue;
    }
    field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ===== 출고 누계 (전체) =====
async function renderShipTotal() {
  const rows = await loadCsv(URL_DAILY);
  let a = 0, b = 0, c = 0;

  for (const r of rows) {
    a += toNum(r?.[8]);   // I
    b += toNum(r?.[9]);   // J
    c += toNum(r?.[11]);  // L
  }

  const tb = $("ship_total_tbody");
  if (!tb) return;

  tb.innerHTML = `
    <tr>
      <td>전체</td>
      <td class="num">${fmt.format(a)}</td>
      <td class="num">${fmt.format(b)}</td>
      <td class="num">${fmt.format(c)}</td>
      <td class="num">${fmt.format(a + b + c)}</td>
    </tr>`;
}

// ===== 상차 시간 파싱 =====
function parseTime(v) {
  v = norm(v);
  let m = v.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if (!m) return null;
  return { h: +m[1], m: +(m[2] || 0) };
}
function getStatus(t) {
  const p = parseTime(t);
  if (!p) return "상차대기";
  const now = getNowKST();
  const base = new Date(now);
  base.setHours(p.h, p.m, 0, 0);
  const diff = (now - base) / 60000;
  if (diff < 0) return "상차대기";
  if (diff <= 10) return "상차중";
  return "지연";
}

// ===== 출고 요약 (오늘 전체 + 수출 작업의뢰서) =====
async function renderShipToday() {
  const rows = await loadCsv(URL_SAP_ITEM);
  const today = getToday();

  const data = rows.filter(r =>
    norm(r?.[1]) &&                     // B 인보이스
    norm(r?.[4]).includes(today) &&     // E 날짜 (확정)
    norm(r?.[15]) === "수출 작업의뢰서" // P
  );

  const tb = $("ship_today_tbody");
  if (!tb) return;

  if (!data.length) {
    tb.innerHTML = `<tr><td colspan="5" class="muted">오늘 출고 없음</td></tr>`;
    return;
  }

  tb.innerHTML = data.map(r => `
    <tr>
      <td>${norm(r[1])}</td>
      <td>${norm(r[5])}</td>
      <td>${norm(r[16])}</td>
      <td>${norm(r[26])}</td>
      <td class="font-extrabold">${getStatus(r[26])}</td>
    </tr>
  `).join("");
}

// ===== Run =====
(async () => {
  try {
    await renderShipTotal();
    await renderShipToday();
  } catch (e) {
    console.error(e);
  }
})();
