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

    // 隊名 + 球衣顏色
    var homeNameEl = document.getElementById('home-team-name');
    var awayNameEl = document.getElementById('away-team-name');
    if (homeNameEl) {
      homeNameEl.textContent = game.homeTeamName || game.homeTeamId || '—';
      if (game.homeJersey) _addJerseyBadge(homeNameEl, game.homeJersey, '主');
    }
    if (awayNameEl) {
      awayNameEl.textContent = game.awayTeamName || game.awayTeamId || '—';
      if (game.awayJersey) _addJerseyBadge(awayNameEl, game.awayJersey, '客');
    }

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

    // 渲染節分 (Q1-Q4)
    _renderQuarterScores(game);

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
      td.colSpan = 16;
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
        p.oreb != null ? p.oreb : 0,
        p.dreb != null ? p.dreb : 0,
        p.reb != null ? p.reb : ((p.oreb || 0) + (p.dreb || 0)),
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
   * 渲染節分 (Q1-Q4)
   * @param {Object} game
   */
  function _renderQuarterScores(game) {
    var hasQS = game.homeQ1 || game.homeQ2 || game.homeQ3 || game.homeQ4 ||
                game.awayQ1 || game.awayQ2 || game.awayQ3 || game.awayQ4;
    var container = document.getElementById('quarter-scores-display');
    if (!container || !hasQS) return;

    container.hidden = false;
    var setEl = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val != null ? val : '-'; };
    setEl('qs-home-name', game.homeTeamName || game.homeTeamId || '主隊');
    setEl('qs-away-name', game.awayTeamName || game.awayTeamId || '客隊');
    setEl('qs-hq1', game.homeQ1 || 0); setEl('qs-hq2', game.homeQ2 || 0);
    setEl('qs-hq3', game.homeQ3 || 0); setEl('qs-hq4', game.homeQ4 || 0);
    setEl('qs-aq1', game.awayQ1 || 0); setEl('qs-aq2', game.awayQ2 || 0);
    setEl('qs-aq3', game.awayQ3 || 0); setEl('qs-aq4', game.awayQ4 || 0);
    setEl('qs-htotal', game.homeScore != null ? game.homeScore : '-');
    setEl('qs-atotal', game.awayScore != null ? game.awayScore : '-');
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
   * 在隊名旁加上球衣顏色標示
   * @param {HTMLElement} el - 隊名元素
   * @param {string} color - 球衣顏色（hex 或文字）
   * @param {string} label - 主/客
   */
  function _addJerseyBadge(el, color, label) {
    var badge = document.createElement('span');
    badge.className = 'jersey-badge';
    badge.title = label + '場球衣：' + color;
    var isHex = /^#[0-9a-fA-F]{3,6}$/.test(color);
    if (isHex) {
      badge.style.backgroundColor = color;
      badge.style.display = 'inline-block';
      badge.style.width = '14px';
      badge.style.height = '14px';
      badge.style.borderRadius = '50%';
      badge.style.border = '1px solid rgba(255,255,255,0.3)';
      badge.style.verticalAlign = 'middle';
      badge.style.marginLeft = '6px';
    } else {
      badge.textContent = ' 🎽' + color;
      badge.style.fontSize = '0.8em';
      badge.style.opacity = '0.7';
    }
    el.appendChild(badge);
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
