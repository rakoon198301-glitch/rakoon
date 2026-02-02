/* =========================
   Dashboard index.js (전체 통합)
   - 출고요약(당일): sap_doc
   - 출고누계/월별/7일: daily
   - 보수(예상/완료/잔량): sap_item + bosu
   - 설비(당월/다음달): daily
   - 작업장별(전체누계): daily
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
   DOM helpers
========================= */
const $ = (id) => document.getElementById(id);
const fmtKR = new Intl.NumberFormat("ko-KR");

/* =========================
   KST date/time helpers
========================= */
const KST_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getKRYMD(offsetDays = 0) {
  return KST_YMD.format(new Date(Date.now() + offsetDays * 86400_000));
}

function nowKST_HM() {
  // "07:10" 형태
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return f.format(new Date());
}

function ymFromYMD(ymd) { return String(ymd || "").slice(0, 7); }

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
   CSV
========================= */
async function fetchText(url) {
  const u = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) throw new Error("CSV 로딩 실패: " + res.status);
  return await res.text();
}

// 따옴표 포함 CSV 파서
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

    if (ch === "," && !inQuotes) {
      row.push(field); field = "";
      continue;
    }

    if (ch === "\n" && !inQuotes) {
      row.push(field); field = "";
      rows.push(row.map(v => String(v ?? "").replace(/\r/g, "")));
      row = [];
      continue;
    }

    field += ch;
  }
  // last
  if (field.length || row.length) {
    row.push(field);
    rows.push(row.map(v => String(v ?? "").replace(/\r/g, "")));
  }
  return rows;
}

async function loadCsvRows(url) {
  const text = await fetchText(url);
  return parseCsv(text);
}

/* =========================
   normalize / number / date parse
========================= */
function norm(v) {
  return String(v ?? "").replace(/\r/g, "").trim();
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

// 날짜 문자열 -> YYYY-MM-DD (가능한 만큼 대응)
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
    const year = getKRYMD(0).slice(0,4);
    return `${year}-${String(m[1]).padStart(2,"0")}-${String(m[2]).padStart(2,"0")}`;
  }
  return s;
}

/* =========================
   출고요약(당일) - sap_doc
   - 인보이스 A(0)
   - 출고일 D(3)  (오늘만)
   - 국가 E(4)
   - 컨테이너 J(9)
   - 상차위치 Q(16)
   - 상차시간 T(19)
   - 상태: 현재시간 vs 상차시간 (상차시간+2시간=완료)
   - 정렬: 20 -> 40 -> LCL, 그 다음 시간 오름차순
========================= */

// 컨테이너 순서: 20 / 40 / LCL / 기타
function contRank(v) {
  const s = norm(v).toUpperCase();
  const n = s.replace(/[^0-9]/g, "");
  if (n.startsWith("20")) return 1;
  if (n.startsWith("40")) return 2;
  if (s.includes("LCL")) return 3;
  return 9;
}

function timeToMin(v) {
  const s = norm(v);
  if (!s) return 9999;

  // "07시", "07:10", "07시10분" 등
  let m = s.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
  if (!m) return 9999;
  const hh = Number(m[1]);
  const mm = Number(m[2] ?? 0);
  return hh * 60 + mm;
}

function getStatusByTime(schedTimeStr) {
  const tmin = timeToMin(schedTimeStr);
  if (tmin >= 9999) return "-";

  const nowHM = nowKST_HM(); // "07:10"
  const nowMin = timeToMin(nowHM);

  if (nowMin < tmin) return "상차대기";
  if (nowMin >= tmin && nowMin < tmin + 120) return "상차중";
  return "상차완료";
}

async function renderShipTodayAll() {
  const rows = await loadCsvRows(URL_SAP_DOC);
  const today = getKRYMD(0);

  const COL_INV = 0;        // A
  const COL_SHIP_DATE = 3;  // D
  const COL_COUNTRY = 4;    // E
  const COL_CONT = 9;       // J
  const COL_LOC = 16;       // Q
  const COL_TIME = 19;      // T

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

  const tb = $("ship_today_tbody");
  if (!tb) return;

  if (data.length === 0) {
    tb.innerHTML = `<tr><td colspan="6" class="muted">오늘 출고 없음</td></tr>`;
    return;
  }

  tb.innerHTML = data.map(x => {
    const isLoading = x.status === "상차중";

    const rowCls = isLoading ? "row-loading" : "";
    const stCls =
      x.status === "상차중" ? "st-loading" :
      x.status === "상차대기" ? "st-wait" :
      x.status === "상차완료" ? "st-done" :
      "st-wait";

    return `
      <tr class="${rowCls}">
        <td class="cut">${x.inv}</td>
        <td class="cut">${x.country || "-"}</td>
        <td class="cut">${x.cont || "-"}</td>
        <td class="cut">${x.loc || "-"}</td>
        <td class="cut">${x.time || "-"}</td>
        <td class="cut ${stCls}">${x.status}</td>
      </tr>
    `;
  }).join("");
}

/* =========================
   daily 기반
   - 출고누계(전체): I(8), J(9), L(11) 합
   - 월별출고누계: A(0) 날짜 -> 월 그룹 (현재연도 1~12 정렬)
   - 출고정보 7일: 오늘~미래6일(총 7일) 날짜별 합
========================= */

async function renderShipTotalAll() {
  const rows = await loadCsvRows(URL_DAILY);

  const COL_20 = 8;  // I
  const COL_40 = 9;  // J
  const COL_LCL = 11;// L

  let s20 = 0, s40 = 0, sL = 0;

  for (const r of rows) {
    // 헤더/빈행 방지: 숫자 합만
    s20 += toNum(r?.[COL_20]);
    s40 += toNum(r?.[COL_40]);
    sL  += toNum(r?.[COL_LCL]);
  }

  const tb = $("ship_total_tbody");
  if (!tb) return;

  const sum = s20 + s40 + sL;

  tb.innerHTML = `
    <tr>
      <td class="cut">전체</td>
      <td>${fmtKR.format(s20)}</td>
      <td>${fmtKR.format(s40)}</td>
      <td>${fmtKR.format(sL)}</td>
      <td>${fmtKR.format(sum)}</td>
    </tr>
  `;
}

async function renderShipMonthly12() {
  const rows = await loadCsvRows(URL_DAILY);

  const COL_DATE = 0; // A
  const COL_20 = 8;   // I
  const COL_40 = 9;   // J
  const COL_LCL = 11; // L

  const year = getKRYMD(0).slice(0, 4);
  const map = new Map(); // "01" -> {20,40,lcl}

  for (let m = 1; m <= 12; m++) {
    map.set(String(m).padStart(2, "0"), { s20: 0, s40: 0, sL: 0 });
  }

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.length < 10) continue;
    if (!d.startsWith(year + "-")) continue;

    const mm = d.slice(5, 7);
    if (!map.has(mm)) continue;

    const obj = map.get(mm);
    obj.s20 += toNum(r?.[COL_20]);
    obj.s40 += toNum(r?.[COL_40]);
    obj.sL  += toNum(r?.[COL_LCL]);
  }

  const tb = $("ship_monthly_tbody");
  if (!tb) return;

  const html = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const v = map.get(mm);
    const sum = v.s20 + v.s40 + v.sL;
    html.push(`
      <tr>
        <td class="cut">${m}월</td>
        <td>${fmtKR.format(v.s20)}</td>
        <td>${fmtKR.format(v.s40)}</td>
        <td>${fmtKR.format(v.sL)}</td>
        <td>${fmtKR.format(sum)}</td>
      </tr>
    `);
  }

  tb.innerHTML = html.join("");
}

async function renderShipFuture7Days() {
  const rows = await loadCsvRows(URL_DAILY);

  const COL_DATE = 0; // A
  const COL_20 = 8;   // I
  const COL_40 = 9;   // J
  const COL_LCL = 11; // L

  // 오늘~미래6일
  const days = [];
  for (let i = 0; i <= 6; i++) days.push(getKRYMD(i));
  const setDays = new Set(days);

  const map = new Map();
  for (const d of days) map.set(d, { s20:0, s40:0, sL:0 });

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!setDays.has(d)) continue;

    const obj = map.get(d);
    obj.s20 += toNum(r?.[COL_20]);
    obj.s40 += toNum(r?.[COL_40]);
    obj.sL  += toNum(r?.[COL_LCL]);
  }

  const tb = $("ship_7days_tbody");
  if (!tb) return;

  tb.innerHTML = days.map(d => {
    const v = map.get(d);
    const sum = v.s20 + v.s40 + v.sL;
    return `
      <tr>
        <td class="cut">${d}</td>
        <td>${fmtKR.format(v.s20)}</td>
        <td>${fmtKR.format(v.s40)}</td>
        <td>${fmtKR.format(v.sL)}</td>
        <td>${fmtKR.format(sum)}</td>
      </tr>
    `;
  }).join("");
}

/* =========================
   보수작업
   - 예상량(sap_item): 날짜 E(4), T(19) 합
   - 완료(bosu): 날짜 B(1), J(9)="완료", F(5) 합
   - 잔량 = 예상 - 완료
========================= */

async function calcBosuExpected(ymTarget) {
  const rows = await loadCsvRows(URL_SAP_ITEM);
  const COL_DATE = 4;  // E
  const COL_VAL  = 19; // T
  let sum = 0;

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.includes("날짜")) continue;
    if (ymFromYMD(d) !== ymTarget) continue;
    sum += toNum(r?.[COL_VAL]);
  }
  return sum;
}

async function calcBosuDone(ymTarget) {
  const rows = await loadCsvRows(URL_BOSU);
  const COL_DATE = 1;   // B
  const COL_QTY  = 5;   // F
  const COL_ST   = 9;   // J

  let sum = 0;
  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.includes("날짜")) continue;
    if (ymFromYMD(d) !== ymTarget) continue;

    const st = norm(r?.[COL_ST]);
    if (st !== "완료") continue;

    sum += toNum(r?.[COL_QTY]);
  }
  return sum;
}

async function renderBosuMonth() {
  const ymNow  = ymFromYMD(getKRYMD(0));
  const ymNext = shiftYM(ymNow, 1);

  const [expNow, doneNow, expNext, doneNext] = await Promise.all([
    calcBosuExpected(ymNow),
    calcBosuDone(ymNow),
    calcBosuExpected(ymNext),
    calcBosuDone(ymNext),
  ]);

  const tb = $("bosu_month_tbody");
  if (!tb) return;

  const remNow  = expNow - doneNow;
  const remNext = expNext - doneNext;

  tb.innerHTML = `
    <tr>
      <td class="cut">${monthLabel(ymNow)}</td>
      <td>${fmtKR.format(expNow)}</td>
      <td>${fmtKR.format(doneNow)}</td>
      <td>${fmtKR.format(remNow)}</td>
    </tr>
    <tr>
      <td class="cut">${monthLabel(ymNext)}</td>
      <td>${fmtKR.format(expNext)}</td>
      <td>${fmtKR.format(doneNext)}</td>
      <td>${fmtKR.format(remNext)}</td>
    </tr>
  `;
}

/* =========================
   설비 작업(당월/다음달)
   - daily: 날짜 A(0), 설비작업량 F(5)
   - 작업일: 해당 월에서 F>0인 날짜 수
   - 평균: 작업량 / 작업일 (반올림)
========================= */

async function calcSystemMonth(ymTarget) {
  const rows = await loadCsvRows(URL_DAILY);
  const COL_DATE = 0; // A
  const COL_SYS  = 5; // F

  let sum = 0;
  const days = new Set();

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.length < 10) continue;
    if (ymFromYMD(d) !== ymTarget) continue;

    const q = toNum(r?.[COL_SYS]);
    if (q > 0) {
      sum += q;
      days.add(d);
    }
  }

  const workDays = days.size;
  const avg = workDays ? Math.round(sum / workDays) : 0;
  return { sum, workDays, avg };
}

async function renderSystemMonth() {
  const ymNow  = ymFromYMD(getKRYMD(0));
  const ymNext = shiftYM(ymNow, 1);

  const [a, b] = await Promise.all([
    calcSystemMonth(ymNow),
    calcSystemMonth(ymNext),
  ]);

  const tb = $("system_month_tbody");
  if (!tb) return;

  tb.innerHTML = `
    <tr>
      <td class="cut">${monthLabel(ymNow)}</td>
      <td>${fmtKR.format(a.sum)}</td>
      <td>${fmtKR.format(a.workDays)}</td>
      <td>${fmtKR.format(a.avg)}</td>
    </tr>
    <tr>
      <td class="cut">${monthLabel(ymNext)}</td>
      <td>${fmtKR.format(b.sum)}</td>
      <td>${fmtKR.format(b.workDays)}</td>
      <td>${fmtKR.format(b.avg)}</td>
    </tr>
  `;
}

/* =========================
   작업장별 작업수량(전체누계)
   - daily:
     보수A = D(3) 합
     보수B = E(4) 합
     설비  = F(5) 합
     작업일: (D+E+F)>0 인 날짜 수
     평균: 합/작업일
========================= */

async function renderWorkplaceTotal() {
  const rows = await loadCsvRows(URL_DAILY);

  const COL_DATE = 0; // A
  const COL_A = 3;    // D
  const COL_B = 4;    // E
  const COL_S = 5;    // F

  let a=0, b=0, s=0;
  const days = new Set();

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.length < 10) continue;

    const qa = toNum(r?.[COL_A]);
    const qb = toNum(r?.[COL_B]);
    const qs = toNum(r?.[COL_S]);

    a += qa;
    b += qb;
    s += qs;

    if (qa + qb + qs > 0) days.add(d);
  }

  const wd = days.size || 1;
  const all = a+b+s;

  const tb = $("workplace_total_tbody");
  if (!tb) return;

  tb.innerHTML = `
    <tr>
      <td class="cut">보수A</td>
      <td>${fmtKR.format(a)}</td>
      <td>${fmtKR.format(Math.round(a/wd))}</td>
    </tr>
    <tr>
      <td class="cut">보수B</td>
      <td>${fmtKR.format(b)}</td>
      <td>${fmtKR.format(Math.round(b/wd))}</td>
    </tr>
    <tr>
      <td class="cut">설비</td>
      <td>${fmtKR.format(s)}</td>
      <td>${fmtKR.format(Math.round(s/wd))}</td>
    </tr>
    <tr>
      <td class="cut font-extrabold">전체</td>
      <td class="font-extrabold">${fmtKR.format(all)}</td>
      <td class="font-extrabold">${fmtKR.format(Math.round(all/wd))}</td>
    </tr>
  `;
}

/* =========================
   상단바: 시계 / 풀스크린 / 메뉴
========================= */
function setupBoardBar() {
  const clockEl = $("boardClock");
  const updatedEl = $("boardUpdated");
  const fsBtn = $("btnFullscreen");

  // 시계
  const KST_TIME_FMT = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const tick = () => {
    if (clockEl) clockEl.textContent = KST_TIME_FMT.format(new Date());
  };
  tick();
  setInterval(tick, 1000);

  // 풀스크린
  if (fsBtn) {
    fsBtn.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch (e) {
        console.warn("fullscreen failed:", e);
      }
    });
  }

  // MENU 드롭다운
  const btn = $("btnMenu");
  const panel = $("menuPanel");
  btn?.addEventListener("click", () => {
    if (!panel) return;
    panel.style.display = panel.style.display === "block" ? "none" : "block";
  });
  document.addEventListener("click", (e) => {
    if (!panel || !btn) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    panel.style.display = "none";
  });

  // 갱신 시간
  const setUpdated = () => {
    if (!updatedEl) return;
    const t = new Date().toISOString().replace("T"," ").slice(0,19);
    updatedEl.textContent = t;
  };
  setUpdated();
  return setUpdated;
}

/* =========================
   init
========================= */
(async function init() {
  const setUpdated = setupBoardBar();

  try {
    // 병렬 로드
    await Promise.all([
      renderShipTodayAll(),
      renderShipTotalAll(),
      renderShipMonthly12(),
      renderShipFuture7Days(),
      renderBosuMonth(),
      renderSystemMonth(),
      renderWorkplaceTotal(),
    ]);

    setUpdated?.();
  } catch (e) {
    console.error(e);
    // 최소한 표 하나는 보이게 처리 (원하면 더 상세 오류표시도 가능)
  }
})();

