/**
 * ALL-IN Basketball League — 單場比賽詳情頁面
 * 讀取 URL 參數 ?id= 取得 gameId，呼叫 API.getBoxScore 渲染比賽資訊
 * 需求：3.4, 12.2, 19.1
 */
(function () {
  'use strict';

  var gameId = _getGameIdFromUrl();
  if (!gameId) {
    _showError('缺少比賽 ID 參數');
    return;
  }

  _loadGameData(gameId);

  /**
   * 從 URL 查詢參數取得 gameId
   * @returns {string|null}
   */
  function _getGameIdFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get('id') || null;
  }

  /**
   * 載入比賽數據並渲染頁面
   * @param {string} id
   */
  function _loadGameData(id) {
    API.getBoxScore(id)
      .then(function (data) {
        _renderGame(data);
      })
      .catch(function () {
        _showError(typeof I18n !== 'undefined' ? I18n.t('error.loadFailed') : '載入失敗，請重試');
      });
  }

  /**
   * 渲染比賽資訊及 Box Score
   * @param {Object} data - { game, homeStats[], awayStats[] }
   */
  function _renderGame(data) {
    var game = data.game || {};
    var homeStats = data.homeStats || [];
    var awayStats = data.awayStats || [];

    // 比賽日期
    var dateEl = document.getElementById('game-date');
    if (dateEl) dateEl.textContent = Utils.formatDateWithDay(game.date) + ' ' + Utils.formatTime(game.time);

    // 隊名
    var homeNameEl = document.getElementById('home-team-name');
    var awayNameEl = document.getElementById('away-team-name');
    if (homeNameEl) homeNameEl.textContent = game.homeTeamName || game.homeTeamId || '—';
    if (awayNameEl) awayNameEl.textContent = game.awayTeamName || game.awayTeamId || '—';

    // 比分
    var homeScoreEl = document.getElementById('home-score');
    var awayScoreEl = document.getElementById('away-score');
    if (homeScoreEl) homeScoreEl.textContent = game.homeScore != null ? game.homeScore : '—';
    if (awayScoreEl) awayScoreEl.textContent = game.awayScore != null ? game.awayScore : '—';

    // 狀態
    var statusEl = document.getElementById('game-status');
    if (statusEl && game.status === 'completed') {
      statusEl.textContent = typeof I18n !== 'undefined' ? I18n.t('game.final') : '終場';
      statusEl.classList.add('text-accent');
    }

    // 表格標題中的隊名
    var homeLabelEl = document.getElementById('home-team-label');
    var awayLabelEl = document.getElementById('away-team-label');
    if (homeLabelEl) homeLabelEl.textContent = game.homeTeamName || game.homeTeamId || '';
    if (awayLabelEl) awayLabelEl.textContent = game.awayTeamName || game.awayTeamId || '';

    // 渲染 Box Score 表格
    _renderBoxScoreTable('home-boxscore-body', homeStats);
    _renderBoxScoreTable('away-boxscore-body', awayStats);

    // 設定 WhatsApp 分享按鈕
    _setupWhatsAppShare(game, data);
  }

  /**
   * 渲染 Box Score 表格
   * @param {string} tbodyId
   * @param {Object[]} stats
   */
  function _renderBoxScoreTable(tbodyId, stats) {
    var tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!stats || stats.length === 0) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 14;
      td.className = 'text-center text-muted';
      td.textContent = typeof I18n !== 'undefined' ? I18n.t('common.noData') : '暫無數據';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    stats.forEach(function (p) {
      var tr = document.createElement('tr');
      var name = p.playerName || p.playerId || '—';
      var num = p.number != null ? '#' + p.number + ' ' : '';

      var cells = [
        num + name,
        p.pts != null ? p.pts : 0,
        p.reb != null ? p.reb : 0,
        p.ast != null ? p.ast : 0,
        p.stl != null ? p.stl : 0,
        p.blk != null ? p.blk : 0,
        p.fgm != null ? p.fgm : 0,
        p.fga != null ? p.fga : 0,
        p.tpm != null ? p.tpm : 0,
        p.tpa != null ? p.tpa : 0,
        p.ftm != null ? p.ftm : 0,
        p.fta != null ? p.fta : 0,
        p.to != null ? p.to : 0,
        p.fouls != null ? p.fouls : 0
      ];

      cells.forEach(function (val, idx) {
        var td = document.createElement('td');
        td.textContent = val;
        if (idx > 0) td.className = 'text-right';
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  /**
   * 設定 WhatsApp 分享按鈕
   * @param {Object} game
   * @param {Object} data - 完整 boxscore 數據
   */
  function _setupWhatsAppShare(game, data) {
    var btn = document.getElementById('whatsapp-share-btn');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var gameData = {
        date: Utils.formatDateWithDay(game.date),
        homeTeamName: game.homeTeamName || game.homeTeamId || 'Home',
        awayTeamName: game.awayTeamName || game.awayTeamId || 'Away',
        homeScore: game.homeScore,
        awayScore: game.awayScore
      };
      var boxScore = {
        homeStats: data.homeStats || [],
        awayStats: data.awayStats || []
      };
      var message = WhatsAppShare.formatGameMessage(gameData, boxScore);
      // 開啟 WhatsApp 分享（無指定電話號碼時使用空字串讓用戶自選聯絡人）
      var url = 'https://wa.me/?text=' + encodeURIComponent(message);
      window.open(url, '_blank');
    });
  }

  /**
   * 顯示錯誤訊息
   * @param {string} msg
   */
  function _showError(msg) {
    var main = document.querySelector('.main-content');
    if (!main) return;
    var div = document.createElement('div');
    div.className = 'container';
    div.style.padding = 'var(--spacing-2xl) var(--spacing-md)';
    div.innerHTML = '<p class="text-center text-muted">' + _escapeHtml(msg) + '</p>';
    main.innerHTML = '';
    main.appendChild(div);
  }

  /**
   * HTML 轉義
   * @param {string} str
   * @returns {string}
   */
  function _escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
