/* ============================================================
   index.js (Dashboard - Shipping)
   - daily: 출고 누계(올해), 월별 누계(올해 1~12), 출고정보(오늘~+6)
   - sap_doc: 출고 요약(오늘, 수출 작업의뢰서만)
   - 자동 새로고침 없음
   - 상단바: 시계 + 풀스크린만
============================================================ */

const URL_DAILY =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=430924108&single=true&output=csv";

const URL_SAP_DOC =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=1210262064&single=true&output=csv";

const fmt = new Intl.NumberFormat("ko-KR");

function $(id) { return document.getElementById(id); }
function norm(v) { return String(v ?? "").replace(/\r/g, "").trim(); }
function normNoSpace(v){ return norm(v).replace(/\s+/g, ""); }

function toNum(v) {
  const s = String(v ?? "").replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// KST YYYY-MM-DD
const KST_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function getKRYMD(offsetDays = 0) {
  return KST_FMT.format(new Date(Date.now() + offsetDays * 86400_000));
}
function getKRY(){ return getKRYMD(0).slice(0,4); }

// 날짜 문자열 → YYYY-MM-DD
function toYMD(s) {
  s = norm(s);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;

  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;

  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const year = getKRY();
    return `${year}-${String(m[1]).padStart(2,"0")}-${String(m[2]).padStart(2,"0")}`;
  }
  return s;
}

async function fetchText(url) {
  const res = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache:"no-store" });
  if (!res.ok) throw new Error("CSV 로딩 실패: HTTP " + res.status);
  return await res.text();
}

// CSV 파서
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) { row.push(field); field = ""; continue; }
    if (ch === "\n" && !inQuotes) {
      row.push(field); field = "";
      rows.push(row.map(v => (v ?? "").replace(/\r/g,"")));
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row.map(v => (v ?? "").replace(/\r/g,"")));
  }
  return rows;
}

/* =========================
   시간/상태
========================= */
function parseKoreanTime(s) {
  s = norm(s);
  if (!s) return null;

  let m = s.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (m) return { h:Number(m[1]), m:Number(m[2]) };

  m = s.match(/(\d{1,2})\s*시\s*(\d{1,2})?\s*분?/);
  if (m) return { h:Number(m[1]), m:Number(m[2] ?? 0) };

  m = s.match(/^(\d{1,2})$/);
  if (m) return { h:Number(m[1]), m:0 };

  return null;
}

function getNowKSTMinutes() {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone:"Asia/Seoul", hour:"2-digit", minute:"2-digit", hour12:false
  }).formatToParts(new Date());

  const hh = Number(parts.find(p => p.type==="hour")?.value ?? 0);
  const mm = Number(parts.find(p => p.type==="minute")?.value ?? 0);
  return hh*60 + mm;
}

function getStatusByTime(planTimeStr) {
  const t = parseKoreanTime(planTimeStr);
  if (!t) return "미정";
  const plan = t.h*60 + t.m;
  const now = getNowKSTMinutes();

  if (now < plan) return "상차대기";
  if (now <= plan + 10) return "상차중";
  return "상차완료";
}

function contRank(v) {
  const s = norm(v).toUpperCase();
  if (s.includes("20")) return 0;
  if (s.includes("40")) return 1;
  if (s.includes("LCL")) return 2;
  return 9;
}
function timeToMin(v) {
  const t = parseKoreanTime(v);
  if (!t) return 9999;
  return t.h*60 + t.m;
}

/* ============================================================
   1) 출고 누계 (올해 전체) - daily
   tbody id="ship_total_tbody"
   - 날짜 A(0) 기준 올해만
   - I(8), J(9), L(11)
============================================================ */
async function renderShipTotalAllYear() {
  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  const COL_DATE = 0; // A
  const COL_20 = 8;   // I
  const COL_40 = 9;   // J
  const COL_LCL = 11; // L

  const year = getKRY();
  let s20=0, s40=0, sl=0;

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.includes("날짜") || d==="A") continue;
    if (d.slice(0,4) !== year) continue;

    s20 += toNum(r?.[COL_20]);
    s40 += toNum(r?.[COL_40]);
    sl  += toNum(r?.[COL_LCL]);
  }

  const total = s20+s40+sl;

  const tb = $("ship_total_tbody");
  if (!tb) return;

  tb.innerHTML = `
    <tr>
      <td class="cut">전체</td>
      <td class="num">${fmt.format(s20)}</td>
      <td class="num">${fmt.format(s40)}</td>
      <td class="num">${fmt.format(sl)}</td>
      <td class="num">${fmt.format(total)}</td>
    </tr>
  `;
}

/* ============================================================
   2) 출고 요약 (오늘, 전체) - sap_doc
   tbody id="ship_today_tbody"
   - 오늘 날짜 필터: 기본 D(3) 사용 + "자동탐색" 보정
   - P열(15): 수출 작업의뢰서만 (공백 제거 후 포함)
   - 인보이스 A(0), 국가 E(4), 컨테이너 J(9),
     상차위치 Q(16), 상차시간 T(19)
   - 정렬: 20 → 40 → LCL, 시간 오름차순
============================================================ */
async function renderShipTodayAll() {
  const text = await fetchText(URL_SAP_DOC);
  const rows = parseCsv(text);

  const today = getKRYMD(0);

  const COL_INV = 0;        // A
  const COL_COUNTRY = 4;    // E
  const COL_CONT = 9;       // J
  const COL_KIND = 15;      // P
  const COL_LOC = 16;       // Q
  const COL_TIME = 19;      // T

  // ✅ 출고일 컬럼: 기본 D(3)
  let COL_SHIP_DATE = 3;

  // ✅ 혹시 D가 아닐 경우 대비: "오늘 날짜"가 들어있는 컬럼을 자동탐색 (B~F 정도만)
  // (데이터가 많아도 1회만 판단)
  const sample = rows.slice(0, 80);
  let bestCol = COL_SHIP_DATE, bestHit = 0;
  for (const c of [1,2,3,4,5]) {
    let hit = 0;
    for (const r of sample) {
      const d = toYMD(r?.[c]);
      if (d === today) hit++;
    }
    if (hit > bestHit) { bestHit = hit; bestCol = c; }
  }
  if (bestHit > 0) COL_SHIP_DATE = bestCol;

  const data = [];

  for (const r of rows) {
    const inv = norm(r?.[COL_INV]);
    if (!inv || inv.includes("인보") || inv === "A") continue;

    const shipDate = toYMD(r?.[COL_SHIP_DATE]);
    if (shipDate !== today) continue;

    // ✅ P열 필터 (공백 제거하고 포함 검사)
    const kind = normNoSpace(r?.[COL_KIND]);
    if (!kind.includes("수출작업의뢰서")) continue;

    const country = norm(r?.[COL_COUNTRY]);
    const cont = norm(r?.[COL_CONT]);
    const loc = norm(r?.[COL_LOC]);
    const time = norm(r?.[COL_TIME]);
    const status = getStatusByTime(time);

    data.push({
      inv, country, cont, loc, time, status,
      _rank: contRank(cont),
      _tmin: timeToMin(time)
    });
  }

  data.sort((a,b) => (a._rank - b._rank) || (a._tmin - b._tmin));

  const tb = $("ship_today_tbody");
  if (!tb) return;

  if (data.length === 0) {
    tb.innerHTML = `<tr><td colspan="6" class="muted">오늘 출고 없음</td></tr>`;
    return;
  }

  tb.innerHTML = data.map(x => {
    const isLoading = x.status === "상차중";
    const rowCls = isLoading ? "bg-yellow-50" : "";
    const boldCls = isLoading ? "font-extrabold" : "";

    const stCls =
      x.status === "상차중" ? "text-amber-700 font-extrabold" :
      x.status === "상차대기" ? "text-slate-600 font-extrabold" :
      "text-emerald-700 font-extrabold";

    return `
      <tr class="${rowCls}">
        <td class="cut ${boldCls}">${x.inv}</td>
        <td class="cut ${boldCls}">${x.country || "-"}</td>
        <td class="cut ${boldCls}">${x.cont || "-"}</td>
        <td class="cut ${boldCls}">${x.loc || "-"}</td>
        <td class="cut ${boldCls}">${x.time || "-"}</td>
        <td class="cut ${stCls}">${x.status}</td>
      </tr>
    `;
  }).join("");
}

/* ============================================================
   3) 월별 출고 누계 (올해 1~12월) - daily
   tbody id="ship_monthly_tbody"
============================================================ */
async function renderShipMonthlyYearJanToDec() {
  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  const COL_DATE = 0; // A
  const COL_20 = 8;   // I
  const COL_40 = 9;   // J
  const COL_LCL = 11; // L

  const year = getKRY();
  const map = new Map(); // "01".."12" -> sums

  for (let m=1; m<=12; m++){
    const mm = String(m).padStart(2,"0");
    map.set(mm, { pt20:0, pt40:0, lcl:0 });
  }

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.includes("날짜") || d==="A") continue;
    if (d.slice(0,4) !== year) continue;

    const mm = d.slice(5,7);
    const o = map.get(mm);
    if (!o) continue;

    o.pt20 += toNum(r?.[COL_20]);
    o.pt40 += toNum(r?.[COL_40]);
    o.lcl  += toNum(r?.[COL_LCL]);
  }

  const tb = $("ship_monthly_tbody");
  if (!tb) return;

  tb.innerHTML = Array.from(map.entries()).map(([mm, o]) => {
    const total = o.pt20 + o.pt40 + o.lcl;
    return `
      <tr>
        <td class="cut">${Number(mm)}월</td>
        <td class="num">${fmt.format(o.pt20)}</td>
        <td class="num">${fmt.format(o.pt40)}</td>
        <td class="num">${fmt.format(o.lcl)}</td>
        <td class="num">${fmt.format(total)}</td>
      </tr>
    `;
  }).join("");
}

/* ============================================================
   4) 출고정보 (오늘 ~ 미래 6일, 총 7일) - daily
   tbody id="ship_7days_tbody"
============================================================ */
async function renderShip7DaysFuture() {
  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  const COL_DATE = 0; // A
  const COL_20 = 8;   // I
  const COL_40 = 9;   // J
  const COL_LCL = 11; // L

  const days = [];
  for (let i=0; i<7; i++) days.push(getKRYMD(i));

  const map = new Map();
  for (const d of days) map.set(d, { pt20:0, pt40:0, lcl:0 });

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.includes("날짜") || d==="A") continue;
    if (!map.has(d)) continue;

    const o = map.get(d);
    o.pt20 += toNum(r?.[COL_20]);
    o.pt40 += toNum(r?.[COL_40]);
    o.lcl  += toNum(r?.[COL_LCL]);
  }

  const tb = $("ship_7days_tbody");
  if (!tb) return;

  tb.innerHTML = days.map(d => {
    const o = map.get(d) || { pt20:0, pt40:0, lcl:0 };
    const total = o.pt20 + o.pt40 + o.lcl;
    const label = `${d.slice(5,7)}-${d.slice(8,10)}`; // MM-DD

    return `
      <tr>
        <td class="cut">${label}</td>
        <td class="num">${fmt.format(o.pt20)}</td>
        <td class="num">${fmt.format(o.pt40)}</td>
        <td class="num">${fmt.format(o.lcl)}</td>
        <td class="num">${fmt.format(total)}</td>
      </tr>
    `;
  }).join("");
}

/* ============================================================
   5) 상단바: 시계 + 풀스크린
============================================================ */
function initTopBarClockAndFullscreen() {
  const clockEl = $("boardClock");
  const fsBtn = $("btnFullscreen");

  const KST_TIME_FMT = new Intl.DateTimeFormat("ko-KR", {
    timeZone:"Asia/Seoul", hour:"2-digit", minute:"2-digit", second:"2-digit"
  });

  function tick() {
    if (clockEl) clockEl.textContent = KST_TIME_FMT.format(new Date());
  }
  tick();
  setInterval(tick, 1000);

  if (fsBtn) {
    fsBtn.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch(e) {
        console.warn("fullscreen failed:", e);
      }
    });
  }
}

/* ============================================================
   실행
============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    initTopBarClockAndFullscreen();

    await renderShipTotalAllYear();          // ✅ 올해 누계
    await renderShipTodayAll();              // ✅ 오늘 출고 요약
    await renderShipMonthlyYearJanToDec();   // ✅ 올해 1~12월
    await renderShip7DaysFuture();           // ✅ 오늘~미래6일(7줄)
  } catch (e) {
    console.error("index.js error:", e);
  }
});
