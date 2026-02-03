/* =========================================
   시설(설비) - dashboard-보수 연결 JS
   - CSV: system
   - KPI + 작업대기 리스트(15칸) 렌더링
========================================= */

const SYSTEM_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR38uWRSPB1R5tN2dtukAhPMTppV7Y10UkgC4Su5UTXuqokN8vr6qDjHcQVxVzUvaWmWR-FX6xrVm9z/pub?gid=1693227803&single=true&output=csv";

// ===== DOM Helper =====
const $ = (id) => document.getElementById(id);

// ===== CSV fetch + parse (따옴표/콤마/줄바꿈 대응) =====
async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("CSV fetch fail: " + res.status);
  return await res.text();
}

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
      rows.push(row.map(v => (v ?? "").replace(/\r/g, "").trim()));
      row = [];
      field = "";
      continue;
    }

    field += ch;
  }

  // last
  if (field.length || row.length) {
    row.push(field);
    rows.push(row.map(v => (v ?? "").replace(/\r/g, "").trim()));
  }

  return rows;
}

// ===== Date / Number utils =====
function kstYMD() {
  // "YYYY-MM-DD"
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now);
}

// CSV의 D열 날짜가 2026.2.3 / 2026/02/03 / 2026-2-3 / 2026-02-03 모두 올 수 있으니 정규화
function normYMD(x) {
  if (!x) return "";
  let s = String(x).trim();
  if (!s || s.includes("날짜")) return "";

  s = s.replace(/\./g, "-").replace(/\//g, "-").replace(/\s+/g, "");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return "";

  const yy = m[1];
  const mm = String(m[2]).padStart(2, "0");
  const dd = String(m[3]).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function toNum(v) {
  if (v == null) return 0;
  const s = String(v).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const nf0 = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
function fmt0(n) { return nf0.format(toNum(n)); }

// ===== 메인 렌더 =====
async function renderFacilityFromSystem() {
  const text = await fetchText(SYSTEM_CSV_URL);
  const rows = parseCsv(text);

 // 컬럼 인덱스 (0-based)
 const COL_INV     = 0;  // A 인보이스
 const COL_COUNTRY = 1;  // B 국가   ✅ 추가 컬럼
 const COL_DATE    = 3;  // D 날짜
 const COL_STATUS  = 4;  // E 상태
 const COL_MAT     = 6;  // G 자재번호
 const COL_BOX     = 7;  // H 박스번호
 const COL_NAME    = 8;  // I 자재내역 (기존 품명)
 const COL_SUM     = 9;  // J 합계
 const COL_OUTBOX  = 10; // K 외박스
 const COL_INBOX   = 11; // L 제품


  const today = kstYMD();

  // 헤더 제거(첫 행에 "인보이스" 같은 글자가 있을 수 있음)
  const data = rows.filter(r => r && r.length > 0);

  // 오늘(D열 기준)
  const todayRows = data.filter(r => normYMD(r[COL_DATE]) === today);

  // KPI 계산
  const totalSum = todayRows.reduce((acc, r) => acc + toNum(r[COL_SUM]), 0);

  const doneRows = todayRows.filter(r => String(r[COL_STATUS] || "").trim() === "완료");
  const doneSum = doneRows.reduce((acc, r) => acc + toNum(r[COL_SUM]), 0);

  const rate = totalSum > 0 ? (doneSum / totalSum) * 100 : 0;

  // "작업중" 첫 행에서 인보이스/국가 표시
  const workingRow = todayRows.find(r => String(r[COL_STATUS] || "").trim() === "작업중");
  const invoice = workingRow ? (workingRow[COL_INV] || "-") : "-";
  const country = workingRow ? (workingRow[COL_COUNTRY] || "-") : "-";

  // KPI 반영
  if ($("kpiTotal")) $("kpiTotal").textContent = fmt0(totalSum);
  if ($("kpiDone")) $("kpiDone").textContent = fmt0(doneSum);
  if ($("kpiRate")) $("kpiRate").textContent = `${Math.round(rate)}%`;
  if ($("kpiBar"))  $("kpiBar").style.width = `${Math.max(0, Math.min(100, rate))}%`;

  if ($("kpiInvoice")) $("kpiInvoice").textContent = invoice;
  if ($("kpiCountry")) $("kpiCountry").textContent = country;

  // 작업대기 리스트: 오늘 중 완료 제외
  let waitRows = todayRows.filter(r => String(r[COL_STATUS] || "").trim() !== "완료");

  // 정렬: 작업중 최상단 -> 그 외
  waitRows.sort((a, b) => {
    const sa = String(a[COL_STATUS] || "").trim();
    const sb = String(b[COL_STATUS] || "").trim();
    const pa = (sa === "작업중") ? 0 : 1;
    const pb = (sb === "작업중") ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return 0; // 나머지는 원래 순서 비슷하게 유지
  });

  // 15칸 고정 노출
  const maxRows = 15;
  const showRows = waitRows.slice(0, maxRows);

  if ($("waitCount")) $("waitCount").textContent = String(waitRows.length);

  const tbody = $("waitTbody");
  if (tbody) {
    tbody.innerHTML = "";

    // 표시 rows
 for (const r of showRows) {
  const status = String(r[COL_STATUS] || "").trim();

  const tr = document.createElement("tr");
  tr.className = "rowHover";

  // 작업중 강조
  if (status === "작업중") tr.className = "rowHover bg-amber-50";

  const inv = r[COL_INV] || "";
  const ctry = r[COL_COUNTRY] || "";   // ✅ 각 행의 국가(B열)
  const mat = r[COL_MAT] || "";
  const box = r[COL_BOX] || "";
  const name = r[COL_NAME] || "";
  const outb = r[COL_OUTBOX] || "";
  const inb  = r[COL_INBOX] || "";
  const sum  = fmt0(r[COL_SUM]);

  tr.innerHTML = `
    <td>${escapeHtml(inv)}</td>
    <td>${escapeHtml(ctry)}</td>
    <td>${escapeHtml(mat)}</td>
    <td>${escapeHtml(box)}</td>
    <td class="max-w-[520px] truncate">${escapeHtml(name)}</td>
    <td style="text-align:right;">${escapeHtml(outb)}</td>
    <td style="text-align:right;">${escapeHtml(inb)}</td>
    <td style="text-align:right; font-weight:700;">${sum}</td>
  `;
  tbody.appendChild(tr);
 }


    // 빈줄 채우기
    const need = maxRows - showRows.length;
    for (let i = 0; i < need; i++) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="text-slate-300">-</td>
        <td class="text-slate-300">-</td>
        <td class="text-slate-300">-</td>
        <td class="text-slate-300">-</td>
        <td class="text-slate-300" style="text-align:right;">-</td>
        <td class="text-slate-300" style="text-align:right;">-</td>
        <td class="text-slate-300" style="text-align:right;">-</td>
      `;
      tbody.appendChild(tr);
    }
  }

  console.log("[FACILITY] rendered", { today, totalSum, doneSum, rate, wait: waitRows.length });
}

// XSS 방지용(표 안에 텍스트만 넣기)
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

// ===== init =====
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await renderFacilityFromSystem();
  } catch (e) {
    console.error("Facility init error:", e);
  }
});
