/**
 * ALL-IN Basketball League — 導航列及漢堡選單
 * 實作桌面完整水平導航及手機漢堡選單切換
 * 需求：12.3, 12.10
 */
(function () {
  'use strict';

  const hamburgerBtn = document.querySelector('.hamburger-btn');
  const navMenu = document.getElementById('nav-menu');
  const navLinks = navMenu ? navMenu.querySelectorAll('.nav-link') : [];

  // --- 漢堡選單切換 ---
  function toggleMenu() {
    if (!navMenu || !hamburgerBtn) return;
    const isOpen = navMenu.classList.toggle('open');
    hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
    hamburgerBtn.setAttribute('aria-label', isOpen ? '關閉選單' : '開啟選單');
  }

  function closeMenu() {
    if (!navMenu || !hamburgerBtn) return;
    navMenu.classList.remove('open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    hamburgerBtn.setAttribute('aria-label', '開啟選單');
  }

  // 1. 點擊漢堡按鈕切換選單
  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', toggleMenu);
  }

  // 2. 點擊導航連結後關閉選單（手機）
  navLinks.forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  // 3. 點擊選單外部關閉選單
  document.addEventListener('click', function (e) {
    if (!navMenu || !hamburgerBtn) return;
    if (!navMenu.classList.contains('open')) return;
    // 如果點擊的不是選單內部也不是漢堡按鈕，關閉選單
    if (!navMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
      closeMenu();
    }
  });

  // 4. Escape 鍵關閉選單
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navMenu && navMenu.classList.contains('open')) {
      closeMenu();
      hamburgerBtn.focus();
    }
  });

  // 5. 根據當前頁面高亮對應導航連結
  function setActiveLink() {
    var currentPath = window.location.pathname;
    // 取得檔名部分（如 "index.html"、"schedule.html"）
    var currentPage = currentPath.substring(currentPath.lastIndexOf('/') + 1) || 'index.html';

    navLinks.forEach(function (link) {
      var href = link.getAttribute('href') || '';
      var linkPage = href.substring(href.lastIndexOf('/') + 1) || 'index.html';

      link.classList.toggle('active', linkPage === currentPage);
    });
  }

  setActiveLink();

  // 6. 鍵盤無障礙：方向鍵在導航連結間移動焦點
  if (navMenu) {
    navMenu.addEventListener('keydown', function (e) {
      var links = Array.from(navLinks);
      var currentIndex = links.indexOf(document.activeElement);
      if (currentIndex === -1) return;

      var nextIndex = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % links.length;
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + links.length) % links.length;
      }

      if (nextIndex !== -1) {
        e.preventDefault();
        links[nextIndex].focus();
      }
    });
  }
})();
