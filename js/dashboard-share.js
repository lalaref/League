/**
 * ALL-IN Basketball League — 首頁分享模組
 * WhatsApp 分享 + JPG 匯出（html2canvas）
 * 支援：即將進行的賽程、最近比賽結果、球隊排名、聯賽公告
 */
var DashboardShare = (function () {
  'use strict';

  // --- html2canvas CDN 動態載入 ---
  var _h2cLoaded = false;
  function _ensureHtml2Canvas(cb) {
    if (_h2cLoaded && typeof html2canvas !== 'undefined') { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = function () { _h2cLoaded = true; cb(); };
    s.onerror = function () { alert('無法載入圖片匯出工具，請檢查網絡連線'); };
    document.head.appendChild(s);
  }

  /**
   * 將指定 section 匯出為 JPG 並下載
   */
  function _exportSection(sectionSelector, filename) {
    var section = document.querySelector(sectionSelector);
    if (!section) { alert('找不到要匯出的區塊'); return; }
    _ensureHtml2Canvas(function () {
      // Create a clone for clean export
      var container = section.querySelector('.container');
      if (!container) container = section;
      html2canvas(container, {
        backgroundColor: '#1a1a2e',
        scale: 2,
        useCORS: true,
        logging: false
      }).then(function (canvas) {
        var link = document.createElement('a');
        link.download = filename || 'allin-share.jpg';
        link.href = canvas.toDataURL('image/jpeg', 0.92);
        link.click();
      }).catch(function () {
        alert('匯出圖片失敗，請重試');
      });
    });
  }

  /**
   * 組合 WhatsApp 分享訊息並開啟 wa.me
   */
  function _shareWhatsApp(message) {
    var url = 'https://wa.me/?text=' + encodeURIComponent(message);
    window.open(url, '_blank');
  }

  // ─── 即將進行的賽程 ───

  function shareUpcoming() {
    var el = document.getElementById('upcoming-games-list');
    if (!el) return;
    var cards = el.querySelectorAll('.game-card');
    if (cards.length === 0) { alert('暫無即將進行的賽程'); return; }
    var lines = ['🏀 *ALL-IN Basketball League*', '📋 即將進行的賽程', ''];
    cards.forEach(function (card) {
      var date = card.querySelector('.game-card-date');
      var teams = card.querySelectorAll('.game-card-team');
      var venue = card.querySelector('.game-card-venue');
      var dateTxt = date ? date.textContent.trim() : '';
      var home = teams[0] ? teams[0].textContent.trim() : '';
      var away = teams[1] ? teams[1].textContent.trim() : '';
      lines.push('📅 ' + dateTxt);
      lines.push('   ' + home + ' vs ' + away);
      if (venue) lines.push('   ' + venue.textContent.trim());
      lines.push('');
    });
    lines.push('🔗 https://www.aiblhk.com');
    _shareWhatsApp(lines.join('\n'));
  }

  function exportUpcoming() {
    _exportSection('.upcoming-games', 'allin-upcoming-games.jpg');
  }

  // ─── 最近比賽結果 ───

  function shareRecent() {
    var el = document.getElementById('recent-games-list');
    if (!el) return;
    var cards = el.querySelectorAll('.game-card');
    if (cards.length === 0) { alert('暫無最近比賽結果'); return; }
    var lines = ['🏀 *ALL-IN Basketball League*', '📊 最近比賽結果', ''];
    cards.forEach(function (card) {
      var date = card.querySelector('.game-card-date');
      var teams = card.querySelectorAll('.game-card-team');
      var score = card.querySelector('.game-card-score');
      var dateTxt = date ? date.textContent.trim() : '';
      var home = teams[0] ? teams[0].textContent.trim() : '';
      var away = teams[1] ? teams[1].textContent.trim() : '';
      var scoreTxt = score ? score.textContent.trim() : '';
      lines.push('📅 ' + dateTxt);
      lines.push('   ' + home + ' ' + scoreTxt + ' ' + away);
      lines.push('');
    });
    lines.push('🔗 https://www.aiblhk.com');
    _shareWhatsApp(lines.join('\n'));
  }

  function exportRecent() {
    _exportSection('.recent-games', 'allin-recent-results.jpg');
  }

  // ─── 球隊排名 ───

  function shareStandings() {
    var table = document.getElementById('standings-table');
    if (!table) return;
    var rows = table.querySelectorAll('tbody tr');
    if (rows.length === 0) { alert('暫無排名數據'); return; }
    var lines = ['🏀 *ALL-IN Basketball League*', '🏆 球隊排名', ''];
    rows.forEach(function (row) {
      var cells = row.querySelectorAll('td');
      if (cells.length >= 8) {
        var rank = cells[0].textContent.trim();
        var name = cells[1].textContent.trim();
        var w = cells[3].textContent.trim();
        var l = cells[5].textContent.trim();
        var pts = cells[7].textContent.trim();
        lines.push(rank + '. ' + name + ' (' + w + '勝' + l + '負) ' + pts + '分');
      }
    });
    lines.push('');
    lines.push('🔗 https://www.aiblhk.com');
    _shareWhatsApp(lines.join('\n'));
  }

  function exportStandings() {
    _exportSection('.standings-preview', 'allin-standings.jpg');
  }

  // ─── 聯賽公告 ───

  function shareAnnouncements() {
    var el = document.getElementById('announcements-list');
    if (!el) return;
    var items = el.querySelectorAll('.announcement-item');
    if (items.length === 0) { alert('暫無公告'); return; }
    var lines = ['📢 *ALL-IN Basketball League*', '聯賽公告', ''];
    items.forEach(function (item) {
      var title = item.querySelector('.announcement-title');
      var date = item.querySelector('.announcement-date');
      var content = item.querySelector('.announcement-content');
      if (title) lines.push('*' + title.textContent.trim() + '*');
      if (date) lines.push(date.textContent.trim());
      if (content) lines.push(content.textContent.trim().substring(0, 200));
      lines.push('');
    });
    lines.push('🔗 https://www.aiblhk.com');
    _shareWhatsApp(lines.join('\n'));
  }

  function exportAnnouncements() {
    _exportSection('.announcements', 'allin-announcements.jpg');
  }

  return {
    shareUpcoming: shareUpcoming,
    exportUpcoming: exportUpcoming,
    shareRecent: shareRecent,
    exportRecent: exportRecent,
    shareStandings: shareStandings,
    exportStandings: exportStandings,
    shareAnnouncements: shareAnnouncements,
    exportAnnouncements: exportAnnouncements
  };
})();
