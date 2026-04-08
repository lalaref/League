/**
 * ALL-IN Basketball League — 歷史檔案頁面
 * 以賽季為單位列出已完結賽季，顯示排名、獎項、季後賽結果、回顧及跨賽季趨勢
 * 需求：16.2, 16.3, 16.4, 16.5, 16.6
 */
(function () {
  'use strict';

  // --- DOM 元素 ---
  var seasonSelect = document.getElementById('archive-season-select');
  var emptySection = document.getElementById('archive-empty');
  var seasonListSection = document.getElementById('archive-season-list');
  var seasonCardsContainer = document.getElementById('season-cards');
  var detailSection = document.getElementById('archive-detail');
  var awardsGrid = document.getElementById('awards-grid');
  var standingsLoading = document.getElementById('archive-standings-loading');
  var standingsWrapper = document.getElementById('archive-standings-wrapper');
  var standingsTbody = document.getElementById('archive-standings-tbody');
  var playoffsEmpty = document.getElementById('archive-playoffs-empty');
  var playoffsBracketWrapper = document.getElementById('archive-playoffs-bracket');
  var playoffsBracket = document.getElementById('archive-bracket');
  var summarySection = document.getElementById('archive-summary-section');
  var summaryText = document.getElementById('archive-summary-text');
  var photosSection = document.getElementById('archive-photos-section');
  var photosGrid = document.getElementById('archive-photos-grid');
  var trendsSection = document.getElementById('archive-trends-section');

  /** @type {Array} 已完結賽季列表 */
  var completedSeasons = [];
  /** @type {Object} 各賽季的 archive 數據快取 */
  var archiveCache = {};

  // --- 獎項圖示對照 ---
  var AWARD_ICONS = {
    champion: '🏆',
    playoffMvp: '⭐',
    scoringLeader: '🔥',
    reboundLeader: '💪',
    assistLeader: '🎯',
    bestRookie: '🌟'
  };

  var AWARD_I18N_KEYS = {
    champion: 'archive.champion',
    playoffMvp: 'archive.mvp',
    scoringLeader: 'archive.scoringLeader',
    reboundLeader: 'archive.reboundLeader',
    assistLeader: 'archive.assistLeader',
    bestRookie: 'archive.bestRookie'
  };

  // =============================================
  // 初始化
  // =============================================
  function init() {
    loadSeasons();
    if (seasonSelect) {
      seasonSelect.addEventListener('change', onSeasonChange);
    }
  }

  // =============================================
  // 載入賽季列表
  // =============================================
  function loadSeasons() {
    API.getSeasons()
      .then(function (seasons) {
        completedSeasons = (seasons || []).filter(function (s) {
          return s.status === 'completed';
        });
        populateSeasonSelect();
        if (completedSeasons.length === 0) {
          showSection('empty');
        } else {
          showSection('list');
          renderSeasonCards();
          loadTrendData();
        }
      })
      .catch(function () {
        showSection('empty');
      });
  }

  // =============================================
  // 填充賽季下拉選單
  // =============================================
  function populateSeasonSelect() {
    if (!seasonSelect) return;
    seasonSelect.innerHTML = '';

    var allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = I18n.t('common.all');
    allOption.setAttribute('data-i18n', 'common.all');
    seasonSelect.appendChild(allOption);

    completedSeasons.forEach(function (season) {
      var opt = document.createElement('option');
      opt.value = season.id;
      opt.textContent = season.name;
      seasonSelect.appendChild(opt);
    });
  }

  // =============================================
  // 賽季選擇變更
  // =============================================
  function onSeasonChange() {
    var seasonId = seasonSelect ? seasonSelect.value : '';
    if (!seasonId) {
      showSection('list');
      renderSeasonCards();
      loadTrendData();
    } else {
      showSection('detail');
      loadArchiveDetail(seasonId);
    }
  }

  // =============================================
  // 顯示/隱藏區塊
  // =============================================
  function showSection(which) {
    emptySection.style.display = which === 'empty' ? '' : 'none';
    seasonListSection.style.display = which === 'list' ? '' : 'none';
    detailSection.style.display = which === 'detail' ? '' : 'none';
    trendsSection.style.display = (which === 'list' && completedSeasons.length > 0) ? '' : 'none';
  }

  // =============================================
  // 渲染賽季摘要卡片
  // =============================================
  function renderSeasonCards() {
    if (!seasonCardsContainer) return;
    seasonCardsContainer.innerHTML = '';

    completedSeasons.forEach(function (season) {
      var card = document.createElement('div');
      card.className = 'archive-season-card game-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', season.name);

      var nameEl = document.createElement('h3');
      nameEl.className = 'archive-season-card-name';
      nameEl.textContent = season.name;

      var dateEl = document.createElement('p');
      dateEl.className = 'archive-season-card-date text-muted';
      var dateText = '';
      if (season.startDate) dateText += season.startDate;
      if (season.endDate) dateText += ' — ' + season.endDate;
      dateEl.textContent = dateText;

      card.appendChild(nameEl);
      card.appendChild(dateEl);

      // 如果有快取的 archive 數據，顯示冠軍
      if (archiveCache[season.id] && archiveCache[season.id].awards) {
        var champ = archiveCache[season.id].awards.champion;
        if (champ) {
          var champEl = document.createElement('p');
          champEl.className = 'archive-season-card-champion';
          champEl.innerHTML = AWARD_ICONS.champion + ' ' + escapeHtml(champ);
          card.appendChild(champEl);
        }
      }

      card.addEventListener('click', function () {
        if (seasonSelect) seasonSelect.value = season.id;
        onSeasonChange();
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (seasonSelect) seasonSelect.value = season.id;
          onSeasonChange();
        }
      });

      seasonCardsContainer.appendChild(card);
    });

    // 預載入各賽季 archive 數據以顯示冠軍
    completedSeasons.forEach(function (season) {
      if (!archiveCache[season.id]) {
        API.getArchive(season.id).then(function (data) {
          archiveCache[season.id] = data;
          renderSeasonCards();
        }).catch(function () { /* 靜默 */ });
      }
    });
  }

  // =============================================
  // 載入特定賽季的詳細檔案
  // =============================================
  function loadArchiveDetail(seasonId) {
    // 重置 UI
    awardsGrid.innerHTML = '';
    standingsTbody.innerHTML = '';
    standingsLoading.style.display = '';
    standingsWrapper.style.display = 'none';
    playoffsEmpty.style.display = 'none';
    playoffsBracketWrapper.style.display = 'none';
    summarySection.style.display = 'none';
    photosSection.style.display = 'none';
    trendsSection.style.display = 'none';

    var archivePromise = archiveCache[seasonId]
      ? Promise.resolve(archiveCache[seasonId])
      : API.getArchive(seasonId);

    archivePromise
      .then(function (data) {
        archiveCache[seasonId] = data;
        renderAwards(data.awards || data);
        renderStandings(data.standings || []);
        renderPlayoffs(data.playoffs);
        renderSummary(data.summary);
        renderPhotos(data.photos);
      })
      .catch(function () {
        standingsLoading.style.display = 'none';
        awardsGrid.innerHTML = '<p class="text-muted">' + I18n.t('error.loadFailed') + '</p>';
      });
  }

  // =============================================
  // 渲染獎項
  // =============================================
  function renderAwards(awards) {
    if (!awardsGrid || !awards) return;
    awardsGrid.innerHTML = '';

    var awardKeys = ['champion', 'playoffMvp', 'scoringLeader', 'reboundLeader', 'assistLeader', 'bestRookie'];

    awardKeys.forEach(function (key) {
      var value = awards[key];
      if (!value) return;

      var card = document.createElement('div');
      card.className = 'archive-award-card';

      var icon = document.createElement('span');
      icon.className = 'archive-award-icon';
      icon.textContent = AWARD_ICONS[key] || '🏅';
      icon.setAttribute('aria-hidden', 'true');

      var info = document.createElement('div');
      info.className = 'archive-award-info';

      var label = document.createElement('span');
      label.className = 'archive-award-label';
      label.setAttribute('data-i18n', AWARD_I18N_KEYS[key]);
      label.textContent = I18n.t(AWARD_I18N_KEYS[key]);

      var name = document.createElement('span');
      name.className = 'archive-award-name';
      name.textContent = value;

      info.appendChild(label);
      info.appendChild(name);
      card.appendChild(icon);
      card.appendChild(info);
      awardsGrid.appendChild(card);
    });
  }

  // =============================================
  // 渲染排名表
  // =============================================
  function renderStandings(standings) {
    standingsLoading.style.display = 'none';
    if (!standings || standings.length === 0) {
      standingsWrapper.style.display = 'none';
      return;
    }
    standingsWrapper.style.display = '';
    standingsTbody.innerHTML = '';

    standings.forEach(function (team, index) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (index + 1) + '</td>' +
        '<td>' + escapeHtml(team.team || team.name || '') + '</td>' +
        '<td>' + (team.wins != null ? team.wins : '-') + '</td>' +
        '<td>' + (team.losses != null ? team.losses : '-') + '</td>' +
        '<td>' + formatPct(team.pct) + '</td>';
      standingsTbody.appendChild(tr);
    });
  }

  // =============================================
  // 渲染季後賽對陣結果
  // =============================================
  function renderPlayoffs(playoffs) {
    if (!playoffs || !playoffs.rounds || playoffs.rounds.length === 0) {
      playoffsEmpty.style.display = '';
      playoffsBracketWrapper.style.display = 'none';
      return;
    }
    playoffsEmpty.style.display = 'none';
    playoffsBracketWrapper.style.display = '';
    playoffsBracket.innerHTML = '';

    var roundNames = [
      I18n.t('schedule.roundFirst'),
      I18n.t('schedule.roundSemi'),
      I18n.t('schedule.roundFinal')
    ];

    // 設定 grid 欄數
    playoffsBracket.style.gridTemplateColumns = 'repeat(' + playoffs.rounds.length + ', 1fr)';

    playoffs.rounds.forEach(function (round, roundIndex) {
      var roundEl = document.createElement('div');
      roundEl.className = 'playoff-round';

      var titleEl = document.createElement('div');
      titleEl.className = 'playoff-round-title';
      titleEl.textContent = roundNames[roundIndex] || ('Round ' + (roundIndex + 1));
      roundEl.appendChild(titleEl);

      var gamesEl = document.createElement('div');
      gamesEl.className = 'playoff-round-games';

      var games = round.games || round;
      if (Array.isArray(games)) {
        games.forEach(function (game) {
          var matchup = document.createElement('div');
          matchup.className = 'playoff-matchup';

          var homeTeam = createPlayoffTeamEl(game.homeTeam || game.team1 || '', game.homeScore, game.winner);
          var awayTeam = createPlayoffTeamEl(game.awayTeam || game.team2 || '', game.awayScore, game.winner);

          matchup.appendChild(homeTeam);
          matchup.appendChild(awayTeam);
          gamesEl.appendChild(matchup);
        });
      }

      roundEl.appendChild(gamesEl);
      playoffsBracket.appendChild(roundEl);
    });
  }

  function createPlayoffTeamEl(teamName, score, winner) {
    var el = document.createElement('div');
    el.className = 'playoff-team';
    if (winner && teamName && winner === teamName) {
      el.classList.add('playoff-team--winner');
    }

    var nameEl = document.createElement('span');
    nameEl.className = 'playoff-team-name';
    nameEl.textContent = teamName || 'TBD';

    var scoreEl = document.createElement('span');
    scoreEl.className = 'playoff-team-score';
    scoreEl.textContent = score != null ? score : '-';

    el.appendChild(nameEl);
    el.appendChild(scoreEl);
    return el;
  }

  // =============================================
  // 渲染賽季回顧文字
  // =============================================
  function renderSummary(summary) {
    if (!summary) {
      summarySection.style.display = 'none';
      return;
    }
    summarySection.style.display = '';
    summaryText.textContent = summary;
  }

  // =============================================
  // 渲染精選照片
  // =============================================
  function renderPhotos(photos) {
    if (!photos) {
      photosSection.style.display = 'none';
      return;
    }
    photosSection.style.display = '';
    photosGrid.innerHTML = '';

    var photoList = typeof photos === 'string' ? photos.split(',') : (Array.isArray(photos) ? photos : []);
    photoList = photoList.map(function (p) { return p.trim(); }).filter(Boolean);

    if (photoList.length === 0) {
      photosSection.style.display = 'none';
      return;
    }

    photoList.forEach(function (url) {
      var wrapper = document.createElement('div');
      wrapper.className = 'archive-photo-item';

      var img = document.createElement('img');
      img.src = url;
      img.alt = I18n.t('archive.photos');
      img.loading = 'lazy';
      img.onerror = function () { wrapper.style.display = 'none'; };

      wrapper.appendChild(img);
      photosGrid.appendChild(wrapper);
    });
  }

  // =============================================
  // 載入跨賽季趨勢數據
  // =============================================
  function loadTrendData() {
    if (completedSeasons.length < 2) {
      trendsSection.style.display = 'none';
      return;
    }

    var promises = completedSeasons.map(function (season) {
      if (archiveCache[season.id]) return Promise.resolve(archiveCache[season.id]);
      return API.getArchive(season.id).then(function (data) {
        archiveCache[season.id] = data;
        return data;
      }).catch(function () { return null; });
    });

    Promise.all(promises).then(function (archives) {
      var seasonLabels = [];
      var scoringData = [];
      var reboundData = [];
      var assistData = [];

      completedSeasons.forEach(function (season, i) {
        var archive = archives[i];
        seasonLabels.push(season.name);

        if (archive && archive.awards) {
          scoringData.push(parseLeaderValue(archive.awards.scoringLeader));
          reboundData.push(parseLeaderValue(archive.awards.reboundLeader));
          assistData.push(parseLeaderValue(archive.awards.assistLeader));
        } else if (archive && archive.scoringLeaderAvg != null) {
          scoringData.push(archive.scoringLeaderAvg);
          reboundData.push(archive.reboundLeaderAvg || 0);
          assistData.push(archive.assistLeaderAvg || 0);
        } else {
          scoringData.push(0);
          reboundData.push(0);
          assistData.push(0);
        }
      });

      // 只在有有效數據時顯示趨勢圖
      var hasData = scoringData.some(function (v) { return v > 0; });
      if (!hasData) {
        trendsSection.style.display = 'none';
        return;
      }

      trendsSection.style.display = '';
      var datasets = [
        { label: I18n.t('archive.scoringLeader'), data: scoringData },
        { label: I18n.t('archive.reboundLeader'), data: reboundData },
        { label: I18n.t('archive.assistLeader'), data: assistData }
      ];

      Charts.createSeasonTrendChart('season-trend-chart', seasonLabels, datasets);
    });
  }

  // =============================================
  // 工具函數
  // =============================================

  /**
   * 從獎項得主字串中解析場均數值（如 "陳大文 (25.3)"）
   * @param {string} leaderStr
   * @returns {number}
   */
  function parseLeaderValue(leaderStr) {
    if (!leaderStr) return 0;
    var match = leaderStr.match(/\(([0-9.]+)\)/);
    if (match) return parseFloat(match[1]) || 0;
    return 0;
  }

  function formatPct(pct) {
    if (pct == null || isNaN(pct)) return '-';
    if (typeof pct === 'string') return pct;
    return (pct * 1).toFixed(3);
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- 啟動 ---
  init();
})();
