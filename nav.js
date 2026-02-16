/* ============================================================
   nav.js
============================================================ */
(function () {
  const LG_MIN = 1024;
  const SIDEBAR_W = 300; 

  const qs = (s, p = document) => p.querySelector(s);

  function isDesktop() {
    return window.innerWidth >= LG_MIN;
  }

  function kstTimestamp() {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date());
  }

  function currentPage() {
    return (location.pathname.split("/").pop() || "index.html").toLowerCase();
  }

  function injectIfMissing() {
    if (qs("#sidebar") && qs("#sidebarOverlay")) return;

    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <!--  Overlay (모바일 전용) -->
      <div id="sidebarOverlay" class="fixed inset-0 bg-black/40 z-40 hidden lg:hidden"></div>

      <!--  Sidebar -->
      <aside id="sidebar"
        class="fixed z-50 top-0 left-0 h-full w-[270px] md:w-[290px] lg:w-[300px]
               transition-transform duration-200 ease-out">
        <div class="h-full pt-16 px-3">
          <div class="bg-[#1f2a58] text-white rounded-2xl overflow-hidden shadow-sm h-[calc(100vh-5rem)]">
            <div class="px-4 py-4 border-b border-white/10">
              <div class="flex items-center gap-2">
                <div class="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center font-bold text-sm">NK</div>
                <div class="min-w-0">
                  <div class="text-sm font-semibold leading-5 truncate">남경 검수시스템</div>
                  <div class="text-[11px] text-white/70">남경 Dashboard</div>
                </div>
              </div>

              <div class="mt-3">
                <div class="text-[11px] text-white/70">데이터 상태</div>
                <div class="mt-1 flex items-center justify-between">
                  <span id="dataStatus" class="text-[12px] font-semibold">대기</span>
                  <span id="dataUpdated" class="text-[11px] text-white/70">-</span>
                </div>
              </div>
            </div>

            <nav class="px-2 py-2">
              <a href="index.html" data-nav
                 class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10">
                <span class="text-[12px] font-semibold">DASHBOARD</span>
              </a>

              <!--  DASHBOARD-보수 -> dashboard.html -->
              <a href="dashboard.html" data-nav
                 class="mt-1 flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/10">
                <span class="text-[12px]">DASHBOARD-보수</span>
                <span class="text-[10px] px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-200 border border-amber-300/20">WORK</span>
              </a>

              <div class="mt-2 space-y-1">
                ${navItem("scan.html", "상차 스캔", "SCAN", "sky")}
                ${navItem("IN.html", "입고검수", "OPEN", "emerald")}
                ${navItem("OUT.html", "출고검수", "OPEN", "emerald")}
                ${navItem("index_shipping.html", "출고정보", "VIEW", "plain")}
                ${navItem("index_stock.html", "재고조회", "VIEW", "plain")}
                ${navItem("index_defect.html", "결품조회", "ISSUE", "rose")}
                ${navItem("detail_defect.html", "전체결품", "LIST", "plain")}
                ${navItem("index_repair.html", "보수작업", "WORK", "amber")}
              </div>

              <div class="mt-3 px-3 py-3 border-t border-white/10">
                <div class="text-[11px] text-white/70 leading-5">
                  · Dashboard <br/>
                  · 상차 스캔 연동 예정(진행률/인보이스/국가/PT/CBM/품목/시간/담당)
                </div>
              </div>
            </nav>
          </div>
        </div>
      </aside>
    `;
    document.body.appendChild(wrap);

    // 사이드바
    const style = document.createElement("style");
    style.textContent = `
      /* PC에서 사이드바가 뜰 때, 컨텐츠가 가려지지 않게 */
      body.nkg-sidebar-on { padding-left: ${SIDEBAR_W}px; transition: padding-left .18s ease; }
      body.nkg-sidebar-off { padding-left: 0px; transition: padding-left .18s ease; }
    `;
    document.head.appendChild(style);
  }

  function navItem(href, label, badge, color) {
    const badgeClass =
      color === "sky" ? "bg-sky-400/20 text-sky-200 border border-sky-300/20" :
      color === "emerald" ? "bg-emerald-400/20 text-emerald-200 border border-emerald-300/20" :
      color === "rose" ? "bg-rose-400/20 text-rose-200 border border-rose-300/20" :
      color === "amber" ? "bg-amber-400/20 text-amber-200 border border-amber-300/20" :
      "bg-white/10 border border-white/15 text-white/80";
    return `
      <a href="${href}" data-nav class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/10">
        <span class="text-[12px]">${label}</span>
        <span class="text-[10px] px-2 py-0.5 rounded-md ${badgeClass}">${badge}</span>
      </a>
    `;
  }

  function setActive() {
    const page = currentPage();
    document.querySelectorAll("a[data-nav]").forEach(a => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      if (!href) return;
      if (href === page) a.classList.add("bg-white/10");
    });
  }

  // ====== 숨기기/보이기 ======
  function applyDesktopVisibility() {
    const sb = qs("#sidebar");
    if (!sb) return;

    const hidden = document.body.classList.contains("nkg-side-hidden");
    if (hidden) {
      sb.style.display = "none";
      document.body.classList.remove("nkg-sidebar-on");
      document.body.classList.add("nkg-sidebar-off");
    } else {
      sb.style.display = "block";
      sb.style.transform = "translateX(0)";
      document.body.classList.add("nkg-sidebar-on");
      document.body.classList.remove("nkg-sidebar-off");
    }
  }

  // ====== 모바일: 햄버거 슬라이드 ======
  function openMobile() {
    const sb = qs("#sidebar");
    const ov = qs("#sidebarOverlay");
    if (!sb || !ov) return;
    sb.dataset.open = "1";
    sb.style.display = "block";
    sb.style.transform = "translateX(0)";
    ov.classList.remove("hidden");
  }

  function closeMobile() {
    const sb = qs("#sidebar");
    const ov = qs("#sidebarOverlay");
    if (!sb || !ov) return;
    sb.dataset.open = "0";
    sb.style.transform = "translateX(-110%)";
    ov.classList.add("hidden");
  }

  function initLayout() {
    const sb = qs("#sidebar");
    const ov = qs("#sidebarOverlay");
    if (!sb) return;

    // 상태 시간 기본
    const upd = qs("#dataUpdated");
    if (upd && upd.textContent.trim() === "-") upd.textContent = kstTimestamp();

    if (isDesktop()) {
      // PC:  transform 
      sb.style.transform = "translateX(0)";
      if (ov) ov.classList.add("hidden");
      applyDesktopVisibility();
    } else {
      // 모바일: 기본 닫힘
      document.body.classList.remove("nkg-sidebar-on");
      document.body.classList.add("nkg-sidebar-off");
      sb.style.display = "block";
      if (sb.dataset.open !== "1") sb.style.transform = "translateX(-110%)";
      if (ov) ov.classList.add("hidden");
    }
  }

  function attachMenuButton() {
    const btn = qs("#btnSidebar");
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (isDesktop()) {
        // PC: 숨기기/보이기
        document.body.classList.toggle("nkg-side-hidden");
        localStorage.setItem("nkg_sidebar_hidden", document.body.classList.contains("nkg-side-hidden") ? "1" : "0");
        applyDesktopVisibility();
      } else {
        // 모바일: 열기/닫기
        const sb = qs("#sidebar");
        const open = sb?.dataset.open === "1";
        open ? closeMobile() : openMobile();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    // 1) 사이드바 없으면 주입
    injectIfMissing();

    // 2) 저장된 PC 숨김 상태 복원
    const saved = localStorage.getItem("nkg_sidebar_hidden");
    if (saved === "1") document.body.classList.add("nkg-side-hidden");
    else document.body.classList.remove("nkg-side-hidden");

    // 3) 메뉴 활성화
    setActive();

    // 4) 레이아웃 
    initLayout();

    // 5) MENU 버튼 
    attachMenuButton();

    // 6) 모바일 overlay / ESC 닫기
    qs("#sidebarOverlay")?.addEventListener("click", closeMobile);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMobile();
    });

    // 7) 리사이즈 
    window.addEventListener("resize", () => {
      // 모바일 열려있던 것 정리
      if (isDesktop()) closeMobile();
      initLayout();
    });

    // 외부 API
    window.NKG_NAV = {
      show() { document.body.classList.remove("nkg-side-hidden"); localStorage.setItem("nkg_sidebar_hidden","0"); applyDesktopVisibility(); },
      hide() { document.body.classList.add("nkg-side-hidden"); localStorage.setItem("nkg_sidebar_hidden","1"); applyDesktopVisibility(); },
      toggle() { document.body.classList.toggle("nkg-side-hidden"); localStorage.setItem("nkg_sidebar_hidden", document.body.classList.contains("nkg-side-hidden") ? "1":"0"); applyDesktopVisibility(); },
      setStatus(text, timeText) {
        const st = qs("#dataStatus"); const up = qs("#dataUpdated");
        if (st && typeof text === "string") st.textContent = text;
        if (up) up.textContent = timeText || kstTimestamp();
      }
    };
  });
})();
