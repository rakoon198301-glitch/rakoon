// js/index.js
// =====================================================
// ✅ NKG Dashboard (HTML 무수정) - index.js 교체본
// - 출고 누계(전체): daily CSV 전체 합계 → #ship_total_tbody
// - 출고 요약(당일): sap_doc 오늘 날짜 전체 → #ship_today_tbody
//   · 컨테이너 정렬: 20 → 40 → LCL
//   · 동일 컨테이너 내 시간 오름차순
//   · 상태: (현재KST 기준)
//       - 현재 < 상차시간  => 상차대기
//       - 상차시간 <= 현재 < 상차시간+2h => 상차중 (행 강조)
//       - 현재 >= 상차시간+2h => 상차완료
// - 월별 출고 누계(1~12월): daily CSV 월별 합계 → #ship_monthly_tbody
// - 출고정보(오늘+미래6일=7일): daily CSV 날짜별 합계 → #ship_7days_tbody
// - 보수(당월/다음달): 예상(sap_item T합) / 완료(bosu: J=완료, F합) / 잔량 → #bosu_month_tbody
// - 설비(당월/다음달): daily F합 / 작업일 / 평균 → #system_month_tbody
// - 작업장별 전체누계: daily D/E/F합 & 평균 → #workplace_total_tbody
// =====================================================

/* =========================
   ✅ CSV URL
========================= */
const URL_DAILY =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=430924108&single=true&output=csv";

const URL_SAP_DOC =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=1210262064&single=true&output=csv";

const URL_SAP_ITEM =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=1124687656&single=true&output=csv";

const URL_BOSU =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=617786742&single=true&output=csv";

/* =========================
   ✅ DOM Helper
========================= */
const $ = (id) => document.getElementById(id);

/* =========================
   ✅ Formatting / Utils
========================= */
const fmtKR = new Intl.NumberFormat("ko-KR");

function norm(v) {
  return String(v ?? "").replace(/\r/g, "").trim();
}
function normNoSpace(v) {
  return norm(v).replace(/\s+/g, "");
}
function toNum(v) {
  const s = String(v ?? "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/* =========================
   ✅ KST Date/Time
========================= */
const KST_YMD_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function getKRYMD(offsetDays = 0) {
  return KST_YMD_FMT.format(new Date(Date.now() + offsetDays * 86400_000));
}
function getKSTNowParts() {
  // KST 기준 현재 시/분
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  const hh = Number(parts.hour ?? "0");
  const mm = Number(parts.minute ?? "0");
  return { hh, mm, nowMin: hh * 60 + mm };
}

// 날짜 문자열 → YYYY-MM-DD 로 최대한 정규화
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

  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const year = getKRYMD(0).slice(0, 4);
    return `${year}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }

  return s;
}

function ymFromYMD(ymd) {
  return ymd ? ymd.slice(0, 7) : "";
}
function shiftYM(ym, diff) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1 + diff, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}
function monthLabel(ym) {
  return `${Number(ym.slice(5, 7))}월`;
}

/* =========================
   ✅ Time Parse / Status
========================= */
function timeToMin(timeStr) {
  const s = norm(timeStr);
  if (!s || s === "-") return 99999;

  // "07시", "7시", "07:10", "7:10", "0710" 등 대응
  let m = s.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2] ?? "0");
    if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm;
  }

  // "0700" 같은 케이스
  m = s.match(/^(\d{1,2})(\d{2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    return hh * 60 + mm;
  }

  // "07" 만 있으면 정시
  m = s.match(/^(\d{1,2})$/);
  if (m) return Number(m[1]) * 60;

  return 99999;
}

function getStatusByTime(timeStr) {
  const t = timeToMin(timeStr);
  if (t === 99999) return "미정";

  const { nowMin } = getKSTNowParts();
  if (nowMin < t) return "상차대기";
  if (nowMin < t + 120) return "상차중";
  return "상차완료";
}

function contRank(contStr) {
  const s = norm(contStr).toUpperCase();
  const head2 = s.replace(/[^0-9]/g, "").slice(0, 2);
  if (head2 === "20") return 0;
  if (head2 === "40") return 1;
  // LCL 또는 그 외
  if (s.includes("LCL")) return 2;
  return 3;
}

/* =========================
   ✅ CSV Fetch & Parse
========================= */
async function fetchText(url) {
  const u = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) throw new Error("CSV 로딩 실패: " + res.status);
  return await res.text();
}

// 따옴표/콤마/줄바꿈 처리 CSV 파서
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
      field = "";
      rows.push(row.map((v) => (v ?? "").replace(/\r/g, "")));
      row = [];
      continue;
    }

    field += ch;
  }

  // last line
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row.map((v) => (v ?? "").replace(/\r/g, "")));
  }

  return rows;
}

/* =====================================================
   1) 출고 누계(전체) - daily 전체 합
   - 20pt: I(8)
   - 40pt: J(9)
   - LCL : L(11)
===================================================== */
async function renderShipTotal() {
  const tb = $("ship_total_tbody");
  if (!tb) return;

  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  const COL_20 = 8;  // I
  const COL_40 = 9;  // J
  const COL_LCL = 11;// L

  let s20 = 0, s40 = 0, sL = 0;

  for (const r of rows) {
    // 헤더/빈줄 제거
    const a0 = norm(r?.[0]);
    if (!a0 || a0.includes("날짜") || a0 === "A") continue;

    s20 += toNum(r?.[COL_20]);
    s40 += toNum(r?.[COL_40]);
    sL  += toNum(r?.[COL_LCL]);
  }

  const total = s20 + s40 + sL;

  tb.innerHTML = `
    <tr>
      <td class="cut">전체</td>
      <td class="num">${fmtKR.format(s20)}</td>
      <td class="num">${fmtKR.format(s40)}</td>
      <td class="num">${fmtKR.format(sL)}</td>
      <td class="num font-extrabold">${fmtKR.format(total)}</td>
    </tr>
  `;
}

/* =====================================================
   2) 출고 요약(당일) - sap_doc 오늘 날짜 전체
   - 인보이스: A(0)
   - 국가:     E(4)
   - 컨테이너: J(9)
   - 상차위치: Q(16)
   - 상차시간: T(19)
   - 상태:     시간 기준 계산
   - 정렬: 컨테이너(20→40→LCL) + 시간 오름차순
===================================================== */
async function renderShipTodayAll() {
  const tb = $("ship_today_tbody");
  if (!tb) return;

  const text = await fetchText(URL_SAP_DOC);
  const rows = parseCsv(text);

  const today = getKRYMD(0);

  const COL_INV = 0;       // A
  const COL_COUNTRY = 4;   // E
  const COL_CONT = 9;      // J
  const COL_LOC = 16;      // Q
  const COL_TIME = 19;     // T

  // ✅ 출고일 컬럼 탐색 (대부분 D(3)지만, 혹시 다를 수 있어 자동탐색)
  let COL_SHIP_DATE = 3;
  const sample = rows.slice(0, 120);
  let bestCol = 3, bestHit = 0;

  // 1~7 정도만 훑어봄(성능/안정)
  for (const c of [1, 2, 3, 4, 5, 6, 7]) {
    let hit = 0;
    for (const r of sample) {
      const d = toYMD(r?.[c]);
      if (d === today) hit++;
    }
    if (hit > bestHit) {
      bestHit = hit;
      bestCol = c;
    }
  }
  if (bestHit > 0) COL_SHIP_DATE = bestCol;

  const data = [];

  for (const r of rows) {
    const inv = norm(r?.[COL_INV]);
    if (!inv || inv.includes("인보") || inv === "A") continue;

    const shipDate = toYMD(r?.[COL_SHIP_DATE]);
    if (shipDate !== today) continue;

    const country = norm(r?.[COL_COUNTRY]);
    const cont = norm(r?.[COL_CONT]);
    const loc = norm(r?.[COL_LOC]);
    const time = norm(r?.[COL_TIME]);

    const status = getStatusByTime(time);

    data.push({
      inv, country, cont, loc, time, status,
      _rank: contRank(cont),
      _tmin: timeToMin(time),
    });
  }

  data.sort((a, b) => (a._rank - b._rank) || (a._tmin - b._tmin));

  if (data.length === 0) {
    tb.innerHTML = `<tr><td colspan="6" class="muted">오늘 출고 없음</td></tr>`;
    return;
  }

  tb.innerHTML = data.map((x) => {
    const isLoading = x.status === "상차중";
    const rowCls = isLoading ? "bg-yellow-50" : "";
    const boldCls = isLoading ? "font-extrabold" : "";

    const stCls =
      x.status === "상차중" ? "text-amber-700 font-extrabold" :
      x.status === "상차대기" ? "text-slate-600 font-extrabold" :
      x.status === "상차완료" ? "text-emerald-700 font-extrabold" :
      "text-slate-500 font-extrabold";

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

/* =====================================================
   3) 월별 출고 누계(1~12월) - daily
   - 날짜: A(0)
   - 20pt: I(8), 40pt: J(9), LCL: L(11)
   - 현재년도 기준 우선(없으면 전체에서 월합)
===================================================== */
async function renderShipMonthly12() {
  const tb = $("ship_monthly_tbody");
  if (!tb) return;

  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  const COL_DATE = 0;  // A
  const COL_20 = 8;    // I
  const COL_40 = 9;    // J
  const COL_LCL = 11;  // L

  const yearNow = Number(getKRYMD(0).slice(0, 4));

  // 1) 올해 데이터만 먼저 모아보고
  const sumsThisYear = Array.from({ length: 13 }, () => ({ s20: 0, s40: 0, sL: 0, hit: 0 }));
  const sumsAll = Array.from({ length: 13 }, () => ({ s20: 0, s40: 0, sL: 0, hit: 0 }));

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.includes("날짜")) continue;

    const y = Number(d.slice(0, 4));
    const m = Number(d.slice(5, 7));
    if (!(m >= 1 && m <= 12)) continue;

    const v20 = toNum(r?.[COL_20]);
    const v40 = toNum(r?.[COL_40]);
    const vL  = toNum(r?.[COL_LCL]);

    sumsAll[m].s20 += v20;
    sumsAll[m].s40 += v40;
    sumsAll[m].sL  += vL;
    sumsAll[m].hit += 1;

    if (y === yearNow) {
      sumsThisYear[m].s20 += v20;
      sumsThisYear[m].s40 += v40;
      sumsThisYear[m].sL  += vL;
      sumsThisYear[m].hit += 1;
    }
  }

  // 올해 데이터가 하나라도 있으면 그걸 사용, 아니면 전체 사용
  const use = sumsThisYear.some((x, i) => i >= 1 && i <= 12 && x.hit > 0) ? sumsThisYear : sumsAll;

  tb.innerHTML = Array.from({ length: 12 }, (_, idx) => idx + 1).map((m) => {
    const s20 = use[m].s20;
    const s40 = use[m].s40;
    const sL = use[m].sL;
    const total = s20 + s40 + sL;

    return `
      <tr>
        <td class="cut">${m}월</td>
        <td class="num">${fmtKR.format(s20)}</td>
        <td class="num">${fmtKR.format(s40)}</td>
        <td class="num">${fmtKR.format(sL)}</td>
        <td class="num font-extrabold">${fmtKR.format(total)}</td>
      </tr>
    `;
  }).join("");
}

/* =====================================================
   4) 출고정보 (오늘 + 미래 6일 = 7일) - daily
   - 날짜: A(0)
   - 20pt: I(8), 40pt: J(9), LCL: L(11)
===================================================== */
async function renderShipNext7Days() {
  const tb = $("ship_7days_tbody");
  if (!tb) return;

  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  const COL_DATE = 0;  // A
  const COL_20 = 8;    // I
  const COL_40 = 9;    // J
  const COL_LCL = 11;  // L

  const today = getKRYMD(0);
  const range = [];
  const map = new Map();

  for (let i = 0; i < 7; i++) {
    const d = getKRYMD(i);
    range.push(d);
    map.set(d, { s20: 0, s40: 0, sL: 0 });
  }

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.includes("날짜")) continue;
    if (!map.has(d)) continue;

    const o = map.get(d);
    o.s20 += toNum(r?.[COL_20]);
    o.s40 += toNum(r?.[COL_40]);
    o.sL  += toNum(r?.[COL_LCL]);
  }

  tb.innerHTML = range.map((d) => {
    const o = map.get(d);
    const total = o.s20 + o.s40 + o.sL;

    // 표시용: MM/DD or YYYY-MM-DD
    const label = d;

    return `
      <tr>
        <td class="cut">${label}</td>
        <td class="num">${fmtKR.format(o.s20)}</td>
        <td class="num">${fmtKR.format(o.s40)}</td>
        <td class="num">${fmtKR.format(o.sL)}</td>
        <td class="num font-extrabold">${fmtKR.format(total)}</td>
      </tr>
    `;
  }).join("");
}

/* =====================================================
   5) 보수 작업(당월/다음달)
   - 예상(작업 예상량): sap_item
       · 날짜: E(4)
       · 작업량: T(19) 합계
   - 완료(작업량 완료): bosu
       · 날짜: B(1)
       · 상태: J(9) == "완료"
       · 수량: F(5) 합계
   - 잔량 = 예상 - 완료
===================================================== */
async function renderBosuMonth() {
  const tb = $("bosu_month_tbody");
  if (!tb) return;

  // month keys
  const ymNow = ymFromYMD(getKRYMD(0));
  const ymNext = shiftYM(ymNow, +1);

  // ---- 예상( sap_item )
  let expNow = 0, expNext = 0;
  try {
    const t1 = await fetchText(URL_SAP_ITEM);
    const rows1 = parseCsv(t1);

    const COL_DATE = 4;   // E
    const COL_VAL  = 19;  // T

    for (const r of rows1) {
      const d = toYMD(r?.[COL_DATE]);
      if (!d || d.includes("날짜")) continue;

      const ym = ymFromYMD(d);
      const v = toNum(r?.[COL_VAL]);

      if (ym === ymNow) expNow += v;
      else if (ym === ymNext) expNext += v;
    }
  } catch (e) {
    console.warn("sap_item load fail:", e);
  }

  // ---- 완료( bosu )
  let doneNow = 0, doneNext = 0;
  try {
    const t2 = await fetchText(URL_BOSU);
    const rows2 = parseCsv(t2);

    const COL_DATE = 1;   // B
    const COL_QTY  = 5;   // F
    const COL_ST   = 9;   // J

    for (const r of rows2) {
      const d = toYMD(r?.[COL_DATE]);
      if (!d || d.includes("날짜")) continue;

      const st = normNoSpace(r?.[COL_ST]);
      if (st !== "완료") continue;

      const ym = ymFromYMD(d);
      const v = toNum(r?.[COL_QTY]);

      if (ym === ymNow) doneNow += v;
      else if (ym === ymNext) doneNext += v;
    }
  } catch (e) {
    console.warn("bosu load fail:", e);
  }

  const remNow = expNow - doneNow;
  const remNext = expNext - doneNext;

  // HTML 컬럼이 다를 수 있으니: (월 / 예상 / 완료 / 잔량) 형태로 그려줌
  tb.innerHTML = `
    <tr>
      <td class="cut">${monthLabel(ymNow)}</td>
      <td class="num">${fmtKR.format(expNow)}</td>
      <td class="num">${fmtKR.format(doneNow)}</td>
      <td class="num font-extrabold">${fmtKR.format(remNow)}</td>
    </tr>
    <tr>
      <td class="cut">${monthLabel(ymNext)}</td>
      <td class="num">${fmtKR.format(expNext)}</td>
      <td class="num">${fmtKR.format(doneNext)}</td>
      <td class="num font-extrabold">${fmtKR.format(remNext)}</td>
    </tr>
  `;
}

/* =====================================================
   6) 설비 작업(당월/다음달) - daily
   - 날짜: A(0)
   - 설비 작업량: F(5) 합계
   - 작업일: 해당월에서 (F>0)인 날짜 distinct
   - 평균: 작업량 / 작업일
===================================================== */
async function renderSystemMonth() {
  const tb = $("system_month_tbody");
  if (!tb) return;

  const ymNow = ymFromYMD(getKRYMD(0));
  const ymNext = shiftYM(ymNow, +1);

  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  const COL_DATE = 0; // A
  const COL_SYS  = 5; // F

  let sumNow = 0, sumNext = 0;
  const daysNow = new Set();
  const daysNext = new Set();

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.includes("날짜")) continue;

    const ym = ymFromYMD(d);
    const v = toNum(r?.[COL_SYS]);

    if (ym === ymNow) {
      sumNow += v;
      if (v > 0) daysNow.add(d);
    } else if (ym === ymNext) {
      sumNext += v;
      if (v > 0) daysNext.add(d);
    }
  }

  const avgNow = daysNow.size ? (sumNow / daysNow.size) : 0;
  const avgNext = daysNext.size ? (sumNext / daysNext.size) : 0;

  // (월 / 작업량 / 평균) 형태로 렌더
  tb.innerHTML = `
    <tr>
      <td class="cut">${monthLabel(ymNow)}</td>
      <td class="num">${fmtKR.format(sumNow)}</td>
      <td class="num">${fmtKR.format(Math.round(avgNow))}</td>
    </tr>
    <tr>
      <td class="cut">${monthLabel(ymNext)}</td>
      <td class="num">${fmtKR.format(sumNext)}</td>
      <td class="num">${fmtKR.format(Math.round(avgNext))}</td>
    </tr>
  `;
}

/* =====================================================
   7) 작업장별 작업수량 (전체 누계) - daily
   - 보수A: D(3) 합계
   - 보수B: E(4) 합계
   - 설비:  F(5) 합계
   - 평균: 합계 / 작업일
     (각 구분별: 해당 구분 값>0 인 날짜 distinct 기준)
     전체 평균: (D+E+F) / (D/E/F 중 하나라도 >0인 날짜 distinct)
===================================================== */
async function renderWorkplaceTotal() {
  const tb = $("workplace_total_tbody");
  if (!tb) return;

  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  const COL_DATE = 0; // A
  const COL_A = 3;    // D (보수A)
  const COL_B = 4;    // E (보수B)
  const COL_S = 5;    // F (설비)

  let sA = 0, sB = 0, sS = 0;
  const dA = new Set();
  const dB = new Set();
  const dS = new Set();
  const dAll = new Set();

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.includes("날짜")) continue;

    const a = toNum(r?.[COL_A]);
    const b = toNum(r?.[COL_B]);
    const s = toNum(r?.[COL_S]);

    sA += a; sB += b; sS += s;

    if (a > 0) dA.add(d);
    if (b > 0) dB.add(d);
    if (s > 0) dS.add(d);
    if (a > 0 || b > 0 || s > 0) dAll.add(d);
  }

  const avgA = dA.size ? (sA / dA.size) : 0;
  const avgB = dB.size ? (sB / dB.size) : 0;
  const avgS = dS.size ? (sS / dS.size) : 0;

  const sAll = sA + sB + sS;
  const avgAll = dAll.size ? (sAll / dAll.size) : 0;

  tb.innerHTML = `
    <tr>
      <td class="cut">보수A</td>
      <td class="num">${fmtKR.format(sA)}</td>
      <td class="num">${fmtKR.format(Math.round(avgA))}</td>
    </tr>
    <tr>
      <td class="cut">보수B</td>
      <td class="num">${fmtKR.format(sB)}</td>
      <td class="num">${fmtKR.format(Math.round(avgB))}</td>
    </tr>
    <tr>
      <td class="cut">설비</td>
      <td class="num">${fmtKR.format(sS)}</td>
      <td class="num">${fmtKR.format(Math.round(avgS))}</td>
    </tr>
    <tr>
      <td class="cut font-extrabold">전체</td>
      <td class="num font-extrabold">${fmtKR.format(sAll)}</td>
      <td class="num font-extrabold">${fmtKR.format(Math.round(avgAll))}</td>
    </tr>
  `;
}

/* =========================
   ✅ Run All
========================= */
async function runAll() {
  try {
    await Promise.allSettled([
      renderShipTodayAll(),
      renderShipTotal(),
      renderShipMonthly12(),
      renderShipNext7Days(),
      renderBosuMonth(),
      renderSystemMonth(),
      renderWorkplaceTotal(),
    ]);
  } catch (e) {
    console.error("runAll error:", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  runAll();
});
