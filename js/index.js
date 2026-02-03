// js/index.js  (✅ 운영 안정판 완성본)
// - fetchText: timeout + retry + HTML 응답 감지
// - URL_DAILY: refresh 사이클당 1회만 fetch (메모이즈)
// - 보수카드: BOSU만으로 계산 (sap_item 의존 제거)
// - 실패 시 이전 정상값 유지(옵션)

const fmtKR = new Intl.NumberFormat("ko-KR");

function $(id){ return document.getElementById(id); }

function norm(v){
  return (v ?? "").toString().trim();
}
function toNum(v){
  const s = (v ?? "").toString().replace(/,/g,"").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ✅ 날짜 정규화
 * - 2026-2-3 / 2026.2.3 / 2026/2/3 / 2026-02-03 모두 → 2026-02-03
 */
function toYMD(v){
  let s = (v ?? "").toString().trim();
  if(!s) return "";

  s = s.replace(/\s+/g, "").replace(/[./]/g, "-");

  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const yy = m[1];
    const mm = String(m[2]).padStart(2, "0");
    const dd = String(m[3]).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  if (v instanceof Date && !isNaN(v.getTime())) {
    const yy = v.getFullYear();
    const mm = String(v.getMonth()+1).padStart(2,"0");
    const dd = String(v.getDate()).padStart(2,"0");
    return `${yy}-${mm}-${dd}`;
  }

  return s;
}

// 0이면 '-' 표시
function fmt0(n){
  const v = Number(n || 0);
  return v === 0 ? "-" : fmtKR.format(v);
}
function fmtAvg(n){
  const v = Math.round(Number(n || 0));
  return v === 0 ? "-" : fmtKR.format(v);
}

// =====================================================
// ✅ 안정화 fetch: timeout + retry + HTML 응답 감지
// =====================================================
async function fetchText(url, { timeoutMs = 12000, retry = 2 } = {}) {
  for (let attempt = 0; attempt <= retry; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, { cache:"no-store", signal: ctrl.signal });
      clearTimeout(t);

      if(!res.ok) throw new Error("HTTP " + res.status);

      const text = await res.text();

      const head = text.slice(0, 250).toLowerCase();
      if (head.includes("<!doctype html") || head.includes("<html")) {
        throw new Error("CSV 대신 HTML 응답(권한/차단/오류 가능): " + url);
      }

      return text;
    } catch (e) {
      clearTimeout(t);

      if (attempt === retry) throw e;

      // backoff: 0.4s → 0.8s → 1.2s
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

// =====================================================
// CSV 파서(따옴표 포함)
// =====================================================
function parseCsv(text){
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++){
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
      rows.push(row.map(v => (v ?? "").replace(/\r/g,"")));
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length || row.length){
    row.push(field);
    rows.push(row.map(v => (v ?? "").replace(/\r/g,"")));
  }
  return rows;
}

// =====================================================
// ✅ refresh 사이클에서 URL별 fetch 1회만 (메모이즈)
// =====================================================
const _csvMemo = new Map();

async function getCsvRowsOnce(url){
  if (_csvMemo.has(url)) return _csvMemo.get(url);

  const p = (async () => {
    const text = await fetchText(url);
    return parseCsv(text);
  })();

  _csvMemo.set(url, p);
  return p;
}

// (옵션) 실패 시 이전 정상 데이터 유지
const KEEP_PREV_ON_FAIL = true;
let _lastGood = {
  daily: null,
  sapdoc: null,
  bosu: null,
  wms: null
};

async function getRowsSafe(key, url){
  try {
    const rows = await getCsvRowsOnce(url);
    _lastGood[key] = rows;
    return rows;
  } catch (e) {
    console.warn(`[CSV FAIL] ${key}`, e);
    if (KEEP_PREV_ON_FAIL && _lastGood[key]) return _lastGood[key];
    throw e;
  }
}

// =====================================================
// KST 유틸
// =====================================================
function getKRYMD(offsetDay=0){
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kst = new Date(utc + 9 * 3600000);
  kst.setDate(kst.getDate() + offsetDay);
  const y = kst.getFullYear();
  const m = String(kst.getMonth()+1).padStart(2,"0");
  const d = String(kst.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function getKSTNowHM(){
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kst = new Date(utc + 9 * 3600000);
  const hh = String(kst.getHours()).padStart(2,"0");
  const mm = String(kst.getMinutes()).padStart(2,"0");
  return `${hh}:${mm}`;
}
function timeToMin(t){
  const s = norm(t);
  if(!s) return 999999;
  const m1 = s.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if(!m1) return 999999;
  const hh = Number(m1[1]||0);
  const mm = Number(m1[2]||0);
  return hh*60 + mm;
}
function getStatusByTime(shipTime){
  const tmin = timeToMin(shipTime);
  if(tmin === 999999) return "미정";

  const nowMin = timeToMin(getKSTNowHM());
  if(nowMin < tmin) return "상차대기";
  if(nowMin >= tmin && nowMin < tmin + 120) return "상차중";
  return "상차완료";
}
function contRank(cont){
  const c = norm(cont).toUpperCase();
  if (c === "20") return 1;
  if (c === "40") return 2;
  if (c.includes("LCL")) return 3;
  return 9;
}

// =====================================================
// CSV URL
// =====================================================
const URL_DAILY =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=430924108&single=true&output=csv";

const URL_SAP_DOC =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=1210262064&single=true&output=csv";

const URL_BOSU =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=617786742&single=true&output=csv";

const URL_WMS =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=1992353991&single=true&output=csv";

// =====================================================
// 1) 출고 누계(전체) - daily
//   I(8)=20pt, J(9)=40pt, L(11)=LCL
// =====================================================
async function renderShipTotal(){
  const tb = $("ship_total_tbody");
  if(!tb) return;

  const rows = await getRowsSafe("daily", URL_DAILY);

  const COL_20 = 8;
  const COL_40 = 9;
  const COL_LCL = 11;

  let s20=0, s40=0, slcl=0;

  for(const r of rows){
    const a0 = norm(r?.[0]);
    if(!a0 || a0.includes("날짜")) continue;

    s20 += toNum(r?.[COL_20]);
    s40 += toNum(r?.[COL_40]);
    slcl += toNum(r?.[COL_LCL]);
  }

  const sum = s20+s40+slcl;

  tb.innerHTML = `
    <tr>
      <td class="cut font-extrabold">전체</td>
      <td>${fmt0(s20)}</td>
      <td>${fmt0(s40)}</td>
      <td>${fmt0(slcl)}</td>
      <td class="font-extrabold">${fmt0(sum)}</td>
    </tr>
  `;
}

// =====================================================
// 2) 월별 출고 누계(1~12월) - daily
// =====================================================
async function renderShipMonthly(){
  const tb = $("ship_monthly_tbody");
  if(!tb) return;

  const rows = await getRowsSafe("daily", URL_DAILY);

  const COL_DATE = 0;
  const COL_20 = 8;
  const COL_40 = 9;
  const COL_LCL = 11;

  const map = new Map();
  for(let m=1;m<=12;m++) map.set(m, {s20:0,s40:0,slcl:0});

  for(const r of rows){
    const d = toYMD(r?.[COL_DATE]);
    if(!d || d.includes("날짜")) continue;

    const mm = Number(d.slice(5,7));
    if(!(mm>=1 && mm<=12)) continue;

    const o = map.get(mm);
    o.s20 += toNum(r?.[COL_20]);
    o.s40 += toNum(r?.[COL_40]);
    o.slcl += toNum(r?.[COL_LCL]);
  }

  tb.innerHTML = Array.from({length:12}, (_,i)=>{
    const m = i+1;
    const o = map.get(m);
    const sum = o.s20 + o.s40 + o.slcl;
    return `
      <tr>
        <td class="cut">${m}월</td>
        <td>${fmt0(o.s20)}</td>
        <td>${fmt0(o.s40)}</td>
        <td>${fmt0(o.slcl)}</td>
        <td class="font-extrabold">${fmt0(sum)}</td>
      </tr>
    `;
  }).join("");
}

// =====================================================
// 3) 출고정보(오늘~미래6일) - daily
// =====================================================
async function renderShip7Days(){
  const tb = $("ship_7days_tbody");
  if(!tb) return;

  const rows = await getRowsSafe("daily", URL_DAILY);

  const COL_DATE = 0;
  const COL_20 = 8;
  const COL_40 = 9;
  const COL_LCL = 11;

  const days = [];
  for(let i=0;i<7;i++){
    const ymd = getKRYMD(i);
    days.push({ ymd, s20:0, s40:0, slcl:0 });
  }
  const idx = new Map(days.map((d,i)=>[d.ymd, i]));

  for(const r of rows){
    const d = toYMD(r?.[COL_DATE]);
    if(!d || d.includes("날짜")) continue;
    if(!idx.has(d)) continue;

    const o = days[idx.get(d)];
    o.s20 += toNum(r?.[COL_20]);
    o.s40 += toNum(r?.[COL_40]);
    o.slcl += toNum(r?.[COL_LCL]);
  }

  tb.innerHTML = days.map(o=>{
    const sum = o.s20 + o.s40 + o.slcl;
    return `
      <tr>
        <td class="cut">${o.ymd}</td>
        <td>${fmt0(o.s20)}</td>
        <td>${fmt0(o.s40)}</td>
        <td>${fmt0(o.slcl)}</td>
        <td class="font-extrabold">${fmt0(sum)}</td>
      </tr>
    `;
  }).join("");
}

// =====================================================
// 4) 출고 요약(당일) - sap_doc
// =====================================================
async function renderShipTodayAll(){
  const tb = $("ship_today_tbody");
  if(!tb) return;

  const rows = await getRowsSafe("sapdoc", URL_SAP_DOC);
  const today = getKRYMD(0);

  const COL_INV = 0;
  const COL_COUNTRY = 4;
  const COL_CONT = 9;
  const COL_LOC = 16;
  const COL_TIME = 19;

  // 출고일 컬럼 자동탐색
  let COL_SHIP_DATE = 3;
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

  for(const r of rows){
    const inv = norm(r?.[COL_INV]);
    if(!inv || inv.includes("인보") || inv === "A") continue;

    const shipDate = toYMD(r?.[COL_SHIP_DATE]);
    if(shipDate !== today) continue;

    const country = norm(r?.[COL_COUNTRY]);
    const cont = norm(r?.[COL_CONT]);
    const loc = norm(r?.[COL_LOC]);
    const time = norm(r?.[COL_TIME]);

    data.push({
      inv, country, cont, loc, time,
      status: getStatusByTime(time),
      _rank: contRank(cont),
      _tmin: timeToMin(time),
    });
  }

  data.sort((a,b)=> (a._rank - b._rank) || (a._tmin - b._tmin));

  if(data.length === 0){
    tb.innerHTML = `<tr><td colspan="6" class="muted">오늘 출고 없음</td></tr>`;
    return;
  }

  tb.innerHTML = data.map(x=>{
    const isLoading = x.status === "상차중";
    const rowCls = isLoading ? "bg-yellow-50" : "";
    const boldCls = isLoading ? "font-extrabold" : "";
    const stCls =
      x.status === "상차중" ? "text-amber-700 font-extrabold" :
      x.status === "상차대기" ? "text-slate-700 font-extrabold" :
      x.status === "상차완료" ? "text-emerald-700 font-extrabold" :
      "text-slate-600 font-extrabold";

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

// =====================================================
// 5) ✅ 보수작업(당월/다음달) - BOSU만 사용 (안정판)
// - "출고일" / "작업예상수량" / "작업완료수량" / "작업후잔량" 컬럼을 헤더로 자동탐색
// - 잔량은 (예상-완료)로 계산(시트 잔량 컬럼이 깨져도 안전)
// =====================================================
function detectHeaderIndex(headers, keywords){
  const lower = (headers || []).map(h => (h ?? "").toString().trim().toLowerCase());
  for (let i=0;i<lower.length;i++){
    const s = lower[i];
    for (const k of keywords){
      if (s.includes(k)) return i;
    }
  }
  return -1;
}
function ymKey(y, m){ return `${y}-${String(m).padStart(2,"0")}`; }

async function renderRepairCards(){
  const elCurPlan = $("rep_cur_plan");
  const elCurDone = $("rep_cur_done");
  const elCurRemain = $("rep_cur_remain");

  const elNextPlan = $("rep_next_plan");
  const elNextDone = $("rep_next_done");
  const elNextRemain = $("rep_next_remain");

  const today = getKRYMD(0);
  const y = Number(today.slice(0,4));
  const m = Number(today.slice(5,7));
  const curYM  = ymKey(y, m);
  const nextYM = (m === 12) ? ymKey(y+1, 1) : ymKey(y, m+1);

  const rows = await getRowsSafe("bosu", URL_BOSU);
  if (!rows || rows.length < 2) {
    if(elCurPlan) elCurPlan.textContent = "-";
    if(elCurDone) elCurDone.textContent = "-";
    if(elCurRemain) elCurRemain.textContent = "-";
    if(elNextPlan) elNextPlan.textContent = "-";
    if(elNextDone) elNextDone.textContent = "-";
    if(elNextRemain) elNextRemain.textContent = "-";
    return;
  }

  const headers = rows[0] || [];
  let COL_DATE = detectHeaderIndex(headers, ["출고일", "date"]);
  let COL_PLAN = detectHeaderIndex(headers, ["작업예상수량", "예상", "plan"]);
  let COL_DONE = detectHeaderIndex(headers, ["작업완료수량", "완료", "done"]);
  let COL_REM  = detectHeaderIndex(headers, ["작업후잔량", "잔량", "remain"]);

  // fallback (너 스샷 기준)
  if (COL_DATE < 0) COL_DATE = 1; // B
  if (COL_PLAN < 0) COL_PLAN = 5; // F
  if (COL_DONE < 0) COL_DONE = 6; // G
  if (COL_REM  < 0) COL_REM  = 7; // H

  let curPlan = 0, curDone = 0;
  let nextPlan = 0, nextDone = 0;

  for (let i=1;i<rows.length;i++){
    const r = rows[i] || [];
    const ymd = toYMD(r[COL_DATE]);
    if(!ymd || ymd.includes("날짜")) continue;

    const ym = ymd.slice(0,7);
    const plan = toNum(r[COL_PLAN]);
    const done = toNum(r[COL_DONE]);

    if (ym === curYM){
      curPlan += plan;
      curDone += done;
    } else if (ym === nextYM){
      nextPlan += plan;
      nextDone += done;
    }
  }

  const curRemain = Math.max(0, curPlan - curDone);
  const nextRemain = Math.max(0, nextPlan - nextDone);

  if(elCurPlan) elCurPlan.textContent = fmt0(curPlan);
  if(elCurDone) elCurDone.textContent = fmt0(curDone);
  if(elCurRemain) elCurRemain.textContent = fmt0(curRemain);

  if(elNextPlan) elNextPlan.textContent = fmt0(nextPlan);
  if(elNextDone) elNextDone.textContent = fmt0(nextDone);
  if(elNextRemain) elNextRemain.textContent = fmt0(nextRemain);

  console.log("[REPAIR/BOSU]", { curYM, curPlan, curDone, curRemain, nextYM, nextPlan, nextDone, nextRemain, COL_DATE, COL_PLAN, COL_DONE, COL_REM });
}

// =====================================================
// 6) 설비 작업(전월/당월) - daily
// =====================================================
async function renderFacilityCards(){
  const elPrevQty = $("fac_cur_qty");   // 전월
  const elPrevAvg = $("fac_cur_avg");
  const elCurQty  = $("fac_next_qty");  // 당월
  const elCurAvg  = $("fac_next_avg");

  const rows = await getRowsSafe("daily", URL_DAILY);

  const COL_DATE = 0;
  const COL_FAC  = 5; // F

  const today = getKRYMD(0);
  const y = Number(today.slice(0,4));
  const m = Number(today.slice(5,7));

  const prevY = (m === 1) ? y - 1 : y;
  const prevM = (m === 1) ? 12 : m - 1;

  const curY = y;
  const curM = m;

  let prevSum = 0, curSum = 0;
  const prevDays = new Set();
  const curDays  = new Set();

  for(const r of rows){
    const d = toYMD(r?.[COL_DATE]);
    if(!d || d.includes("날짜")) continue;

    const yy = Number(d.slice(0,4));
    const mm = Number(d.slice(5,7));
    const v  = toNum(r?.[COL_FAC]);

    if(yy === prevY && mm === prevM){
      prevSum += v;
      if(v > 0) prevDays.add(d);
    }
    if(yy === curY && mm === curM){
      curSum += v;
      if(v > 0) curDays.add(d);
    }
  }

  const prevAvg = prevDays.size ? (prevSum / prevDays.size) : 0;
  const curAvg  = curDays.size  ? (curSum  / curDays.size)  : 0;

  if(elPrevQty) elPrevQty.textContent = fmt0(prevSum);
  if(elPrevAvg) elPrevAvg.textContent = fmtAvg(prevAvg);

  if(elCurQty)  elCurQty.textContent  = fmt0(curSum);
  if(elCurAvg)  elCurAvg.textContent  = fmtAvg(curAvg);
}

// =====================================================
// 7) 작업장별 작업수량(전체누계) - daily
// =====================================================
async function renderWorkplaceTotal(){
  const tb = $("work_total_tbody");
  if(!tb) return;

  const rows = await getRowsSafe("daily", URL_DAILY);

  const COL_DATE = 0;
  const COL_A = 3; // D
  const COL_B = 4; // E
  const COL_S = 5; // F

  let sA=0, sB=0, sS=0;
  const daySet = new Set();

  for(const r of rows){
    const d = toYMD(r?.[COL_DATE]);
    if(!d || d.includes("날짜")) continue;

    const a = toNum(r?.[COL_A]);
    const b = toNum(r?.[COL_B]);
    const s = toNum(r?.[COL_S]);

    sA += a; sB += b; sS += s;
    if((a+b+s) > 0) daySet.add(d);
  }

  const workDays = daySet.size || 0;
  const sAll = sA+sB+sS;

  const avgA = workDays ? (sA / workDays) : 0;
  const avgB = workDays ? (sB / workDays) : 0;
  const avgS = workDays ? (sS / workDays) : 0;
  const avgAll = workDays ? (sAll / workDays) : 0;

  tb.innerHTML = `
    <tr><td class="cut">보수A</td><td>${fmt0(sA)}</td><td>${fmtAvg(avgA)}</td></tr>
    <tr><td class="cut">보수B</td><td>${fmt0(sB)}</td><td>${fmtAvg(avgB)}</td></tr>
    <tr><td class="cut">설비</td><td>${fmt0(sS)}</td><td>${fmtAvg(avgS)}</td></tr>
    <tr><td class="cut font-extrabold">전체</td><td class="font-extrabold">${fmt0(sAll)}</td><td class="font-extrabold">${fmtAvg(avgAll)}</td></tr>
  `;
}

// =====================================================
// 8) 재고 합계(wms) - E(4) 합
// =====================================================
async function renderInventorySum(){
  const el = $("k_inventory");
  if(!el) return;

  const rows = await getRowsSafe("wms", URL_WMS);

  const COL_QTY = 4; // E
  let sum = 0;

  for(const r of rows){
    const a0 = norm(r?.[0]);
    if (a0 && (a0.includes("자재") || a0.includes("품목") || a0.includes("code"))) continue;
    sum += toNum(r?.[COL_QTY]);
  }

  el.textContent = fmt0(sum);
}

/* =========================
   ⏱ 무깜빡임 데이터 갱신 (KST 06~20만)
========================= */

// 운영은 30으로
// const DATA_REFRESH_MIN = 30;
const DATA_REFRESH_MIN = 1;

const DATA_REFRESH_MS = DATA_REFRESH_MIN * 60 * 1000;

let _refreshing = false;
let _timer = null;

function getKSTHour() {
  return new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false });
}
function isAutoRefreshTime() {
  const h = Number(getKSTHour());
  return h >= 6 && h < 20;
}
function setLastUpdated() {
  const el = document.querySelector("#dataUpdatedTop");
  if (!el) return;

  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  el.textContent = fmt.format(new Date());
}

async function refreshAll() {
  if (_refreshing) return;
  _refreshing = true;

  // ✅ 이번 refresh 사이클 URL 메모 초기화
  _csvMemo.clear();

  // ✅ DAILY 먼저 워밍업(동시 burst 감소)
  try { await getRowsSafe("daily", URL_DAILY); } catch(e) {}

  const jobs = [
    ["renderShipTotal", renderShipTotal],
    ["renderShipTodayAll", renderShipTodayAll],
    ["renderShipMonthly", renderShipMonthly],
    ["renderShip7Days", renderShip7Days],
    ["renderRepairCards", renderRepairCards],
    ["renderFacilityCards", renderFacilityCards],
    ["renderWorkplaceTotal", renderWorkplaceTotal],
    ["renderInventorySum", renderInventorySum],
  ].filter(([, fn]) => typeof fn === "function");

  const nowStamp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  }).format(new Date());

  console.log(`[REFRESH] start ${nowStamp} | jobs=${jobs.length} | worktime=${isAutoRefreshTime()}`);

  try {
    const results = await Promise.allSettled(
      jobs.map(([, fn]) => Promise.resolve().then(fn))
    );

    const ok = results.filter(r => r.status === "fulfilled").length;
    const fail = results.filter(r => r.status === "rejected").length;

    if (fail) console.warn("[REFRESH] some jobs failed:", results);

    console.log(`[REFRESH] done | ok=${ok} fail=${fail}`);
    setLastUpdated();
  } catch (e) {
    console.warn("refreshAll error:", e);
  } finally {
    _refreshing = false;
  }
}

function startAutoRefresh() {
  if (_timer) clearInterval(_timer);
  _timer = null;

  if (isAutoRefreshTime()) {
    console.log(`[REFRESH] timer ON (${DATA_REFRESH_MIN}min)`);
    _timer = setInterval(() => {
      if (!isAutoRefreshTime()) {
        console.log("[REFRESH] timer OFF (out of worktime)");
        if (_timer) clearInterval(_timer);
        _timer = null;
        return;
      }
      refreshAll();
    }, DATA_REFRESH_MS);
  } else {
    console.log("[REFRESH] timer OFF (not worktime)");
  }
}

function init() {
  refreshAll();
  startAutoRefresh();
  setInterval(startAutoRefresh, 5 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", init);
