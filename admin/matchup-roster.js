(function () {
  'use strict';

  var gameId = new URLSearchParams(window.location.search).get('gameId');
  var detailEl = document.getElementById('matchup-game-detail');
  var teamsEl = document.getElementById('matchup-teams');
  var statusEl = document.getElementById('matchup-status');
  var saveButton = document.getElementById('btn-save-matchup-roster');

  if (!gameId || !detailEl || !teamsEl || !saveButton) {
    if (detailEl) detailEl.textContent = '缺少比賽資料，請從時間員記錄台重新選擇比賽。';
    return;
  }

  var game = null;
  var playersBySide = { home: [], away: [] };

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'admin-message admin-message--' + (type || 'info');
    statusEl.hidden = false;
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }

  function renderTeam(side, players, selectedIds) {
    var isHome = side === 'home';
    var name = isHome ? (game.homeTeamName || game.homeTeamId) : (game.awayTeamName || game.awayTeamId);
    var selected = {};
    (selectedIds || []).forEach(function (id) { selected[String(id)] = true; });
    var list = players.map(function (player) {
      var number = player.number !== undefined && player.number !== null && player.number !== '' ? player.number : '?';
      return '<label class="matchup-player"><input class="matchup-player-checkbox" type="checkbox" data-side="' + side + '" value="' + escapeHtml(player.id) + '"' + (selected[String(player.id)] ? ' checked' : '') + '><span>#' + escapeHtml(number) + ' ' + escapeHtml(player.name || '未命名球員') + '</span></label>';
    }).join('');
    return '<section class="matchup-team matchup-team--' + side + '"><h2>' + (isHome ? '主隊：' : '客隊：') + escapeHtml(name) + '</h2><div class="matchup-player-list">' + (list || '<p class="matchup-empty">此隊暫未有可選球員。</p>') + '</div></section>';
  }

  function selectedIds(side) {
    return Array.prototype.slice.call(document.querySelectorAll('.matchup-player-checkbox[data-side="' + side + '"]:checked')).map(function (checkbox) { return checkbox.value; });
  }

  function load() {
    Promise.all([API.getBoxScore(gameId), API.getGameRoster(gameId)]).then(function (results) {
      var boxscore = results[0] || {};
      var saved = results[1] || {};
      game = boxscore.game;
      if (!game) throw new Error('找不到此比賽');
      if (String(game.status || '').toLowerCase() === 'completed' || String(game.status || '').toLowerCase() === 'cancelled') {
        throw new Error('此比賽已完成或取消，不能再設定上陣名單');
      }
      return Promise.all([API.getPlayers(game.homeTeamId), API.getPlayers(game.awayTeamId)]).then(function (rosters) {
        playersBySide.home = (rosters[0] || []).filter(function (player) { return String(player.teamId) === String(game.homeTeamId); });
        playersBySide.away = (rosters[1] || []).filter(function (player) { return String(player.teamId) === String(game.awayTeamId); });
        var date = typeof Utils !== 'undefined' ? Utils.formatDateWithDay(game.date) : game.date;
        detailEl.textContent = date + (game.time ? ' · ' + game.time : '') + '｜' + (game.homeTeamName || game.homeTeamId) + ' vs ' + (game.awayTeamName || game.awayTeamId);
        teamsEl.innerHTML = renderTeam('home', playersBySide.home, saved.homePlayerIds) + renderTeam('away', playersBySide.away, saved.awayPlayerIds);
        saveButton.disabled = !playersBySide.home.length || !playersBySide.away.length;
        if (saved.homePlayerIds && saved.homePlayerIds.length && saved.awayPlayerIds && saved.awayPlayerIds.length) showStatus('已載入已儲存的上陣名單，可隨時修改後重新儲存。', 'info');
      });
    }).catch(function (error) {
      detailEl.textContent = '無法載入此場比賽。';
      teamsEl.innerHTML = '<div class="matchup-empty">請返回時間員記錄台後再試。</div>';
      showStatus(error.message || '載入失敗', 'error');
    });
  }

  saveButton.addEventListener('click', function () {
    var homePlayerIds = selectedIds('home');
    var awayPlayerIds = selectedIds('away');
    if (!homePlayerIds.length || !awayPlayerIds.length) {
      showStatus('主隊及客隊均須至少選擇一位上陣球員。', 'error');
      return;
    }
    saveButton.disabled = true;
    API.saveGameRoster(gameId, homePlayerIds, awayPlayerIds).then(function () {
      showStatus('上陣名單已儲存。比賽日進入即時記錄台時會自動載入。', 'success');
    }).catch(function (error) {
      showStatus(error.message || '名單儲存失敗，請重試。', 'error');
    }).finally(function () {
      saveButton.disabled = false;
    });
  });

  load();
})();
