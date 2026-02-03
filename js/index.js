// js/index.js
const fmtKR = new Intl.NumberFormat("ko-KR");
function $(id){ return document.getElementById(id); }
function norm(v){ return (v ?? "").toString().trim(); }
function toNum(v){
  const s = (v ?? "").toString().replace(/,/g,"").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ✅ 날짜 정규화
 * - 2026-2-3 / 2026.2.3 / 2026/2/3 / 2026-02-03 → 2026-02-03
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

function fmt0(n){
  const v = Number(n || 0);
  return v === 0 ? "-" : fmtKR.format(v);
}
function fmtAvg(n){
  const v = Math.round(Number(n || 0));
  return v === 0 ? "-" : fmtKR.format(v);
}

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

// ================================
// ✅ CSV URL
// ================================
const URL_DAILY =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=430924108&single=true&output=csv";

const URL_SAP_DOC =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=1210262064&single=true&output=csv";

const URL_SAP_ITEM =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=1124687656&single=true&output=csv";

const URL_BOSU =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=617786742&single=true&output=csv";

const URL_WMS =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=1992353991&single=true&output=csv";

// ================================
// ✅ 안정화: fetch 재시도 + 타임아웃 + 캐시버스터
// ================================
async function fetchText(url, { timeoutMs=15000, retry=2 } = {}){
  const u = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();

  for (let attempt=0; attempt<=retry; attempt++){
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), timeoutMs);

    try{
      const res = await fetch(u, { cache:"no-store", signal: ctrl.signal });
      if(!res.ok) throw new Error("HTTP " + res.status);

      const text = await res.text();
      const head = text.slice(0, 200).toLowerCase();
      if (head.includes("<!doctype html") || head.includes("<html")) {
        throw new Error("CSV 대신 HTML 응답(권한/차단/오류 가능)");
      }
      return text;
    }catch(e){
      if (attempt === retry) throw new Error(`${e.message} | url=${url}`);
      await new Promise(r=>setTimeout(r, 400 + attempt*500));
    }finally{
      clearTimeout(timer);
    }
  }
}

// ✅ 따옴표 포함 CSV 파서
function parseCsv(text){
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++){
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i++; }
      else { inQuotes = !inQuotes; }
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
  if (field.length || row.length){
    row.push(field);
    rows.push(row.map(v => (v ?? "").replace(/\r/g,"")));
  }
  return rows;
}

// ================================
// ✅ Chart.js 공통 옵션(다크 전광판 느낌)
// ================================
let chart7 = null;
let chartMonthly = null;

function buildDarkBarOptions(){
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "top",
        labels: { color: "rgba(255,255,255,.86)", boxWidth: 10, boxHeight: 10 }
      },
      tooltip: {
        enabled: true,
        titleColor: "rgba(255,255,255,.92)",
        bodyColor: "rgba(255,255,255,.92)",
        backgroundColor: "rgba(3,7,18,.92)",
        borderColor: "rgba(255,255,255,.12)",
        borderWidth: 1
      }
    },
    scales: {
      x: {
        ticks: { color: "rgba(255,255,255,.72)", maxRotation: 0 },
        grid: { color: "rgba(255,255,255,.06)" }
      },
      y: {
        beginAtZero: true,
        ticks: { color: "rgba(255,255,255,.72)" },
        grid: { color: "rgba(255,255,255,.08)" }
      }
    }
  };
}

function upsertChart7Days(labels, s40, s20, slcl){
  const el = $("chart_ship_7days");
  if(!el || !window.Chart) return;

  const data = {
    labels,
    datasets: [
      { label: "40 PT", data: s40, borderWidth: 0 },
      { label: "20 PT", data: s20, borderWidth: 0 },
      { label: "LCL",   data: slcl, borderWidth: 0 },
    ]
  };

  if (!chart7){
    chart7 = new Chart(el, {
      type: "bar",
      data,
      options: {
        ...buildDarkBarOptions(),
        datasets: { bar: { borderRadius: 6, barThickness: 14 } }
      }
    });
  }else{
    chart7.data.labels = labels;
    chart7.data.datasets[0].data = s40;
    chart7.data.datasets[1].data = s20;
    chart7.data.datasets[2].data = slcl;
    chart7.update();
  }
}

function upsertChartMonthly(labels, s40, s20, slcl){
  const el = $("chart_ship_monthly");
  if(!el || !window.Chart) return;

  const data = {
    labels,
    datasets: [
      { label: "40 PT", data: s40, borderWidth: 0 },
      { label: "20 PT", data: s20, borderWidth: 0 },
      { label: "LCL",   data: slcl, borderWidth: 0 },
    ]
  };

  if (!chartMonthly){
    chartMonthly = new Chart(el, {
      type: "bar",
      data,
      options: {
        ...buildDarkBarOptions(),
        datasets: { bar: { borderRadius: 6, barThickness: 14 } }
      }
    });
  }else{
    chartMonthly.data.labels = labels;
    chartMonthly.data.datasets[0].data = s40;
    chartMonthly.data.datasets[1].data = s20;
    chartMonthly.data.datasets[2].data = slcl;
    chartMonthly.update();
  }
}

// ================================
// 1) 출고 누계(전체) - daily
// ================================
async function renderShipTotal(){
  const tb = $("ship_total_tbody");
  if(!tb) return;

  const rows = parseCsv(await fetchText(URL_DAILY));

  const COL_20 = 8;   // I
  const COL_40 = 9;   // J
  const COL_LCL = 11; // L

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

// ================================
// 2) 출고 요약(당일) - sap_doc
// ================================
async function renderShipTodayAll(){
  const tb = $("ship_today_tbody");
  if(!tb) return;

  const rows = parseCsv(await fetchText(URL_SAP_DOC));
  const today = getKRYMD(0);

  const COL_INV = 0;      // A
  const COL_COUNTRY = 4;  // E
  const COL_CONT = 9;     // J
  const COL_LOC = 16;     // Q
  const COL_TIME = 19;    // T

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
    const status = getStatusByTime(time);

    data.push({
      inv, country, cont, loc, time, status,
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

// ================================
// 3) 보수작업(당월/다음달)
// ================================
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
  const nextY = (m === 12) ? y+1 : y;
  const nextM = (m === 12) ? 1 : m+1;

  // plan: sap_item (E=날짜, T=합계)
  const itemRows = parseCsv(await fetchText(URL_SAP_ITEM));
  const COL_ITEM_DATE = 4; // E
  const COL_ITEM_T = 19;   // T

  let curPlan = 0, nextPlan = 0;
  for(const r of itemRows){
    const d = toYMD(r?.[COL_ITEM_DATE]);
    if(!d || d.includes("날짜")) continue;
    const yy = Number(d.slice(0,4));
    const mm = Number(d.slice(5,7));
    const v = toNum(r?.[COL_ITEM_T]);
    if(yy===y && mm===m) curPlan += v;
    if(yy===nextY && mm===nextM) nextPlan += v;
  }

  // done: bosu (B=날짜, J=작업여부, F=작업예상수량(합산 대상))
  const bosuRows = parseCsv(await fetchText(URL_BOSU));
  const COL_BOSU_DATE = 1; // B
  const COL_BOSU_DONE = 9; // J
  const COL_BOSU_F = 5;    // F

  let curDone = 0, nextDone = 0;
  for(const r of bosuRows){
    const d = toYMD(r?.[COL_BOSU_DATE]);
    if(!d || d.includes("날짜")) continue;

    const st = norm(r?.[COL_BOSU_DONE]);
    if(st !== "완료") continue;

    const yy = Number(d.slice(0,4));
    const mm = Number(d.slice(5,7));
    const v = toNum(r?.[COL_BOSU_F]);

    if(yy===y && mm===m) curDone += v;
    if(yy===nextY && mm===nextM) nextDone += v;
  }

  const curRemain = Math.max(0, curPlan - curDone);
  const nextRemain = Math.max(0, nextPlan - nextDone);

  if(elCurPlan) elCurPlan.textContent = fmt0(curPlan);
  if(elCurDone) elCurDone.textContent = fmt0(curDone);
  if(elCurRemain) elCurRemain.textContent = fmt0(curRemain);

  if(elNextPlan) elNextPlan.textContent = fmt0(nextPlan);
  if(elNextDone) elNextDone.textContent = fmt0(nextDone);
  if(elNextRemain) elNextRemain.textContent = fmt0(nextRemain);
}

// ================================
// 4) 설비 작업(전월/당월) - daily
// ================================
async function renderFacilityCards(){
  const elPrevQty = $("fac_cur_qty");
  const elPrevAvg = $("fac_cur_avg");
  const elCurQty  = $("fac_next_qty");
  const elCurAvg  = $("fac_next_avg");

  const rows = parseCsv(await fetchText(URL_DAILY));
  const COL_DATE = 0;
  const COL_FAC  = 5; // F

  const today = getKRYMD(0);
  const y = Number(today.slice(0,4));
  const m = Number(today.slice(5,7));

  const prevY = (m === 1) ? y - 1 : y;
  const prevM = (m === 1) ? 12 : m - 1;

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
    if(yy === y && mm === m){
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

// ================================
// 5) 작업장별 작업수량(전체누계) - daily
// ================================
async function renderWorkplaceTotal(){
  const tb = $("work_total_tbody");
  if(!tb) return;

  const rows = parseCsv(await fetchText(URL_DAILY));
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

// ================================
// 6) 재고 합계(wms) - E(4) 합
// ================================
async function renderInventorySum(){
  const el = $("k_inventory");
  if(!el) return;

  const rows = parseCsv(await fetchText(URL_WMS));
  const COL_QTY = 4; // E
  let sum = 0;

  for(const r of rows){
    const a0 = norm(r?.[0]);
    if (a0 && (a0.includes("자재") || a0.includes("품목") || a0.includes("CODE"))) continue;
    sum += toNum(r?.[COL_QTY]);
  }
  el.textContent = fmt0(sum);
}

// ================================
// ✅ 7) 차트: 7일 출고정보 - daily (A=날짜, I/J/L)
// ================================
async function renderChartShip7Days(){
  const rows = parseCsv(await fetchText(URL_DAILY));
  const COL_DATE = 0;
  const COL_20 = 8;
  const COL_40 = 9;
  const COL_LCL = 11;

  const labels = [];
  const s20 = [], s40 = [], slcl = [];

  for(let i=0;i<7;i++){
    const ymd = getKRYMD(i);
    labels.push(ymd.slice(5)); // "MM-DD"로 짧게
    s20.push(0); s40.push(0); slcl.push(0);
  }
  const idx = new Map();
  for(let i=0;i<7;i++) idx.set(getKRYMD(i), i);

  for(const r of rows){
    const d = toYMD(r?.[COL_DATE]);
    if(!d || d.includes("날짜")) continue;
    if(!idx.has(d)) continue;

    const i = idx.get(d);
    s20[i] += toNum(r?.[COL_20]);
    s40[i] += toNum(r?.[COL_40]);
    slcl[i] += toNum(r?.[COL_LCL]);
  }

  upsertChart7Days(labels, s40, s20, slcl);
}

// ================================
// ✅ 8) 차트: 월별 출고 누계 - daily
// ================================
async function renderChartShipMonthly(){
  const rows = parseCsv(await fetchText(URL_DAILY));
  const COL_DATE = 0;
  const COL_20 = 8;
  const COL_40 = 9;
  const COL_LCL = 11;

  const labels = [];
  const s20 = Array(12).fill(0);
  const s40 = Array(12).fill(0);
  const slcl = Array(12).fill(0);

  for(let m=1;m<=12;m++) labels.push(`${m}월`);

  for(const r of rows){
    const d = toYMD(r?.[COL_DATE]);
    if(!d || d.includes("날짜")) continue;

    const mm = Number(d.slice(5,7));
    if(!(mm>=1 && mm<=12)) continue;

    const i = mm - 1;
    s20[i] += toNum(r?.[COL_20]);
    s40[i] += toNum(r?.[COL_40]);
    slcl[i] += toNum(r?.[COL_LCL]);
  }

  upsertChartMonthly(labels, s40, s20, slcl);
}

// ================================
// ⏱ 무깜빡임 갱신 (06~20 KST)
// ================================
const DATA_REFRESH_MIN = 1; // 운영 시 30으로 바꾸면 됨
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

  const jobs = [
    ["renderShipTotal", renderShipTotal],
    ["renderShipTodayAll", renderShipTodayAll],
    ["renderRepairCards", renderRepairCards],
    ["renderFacilityCards", renderFacilityCards],
    ["renderWorkplaceTotal", renderWorkplaceTotal],
    ["renderInventorySum", renderInventorySum],
    ["renderChartShip7Days", renderChartShip7Days],
    ["renderChartShipMonthly", renderChartShipMonthly],
  ].filter(([, fn]) => typeof fn === "function");

  const nowStamp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  }).format(new Date());

  console.log(`[REFRESH] start ${nowStamp} | jobs=${jobs.length} | worktime=${isAutoRefreshTime()}`);

  try {
    const results = await Promise.allSettled(jobs.map(([, fn]) => Promise.resolve().then(fn)));
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
  refreshAll();          // 최초 1회는 무조건
  startAutoRefresh();    // 근무시간만
  setInterval(startAutoRefresh, 5 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", init);
