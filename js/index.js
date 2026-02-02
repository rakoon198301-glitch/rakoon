/* ============================================================
   index.js (Dashboard - Shipping)
   - 데이터: daily(출고 누계/월별/7일), sap_doc(출고 요약: 오늘)
   - 자동 새로고침 없음
   - 상단바: 시계 + 풀스크린만 연결
============================================================ */

/* =========================
   ✅ CSV URL
========================= */
const URL_DAILY =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=430924108&single=true&output=csv";

const URL_SAP_DOC =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=1210262064&single=true&output=csv";

/* =========================
   ✅ 공통 유틸
========================= */
const fmt = new Intl.NumberFormat("ko-KR");

function $(id) {
  return document.getElementById(id);
}

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

// 날짜 문자열 → YYYY-MM-DD
function toYMD(s) {
  s = norm(s);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (m)
    return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(
      2,
      "0"
    )}`;

  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m)
    return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(
      2,
      "0"
    )}`;

  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) {
    const year = getKRYMD(0).slice(0, 4);
    return `${year}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(
      2,
      "0"
    )}`;
  }
  return s;
}

// YYYY-MM 이동
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

async function fetchText(url) {
  const res = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("CSV 로딩 실패: HTTP " + res.status);
  return await res.text();
}

// 따옴표 안의 콤마/줄바꿈 처리 CSV 파서
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

  if (field.length || row.length) {
    row.push(field);
    rows.push(row.map((v) => (v ?? "").replace(/\r/g, "")));
  }

  return rows;
}

/* =========================
   ✅ 시간/상태 계산
   - "07시", "07:00", "07시 00분" 등 대응
   - now < 예정시간 : 상차대기
   - now ∈ [예정시간, 예정시간+10분] : 상차중 (강조)
   - now > 예정시간+10분 : 상차완료
========================= */
function parseKoreanTime(s) {
  s = norm(s);
  if (!s) return null;

  // 07:10
  let m = s.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (m) return { h: Number(m[1]), m: Number(m[2]) };

  // 07시10분 / 07시 10분
  m = s.match(/(\d{1,2})\s*시\s*(\d{1,2})?\s*분?/);
  if (m) return { h: Number(m[1]), m: Number(m[2] ?? 0) };

  // 07 (숫자만)
  m = s.match(/^(\d{1,2})$/);
  if (m) return { h: Number(m[1]), m: 0 };

  return null;
}

function getNowKSTMinutes() {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hh * 60 + mm;
}

function getStatusByTime(planTimeStr) {
  const t = parseKoreanTime(planTimeStr);
  if (!t) return "미정";

  const planMin = t.h * 60 + t.m;
  const nowMin = getNowKSTMinutes();

  if (nowMin < planMin) return "상차대기";
  if (nowMin <= planMin + 10) return "상차중";
  return "상차완료";
}

/* =========================
   ✅ 컨테이너 정렬: 20 → 40 → LCL
========================= */
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
  return t.h * 60 + t.m;
}

/* ============================================================
   1) 출고 누계 (전체) - daily
   tbody id="ship_total_tbody"
   - I(8), J(9), L(11) 합계
============================================================ */
async function renderShipTotalAll() {
  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  const COL_20 = 8;   // I
  const COL_40 = 9;   // J
  const COL_LCL = 11; // L

  let s20 = 0, s40 = 0, sl = 0;

  for (const r of rows) {
    // 숫자 합만 내면 되므로 헤더행/빈행 자연스럽게 0 처리됨
    s20 += toNum(r?.[COL_20]);
    s40 += toNum(r?.[COL_40]);
    sl  += toNum(r?.[COL_LCL]);
  }

  const total = s20 + s40 + sl;

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
   - 조건: 오늘 날짜 + P열(수출 작업의뢰서)만
   - 정렬: 컨테이너(20→40→LCL) + 시간 오름차순
   - 컬럼:
     인보이스 A(0)
     국가 E(4)
     컨테이너 J(9)
     상차위치 Q(16)
     상차시간 T(19)
     상태: 시간 비교
============================================================ */
async function renderShipTodayAll() {
  const text = await fetchText(URL_SAP_DOC);
  const rows = parseCsv(text);

  const today = getKRYMD(0);

  const COL_INV = 0;        // A
  const COL_SHIP_DATE = 3;  // D (출고일)
  const COL_COUNTRY = 4;    // E
  const COL_CONT = 9;       // J
  const COL_KIND = 15;      // P (수출 작업의뢰서)
  const COL_LOC = 16;       // Q (상차위치)
  const COL_TIME = 19;      // T (상차시간)

  const data = [];

  for (const r of rows) {
    const inv = norm(r?.[COL_INV]);
    if (!inv || inv.includes("인보") || inv === "A") continue;

    const shipDate = toYMD(r?.[COL_SHIP_DATE]);
    if (shipDate !== today) continue;

    // ✅ P열 필터: 수출 작업의뢰서만
    const kind = norm(r?.[COL_KIND]);
    if (kind !== "수출 작업의뢰서") continue;

    const country = norm(r?.[COL_COUNTRY]);
    const cont = norm(r?.[COL_CONT]);
    const loc = norm(r?.[COL_LOC]);
    const time = norm(r?.[COL_TIME]);

    const status = getStatusByTime(time);

    data.push({
      inv,
      country,
      cont,
      loc,
      time,
      status,
      _rank: contRank(cont),
      _tmin: timeToMin(time),
    });
  }

  // ✅ 정렬: 20 → 40 → LCL, 그 안에서 시간 오름차순
  data.sort((a, b) => {
    if (a._rank !== b._rank) return a._rank - b._rank;
    return a._tmin - b._tmin;
  });

  const tb = $("ship_today_tbody");
  if (!tb) return;

  if (data.length === 0) {
    tb.innerHTML = `<tr><td colspan="6" class="muted">오늘 출고 없음</td></tr>`;
    return;
  }

  tb.innerHTML = data
    .map((x) => {
      const isLoading = x.status === "상차중";
      const rowCls = isLoading ? "bg-yellow-50" : "";
      const boldCls = isLoading ? "font-extrabold" : "";

      const stCls =
        x.status === "상차중"
          ? "text-amber-700 font-extrabold"
          : x.status === "상차대기"
          ? "text-slate-600 font-extrabold"
          : "text-emerald-700 font-extrabold";

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
    })
    .join("");
}

/* ============================================================
   3) 월별 출고 누계 (최근 12개월) - daily
   tbody id="ship_monthly_tbody"
   - A열 날짜 기준으로 YYYY-MM 그룹
   - I(8) / J(9) / L(11) 합
============================================================ */
async function renderShipMonthly12() {
  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  const COL_DATE = 0; // A
  const COL_20 = 8;   // I
  const COL_40 = 9;   // J
  const COL_LCL = 11; // L

  const map = new Map(); // YYYY-MM -> {pt20, pt40, lcl}

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.includes("날짜") || d === "A") continue;

    const ym = d.slice(0, 7);
    const v20 = toNum(r?.[COL_20]);
    const v40 = toNum(r?.[COL_40]);
    const vL = toNum(r?.[COL_LCL]);

    if (!map.has(ym)) map.set(ym, { pt20: 0, pt40: 0, lcl: 0 });
    const o = map.get(ym);
    o.pt20 += v20;
    o.pt40 += v40;
    o.lcl += vL;
  }

  const nowYM = getKRYMD(0).slice(0, 7);

  const months = [];
  for (let i = 11; i >= 0; i--) months.push(shiftYM(nowYM, -i));

  const tb = $("ship_monthly_tbody");
  if (!tb) return;

  tb.innerHTML = months
    .map((ym) => {
      const o = map.get(ym) || { pt20: 0, pt40: 0, lcl: 0 };
      const total = o.pt20 + o.pt40 + o.lcl;

      return `
        <tr>
          <td class="cut">${monthLabel(ym)}</td>
          <td class="num">${fmt.format(o.pt20)}</td>
          <td class="num">${fmt.format(o.pt40)}</td>
          <td class="num">${fmt.format(o.lcl)}</td>
          <td class="num">${fmt.format(total)}</td>
        </tr>
      `;
    })
    .join("");
}

/* ============================================================
   4) 출고정보 (오늘 기준 미래 6일 포함, 총 7일) - daily
   tbody id="ship_7days_tbody"
   - 날짜 A(0)
   - I(8) / J(9) / L(11)
============================================================ */
async function renderShip7DaysFuture() {
  const text = await fetchText(URL_DAILY);
  const rows = parseCsv(text);

  const COL_DATE = 0; // A
  const COL_20 = 8;   // I
  const COL_40 = 9;   // J
  const COL_LCL = 11; // L

  // 오늘 ~ +6일
  const days = [];
  for (let i = 0; i < 7; i++) days.push(getKRYMD(i));

  const map = new Map(); // YYYY-MM-DD -> {pt20, pt40, lcl}
  for (const d of days) map.set(d, { pt20: 0, pt40: 0, lcl: 0 });

  for (const r of rows) {
    const d = toYMD(r?.[COL_DATE]);
    if (!d || d.includes("날짜") || d === "A") continue;
    if (!map.has(d)) continue;

    const o = map.get(d);
    o.pt20 += toNum(r?.[COL_20]);
    o.pt40 += toNum(r?.[COL_40]);
    o.lcl += toNum(r?.[COL_LCL]);
  }

  const tb = $("ship_7days_tbody");
  if (!tb) return;

  tb.innerHTML = days
    .map((d) => {
      const o = map.get(d) || { pt20: 0, pt40: 0, lcl: 0 };
      const total = o.pt20 + o.pt40 + o.lcl;
      const label = `${d.slice(5, 7)}-${d.slice(8, 10)}`; // MM-DD

      return `
        <tr>
          <td class="cut">${label}</td>
          <td class="num">${fmt.format(o.pt20)}</td>
          <td class="num">${fmt.format(o.pt40)}</td>
          <td class="num">${fmt.format(o.lcl)}</td>
          <td class="num">${fmt.format(total)}</td>
        </tr>
      `;
    })
    .join("");
}

/* ============================================================
   5) 상단바: 시계 + 풀스크린 (자동갱신 없음)
============================================================ */
function initTopBarClockAndFullscreen() {
  const clockEl = $("boardClock");
  const fsBtn = $("btnFullscreen");

  const KST_TIME_FMT = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
      } catch (e) {
        console.warn("fullscreen failed:", e);
      }
    });
  }
}

/* ============================================================
   ✅ 실행
============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 상단바 기능(시계/풀스크린)
    initTopBarClockAndFullscreen();

    // 출고 누계(전체)
    await renderShipTotalAll();

    // 출고 요약(오늘, P=수출 작업의뢰서만, 정렬 20→40→LCL + 시간)
    await renderShipTodayAll();

    // 월별 출고 누계(최근 12개월)
    await renderShipMonthly12();

    // 출고정보(오늘~미래 6일, 총 7일)
    await renderShip7DaysFuture();
  } catch (e) {
    console.error("index.js error:", e);
  }
});
