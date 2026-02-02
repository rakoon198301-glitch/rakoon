// js/index.js
// =====================================================
// ✅ NKG Dashboard (HTML 무수정) - index.js 교체본
// - 출고 누계(전체): daily CSV 전체 합계 → #ship_total_tbody
// - 출고 요약(당일): sap_doc 오늘 날짜 전체 → #ship_today_tbody
// - 월별 출고 누계(1~12월): daily CSV 월별 합계 → #ship_monthly_tbody
// - 출고정보(오늘+미래6일=7일): daily CSV 날짜별 합계 → #ship_7days_tbody
// - 보수/설비/작업장별: tbody 있으면 tbody 채움, 없으면 카드 KV 라벨 찾아 숫자 채움
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

  let m = s.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2] ?? "0");
    if (Number.isFinite(hh) && Number.isFinite(mm)) return hh * 60 + mm;
  }

  m = s.match(/^(\d{1,2})(\d{2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    return hh * 60 + mm;
  }

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

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row.map((v) => (v ?? "").replace(/\r/g, "")));
  }

  return rows;
}

/* =====================================================
   ✅ (추가) 카드 KV 채우기 유틸
   - title(카드 제목) + tag(우측 뱃지: 당월/다음달/전체누계 등)로 카드 찾기
   - 카드 내부 .kv 의 span(label) 텍스트로 b(값) 찾아 채움
===================================================== */
function findCardsByTitle(titleText) {
  const cards = Array.from(document.querySelectorAll(".card"));
  return cards.filter((card) => {
    const t = card.querySelector(".title");
    return t && norm(t.textContent) === titleText;
  });
}

function pickCard(titleText, tagText = "") {
  const list = findCardsByTitle(titleText);
  if (!tagText) return list[0] || null;

  const want = norm(tagText);
  return (
    list.find((card) => {
      const tag = card.querySelector(".tag");
      return tag && norm(tag.textContent) === want;
    }) || null
  );
}

function setKvValue(cardEl, labelIncludes, value, formatter = (v) => fmtKR.format(v)) {
  if (!cardEl) return false;
  const kvs = Array.from(cardEl.querySelectorAll(".kv"));
  const want = normNoSpace(labelIncludes);
  for (const kv of kvs) {
    const sp = kv.querySelector("span");
    const b = kv.querySelector("b");
    if (!sp || !b) continue;
    const lab = normNoSpace(sp.textContent);
    if (lab.includes(want)) {
      b.textContent = formatter(value);
      return true;
    }
  }
  return false;
}

/* =====================================================
   1) 출고 누계(전체) - daily 전체 합
===================================================== */
async function renderShipTotal() {
  const tb = $("ship_total_tbody");
  if (!tb) return;

  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  const COL_20 = 8;   // I
  const COL_40 = 9;   // J
  const COL_LCL = 11; // L

  let s20 = 0, s40 = 0, sL = 0;

  for (const r of rows) {
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

  let COL_SHIP_DATE = 3;
  const sample = rows.slice(0, 120);
  let bestCol = 3, bestHit = 0;

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
   4) 출고정보 (오늘 + 미래6일 = 7일) - daily
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

    return `
      <tr>
        <td class="cut">${d}</td>
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
   - (카드 KV 방식 우선 지원)
===================================================== */
async function renderBosuCards() {
  // 당월/다음달 보수 카드 찾기 (제목 "보수작업" + tag "당월"/"다음달")
  const cardNow = pickCard("보수작업", "당월");
  const cardNext = pickCard("보수작업", "다음달");

  // tbody 방식(혹시 있을 경우)
  const tb = $("bosu_month_tbody");

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

    const COL_DATE = 1; // B
    const COL_QTY  = 5; // F
    const COL_ST   = 9; // J

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

  // ✅ 1) tbody 있으면 tbody 채움
  if (tb) {
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

  // ✅ 2) 카드 KV 방식 채움 (HTML 수정 없이)
  setKvValue(cardNow, "작업예상량", expNow);
  setKvValue(cardNow, "작업량(완료)", doneNow);
  setKvValue(cardNow, "잔량", remNow);

  setKvValue(cardNext, "작업예상량", expNext);
  setKvValue(cardNext, "작업량(완료)", doneNext);
  setKvValue(cardNext, "잔량", remNext);
}

/* =====================================================
   6) 설비 작업(당월/다음달) - daily
===================================================== */
async function renderSystemCards() {
  const cardNow = pickCard("설비 작업", "당월");
  const cardNext = pickCard("설비 작업", "다음달");

  const tb = $("system_month_tbody");

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

  // tbody 방식
  if (tb) {
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

  // 카드 KV 방식
  setKvValue(cardNow, "설비작업량", sumNow);
  setKvValue(cardNow, "설비평균작업량", Math.round(avgNow));

  setKvValue(cardNext, "설비작업량", sumNext);
  setKvValue(cardNext, "설비평균작업량", Math.round(avgNext));
}

/* =====================================================
   7) 작업장별 작업수량 (전체 누계) - daily (✅ 전체 누적)
   - 보수A: D열 전체합
   - 보수B: E열 전체합
   - 설비 : F열 전체합
   - 평균  : (합계 / 작업일)  ※ 작업일=해당 구분 값이 0보다 큰 날짜 수
===================================================== */
async function renderWorkplaceTotal() {
  const tb = document.getElementById("workplace_total_tbody");
  if (!tb) return;

  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);
  if (!rows || rows.length === 0) {
    tb.innerHTML = `<tr><td colspan="3" class="muted">데이터 없음</td></tr>`;
    return;
  }

  // ✅ 헤더 기반 컬럼 자동 탐색
  const header = (rows[0] || []).map(v => (v || "").toString().trim());

  const idxDate = 0; // A: 날짜
  let idxA = header.findIndex(h => h.includes("보수A"));
  let idxB = header.findIndex(h => h.includes("보수B"));
  let idxS = header.findIndex(h => h.includes("설비"));

  // ✅ fallback: D/E/F
  if (idxA < 0) idxA = 3;
  if (idxB < 0) idxB = 4;
  if (idxS < 0) idxS = 5;

  let sA = 0, sB = 0, sS = 0;
  const daySet = new Set(); // ✅ "진짜 작업한 날"만 넣음

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];

    const d = toYMD(r?.[idxDate]);
    if (!d || d.includes("날짜")) continue;

    const a = toNum(r?.[idxA]);
    const b = toNum(r?.[idxB]);
    const s = toNum(r?.[idxS]);

    sA += a; sB += b; sS += s;

    // ✅ 진짜 작업한 날만 카운트: D+E+F > 0
    if ((a + b + s) > 0) daySet.add(d);
  }

  const workDays = daySet.size || 0;

  const sAll = sA + sB + sS;

  // ✅ 평균 = 합계 / 작업일수(진짜 작업한 날)
  const avgA = workDays ? (sA / workDays) : 0;
  const avgB = workDays ? (sB / workDays) : 0;
  const avgS = workDays ? (sS / workDays) : 0;
  const avgAll = workDays ? (sAll / workDays) : 0;

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


  // ✅ (혹시 카드 KV 구조면) 라벨 기반으로도 세팅 시도
  // 라벨이 정확히 안 맞으면 그냥 무시됨
  setKvValue(card, "보수A", sA);
  setKvValue(card, "보수B", sB);
  setKvValue(card, "설비", sS);
  setKvValue(card, "전체", sAll);


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
      renderBosuCards(),
      renderSystemCards(),
      renderWorkplaceTotal(),
    ]);
  } catch (e) {
    console.error("runAll error:", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  runAll();
});
