// js/index.js

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
function toYMD(v){
  const s = norm(v);
  if(!s) return "";
  // 2026-02-02
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // 2026.02.02
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) return s.replaceAll(".","-");
  // 2026/02/02
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replaceAll("/","-");
  return s;
}

//  0이면 '-' 표시
function fmt0(n){
  const v = Number(n || 0);
  return v === 0 ? "-" : fmtKR.format(v);
}
function fmtAvg(n){
  const v = Math.round(Number(n || 0));
  return v === 0 ? "-" : fmtKR.format(v);
}

async function fetchText(url){
  const res = await fetch(url, { cache:"no-store" });
  if(!res.ok) throw new Error("HTTP " + res.status);
  return await res.text();
}

//  따옴표 포함 CSV 파서
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

function getKRYMD(offsetDay=0){
  // KST 기준
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
  // "07시30분" "07:30" "13시"
  const m1 = s.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if(!m1) return 999999;
  const hh = Number(m1[1]||0);
  const mm = Number(m1[2]||0);
  return hh*60 + mm;
}
function getStatusByTime(shipTime){
  const tmin = timeToMin(shipTime);
  if(tmin === 999999) return "미정";

  const nowHM = getKSTNowHM();
  const nowMin = timeToMin(nowHM);

  //  현재시간이 상차시간보다 빠르면 대기
  if(nowMin < tmin) return "상차대기";
  //  현재시간이 상차시간~상차시간+120분 사이는 상차중
  if(nowMin >= tmin && nowMin < tmin + 120) return "상차중";
  //  그 이후는 완료
  return "상차완료";
}
function contRank(cont){
  const c = norm(cont).toUpperCase();
  //  컨테이너 정렬: 20 -> 40 -> LCL -> 기타
  if (c === "20") return 1;
  if (c === "40") return 2;
  if (c.includes("LCL")) return 3;
  return 9;
}

// =====================================================
//  CSV URL
// =====================================================
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

// =====================================================
// 1) 출고 누계 (전체) - daily
//   I(8)=20pt, J(9)=40pt, L(11)=LCL
// =====================================================
async function renderShipTotal(){
  const tb = $("ship_total_tbody");
  if(!tb) return;

  const rows = parseCsv(await fetchText(URL_DAILY));

  const COL_20 = 8;  // I
  const COL_40 = 9;  // J
  const COL_LCL = 11;// L

  let s20=0, s40=0, slcl=0;

  for(const r of rows){
    // 헤더/빈줄 스킵
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
// 2) 월별 출고 누계 (1~12월) - daily
//   A(0)=날짜, I/J/L 합산 후 "월"별 집계
// =====================================================
async function renderShipMonthly(){
  const tb = $("ship_monthly_tbody");
  if(!tb) return;

  const rows = parseCsv(await fetchText(URL_DAILY));

  const COL_DATE = 0;
  const COL_20 = 8;
  const COL_40 = 9;
  const COL_LCL = 11;

  const map = new Map(); // month(1~12) -> {s20,s40,slcl}
  for(let m=1;m<=12;m++) map.set(m, {s20:0,s40:0,slcl:0});

  for(const r of rows){
    const d = toYMD(r?.[COL_DATE]);
    if(!d || d.includes("날짜")) continue;
    const m = Number(d.slice(5,7));
    if(!(m>=1 && m<=12)) continue;

    const o = map.get(m);
    o.s20 += toNum(r?.[COL_20]);
    o.s40 += toNum(r?.[COL_40]);
    o.slcl += toNum(r?.[COL_LCL]);
  }

  //  1월~12월 고정 정렬
  const html = [];
  for(let m=1;m<=12;m++){
    const o = map.get(m);
    const sum = o.s20 + o.s40 + o.slcl;
    html.push(`
      <tr>
        <td class="cut">${m}월</td>
        <td>${fmt0(o.s20)}</td>
        <td>${fmt0(o.s40)}</td>
        <td>${fmt0(o.slcl)}</td>
        <td class="font-extrabold">${fmt0(sum)}</td>
      </tr>
    `);
  }
  tb.innerHTML = html.join("");
}

// =====================================================
// 3) 출고정보 (오늘~미래6일) - daily
//   A=날짜, I/J/L
// =====================================================
async function renderShip7Days(){
  const tb = $("ship_7days_tbody");
  if(!tb) return;

  const rows = parseCsv(await fetchText(URL_DAILY));

  const COL_DATE = 0;
  const COL_20 = 8;
  const COL_40 = 9;
  const COL_LCL = 11;

  const start = getKRYMD(0);
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
// 4) 출고 요약 (당일) - sap_doc
//   A(0)=인보이스, E(4)=국가, J(9)=컨테이너, Q(16)=위치, T(19)=상차시간
//   + 상태 계산 + 정렬(20->40->LCL) + 시간정렬
// =====================================================
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

  //  출고일 컬럼 자동탐색
  // 기본 D(3) 기준으로 
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

  //  컨테이너(20->40->LCL) -> 시간 정렬
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
// 5) 보수작업 (당월/다음달)
//   - 작업 예상량: sap_item 날짜(E열) 기준, T열 합계
//   - 작업량(완료): bosu 날짜(B열) 기준, J열="완료"인 F열 합계
// =====================================================
async function renderRepairCards(){
  const elCurPlan = $("rep_cur_plan");
  const elCurDone = $("rep_cur_done");
  const elCurRemain = $("rep_cur_remain");

  const elNextPlan = $("rep_next_plan");
  const elNextDone = $("rep_next_done");
  const elNextRemain = $("rep_next_remain");

  // --- plan: sap_item
  const itemRows = parseCsv(await fetchText(URL_SAP_ITEM));
  const COL_ITEM_DATE = 4; // E
  const COL_ITEM_T = 19;   // T

  const today = getKRYMD(0);
  const y = Number(today.slice(0,4));
  const m = Number(today.slice(5,7));
  const nextY = (m === 12) ? y+1 : y;
  const nextM = (m === 12) ? 1 : m+1;

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

  // --- done: bosu
  const bosuRows = parseCsv(await fetchText(URL_BOSU));
  const COL_BOSU_DATE = 1;   // B
  const COL_BOSU_DONE = 9;   // J
  const COL_BOSU_F = 5;      // F

  let curDone = 0, nextDone = 0;
  for(const r of bosuRows){
    const d = toYMD(r?.[COL_BOSU_DATE]);
    if(!d || d.includes("날짜")) continue;
    const yy = Number(d.slice(0,4));
    const mm = Number(d.slice(5,7));
    const st = norm(r?.[COL_BOSU_DONE]);
    if(st !== "완료") continue;

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

// =====================================================
// 6) 설비 작업 (전월/당월) - daily
//   - 날짜 A열
//   - 설비 작업량: F열(5)
//   - 평균: 합계 / 작업일수(해당월에서 설비값>0인 날짜 수)
// =====================================================
async function renderFacilityCards(){
  
  // - fac_now_*  => "전월" 카드에 표시
  // - fac_next_* => "당월" 카드에 표시
  const elPrevQty = $("fac_now_qty");
  const elPrevAvg = $("fac_now_avg");
  const elCurQty  = $("fac_next_qty");
  const elCurAvg  = $("fac_next_avg");

  const rows = parseCsv(await fetchText(URL_DAILY));
  const COL_DATE = 0;
  const COL_FAC  = 5; // F

  // 오늘 기준 연/월
  const today = getKRYMD(0);
  const y = Number(today.slice(0,4));
  const m = Number(today.slice(5,7));

  //  전월 계산
  const prevY = (m === 1) ? y - 1 : y;
  const prevM = (m === 1) ? 12 : m - 1;

  //  당월(현재월)
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

    // 전월
    if(yy === prevY && mm === prevM){
      prevSum += v;
      if(v > 0) prevDays.add(d); //  "작업한 날"만 카운트
    }

    // 당월
    if(yy === curY && mm === curM){
      curSum += v;
      if(v > 0) curDays.add(d);  //  "작업한 날"만 카운트
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
// 7) 작업장별 작업수량 (전체누계) - daily
//   - D(3)=A, E(4)=B, F(5)=설비
//   - 평균: 합계 / 진짜 작업일수
//     ※ 진짜 작업일수 = (D+E+F) > 0 인 날짜 수
// =====================================================
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
    <tr>
      <td class="cut">보수A</td>
      <td>${fmt0(sA)}</td>
      <td>${fmtAvg(avgA)}</td>
    </tr>
    <tr>
      <td class="cut">보수B</td>
      <td>${fmt0(sB)}</td>
      <td>${fmtAvg(avgB)}</td>
    </tr>
    <tr>
      <td class="cut">설비</td>
      <td>${fmt0(sS)}</td>
      <td>${fmtAvg(avgS)}</td>
    </tr>
    <tr>
      <td class="cut font-extrabold">전체</td>
      <td class="font-extrabold">${fmt0(sAll)}</td>
      <td class="font-extrabold">${fmtAvg(avgAll)}</td>
    </tr>
  `;
}

// =====================================================
// 8) 재고 합계 (wms) - E(4) 합
// =====================================================
async function renderInventorySum(){
  const el = $("k_inventory");
  if(!el) return;

  const rows = parseCsv(await fetchText(URL_WMS));
  const COL_QTY = 4; // E
  let sum = 0;

  for(const r of rows){
    const v = toNum(r?.[COL_QTY]);
    sum += v;
  }
  el.textContent = fmt0(sum);
}

/* =========================
   ⏱ 무깜빡임 데이터 갱신 (KST 06~20만)
   - dashboard.html에서도 동작하도록 "마지막 갱신" 의존 제거
   - 실행 로그 추가
========================= */

// 운영: 30분
// const DATA_REFRESH_MIN = 30;

// 테스트: 1분으로 바꿔서 동작 확인 후 30으로 복귀
const DATA_REFRESH_MIN = 1;

const DATA_REFRESH_MS = DATA_REFRESH_MIN * 60 * 1000;

let _refreshing = false;
let _timer = null;

function getKSTHour() {
  return new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false });
}

// 06:00~20:00만 자동갱신 (20시는 포함 X)
function isAutoRefreshTime() {
  const h = Number(getKSTHour());
  return h >= 6 && h < 20;
}

// (선택) 마지막 갱신 시간 표시 — 있으면 표시, 없으면 그냥 패스
function setLastUpdated() {
  let el = document.querySelector("#boardUpdated");
  if (!el) el = document.querySelector("#boardBar span.font-extrabold.text-sky-700");
  // if (!el) el = document.querySelector("#dataUpdated");

  if (!el) return;

  const now = new Date();
  const fmt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  el.textContent = fmt.format(now);
}

async function refreshAll() {
  if (_refreshing) return;
  _refreshing = true;

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

    if (fail) {
      console.warn("[REFRESH] some jobs failed:", results);
    }

    console.log(`[REFRESH] done | ok=${ok} fail=${fail}`);
    setLastUpdated();
  } catch (e) {
    console.warn("refreshAll error:", e);
  } finally {
    _refreshing = false;
  }
}

function startAutoRefresh() {
  // 기존 타이머 제거
  if (_timer) clearInterval(_timer);
  _timer = null;

  // 근무시간이면 타이머 시작
  if (isAutoRefreshTime()) {
    console.log(`[REFRESH] timer ON (${DATA_REFRESH_MIN}min)`);
    _timer = setInterval(() => {
      // 근무시간 벗어나면 자동 중지
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
  // 최초 1회 로딩은 항상 실행
  refreshAll();

  // 근무시간(06~20)만 갱신
  startAutoRefresh();

  // 시간이 06/20 넘어갈 때 타이머 on/off 되도록 5분마다 체크
  setInterval(startAutoRefresh, 5 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", init);
