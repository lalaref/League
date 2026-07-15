/**
 * ALL-IN Basketball League — Hall of Fame 冠軍球隊頁面
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
  var detailTitle = document.getElementById('archive-detail-title');
  var finalSection = document.getElementById('archive-final-section');
  var finalResult = document.getElementById('archive-final-result');
  var awardsSection = document.getElementById('archive-awards-section');
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
  var teamCache = {};
  var pendingHallLoads = {};

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
        completedSeasons = [];
        populateSeasonSelect();
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
    seasonListSection.style.display = (which === 'list' || which === 'detail') ? '' : 'none';
    detailSection.style.display = which === 'detail' ? '' : 'none';
    trendsSection.style.display = (which === 'list' && completedSeasons.length > 0) ? '' : 'none';
  }

  // =============================================
  // 渲染賽季摘要卡片
  // =============================================
  function renderSeasonCards() {
    if (!seasonCardsContainer) return;
    seasonCardsContainer.innerHTML = '';

    var seasons = completedSeasons.slice().sort(compareSeasonsByYearDesc);
    seasons.forEach(function (season, index) {
      var archive = archiveCache[season.id] || null;
      var teams = teamCache[season.id] || [];
      var championName = getChampionName(archive);
      var championTeam = findChampionTeam(championName, teams);
      var championLogo = getChampionLogo(championTeam);
      var year = getSeasonYear(season);

      var card = document.createElement('article');
      card.className = 'archive-season-card hof-card';
      if (seasonSelect && seasonSelect.value === season.id) card.classList.add('hof-card--active');
      if (!championName) card.classList.add('hof-card--loading');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', championName ? (year + ' ' + championName) : season.name);

      var queue = document.createElement('div');
      queue.className = 'hof-queue-marker';
      queue.innerHTML = '<span class="hof-queue-dot"></span><span class="hof-queue-line"></span>';

      var flagWrap = document.createElement('div');
      flagWrap.className = 'hof-flag-wrap';

      var rod = document.createElement('div');
      rod.className = 'hof-flag-rod';

      var flag = document.createElement('div');
      flag.className = 'hof-flag';

      var flagTop = document.createElement('div');
      flagTop.className = 'hof-flag-top';
      flagTop.textContent = 'ALL-IN BASKETBALL LEAGUE';

      var watermark = document.createElement('div');
      watermark.className = 'hof-allin-watermark';
      watermark.innerHTML = '<img src="images/logo.png" alt="">';

      var logoBox = document.createElement('div');
      logoBox.className = 'hof-team-photo';
      var img = document.createElement('img');
      img.src = championLogo;
      img.alt = championName ? championName : 'ALL-IN Basketball League';
      img.loading = index < 2 ? 'eager' : 'lazy';
      img.onerror = function () { img.src = 'images/logo.png'; };
      logoBox.appendChild(img);

      var yearEl = document.createElement('div');
      yearEl.className = 'hof-year';
      yearEl.textContent = year;

      var championLabel = document.createElement('div');
      championLabel.className = 'hof-champion-label';
      championLabel.textContent = 'CHAMPIONS';

      var championEl = document.createElement('h3');
      championEl.className = 'archive-season-card-name hof-team-name';
      championEl.textContent = championName || I18n.t('common.loading');

      var seasonEl = document.createElement('p');
      seasonEl.className = 'archive-season-card-date hof-season-name';
      seasonEl.textContent = getSeasonShortName(season);

      var dateEl = document.createElement('p');
      dateEl.className = 'archive-season-card-date hof-season-date';
      var dateText = '';
      if (season.startDate) dateText += season.startDate;
      if (season.endDate) dateText += ' - ' + season.endDate;
      dateEl.textContent = dateText;

      flag.appendChild(flagTop);
      flag.appendChild(watermark);
      flag.appendChild(logoBox);
      flag.appendChild(yearEl);
      flag.appendChild(championLabel);
      flag.appendChild(championEl);
      flag.appendChild(seasonEl);
      flag.appendChild(dateEl);
      flagWrap.appendChild(rod);
      flagWrap.appendChild(flag);
      card.appendChild(queue);
      card.appendChild(flagWrap);

      var seasonPhoto = getFirstPhoto(archive && archive.photos);
      if (seasonPhoto) {
        var badge = document.createElement('div');
        badge.className = 'hof-team-badge hof-team-badge--photo';
        var badgeImg = document.createElement('img');
        badgeImg.src = seasonPhoto;
        badgeImg.alt = championName ? championName + ' team photo' : 'Team photo';
        badgeImg.loading = 'lazy';
        badgeImg.onerror = function () { badge.style.display = 'none'; };
        badge.appendChild(badgeImg);
        card.appendChild(badge);
      }

      card.addEventListener('click', function () {
        if (seasonSelect) seasonSelect.value = season.id;
        onSeasonChange();
        scrollToDetail();
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (seasonSelect) seasonSelect.value = season.id;
          onSeasonChange();
          scrollToDetail();
        }
      });

      seasonCardsContainer.appendChild(card);
    });

    seasons.forEach(loadHallOfFameCardData);
  }

  function loadHallOfFameCardData(season) {
    if (!season || pendingHallLoads[season.id]) return;
    var needsArchive = !archiveCache[season.id];
    var needsTeams = !teamCache[season.id];
    if (!needsArchive && !needsTeams) return;
    pendingHallLoads[season.id] = true;

    Promise.all([
      needsArchive ? API.getArchive(season.id).catch(function () { return null; }) : Promise.resolve(archiveCache[season.id]),
      needsTeams ? API.getTeams(season.id).catch(function () { return []; }) : Promise.resolve(teamCache[season.id])
    ]).then(function (results) {
      if (results[0]) archiveCache[season.id] = results[0];
      teamCache[season.id] = results[1] || [];
      pendingHallLoads[season.id] = false;
      renderSeasonCards();
    }).catch(function () {
      pendingHallLoads[season.id] = false;
    });
  }

  function compareSeasonsByYearDesc(a, b) {
    return getSeasonSortValue(b) - getSeasonSortValue(a);
  }

  function getSeasonSortValue(season) {
    var value = Date.parse(season.endDate || season.startDate || '');
    if (!isNaN(value)) return value;
    var year = parseInt(getSeasonYear(season), 10);
    return isNaN(year) ? 0 : year;
  }

  function getSeasonYear(season) {
    var source = season.endDate || season.startDate || season.name || '';
    var match = String(source).match(/(20\d{2})/);
    return match ? match[1] : '2026';
  }

  function getSeasonShortName(season) {
    var name = String((season && season.name) || '');
    var match = name.match(/season\s*([0-9]+)/i);
    if (match) return 'SEASON ' + match[1];
    return name ? name.toUpperCase() : '';
  }

  function getChampionName(archive) {
    if (!archive || !archive.awards) return '';
    return archive.awards.champion || '';
  }

  function findChampionTeam(championName, teams) {
    if (!championName || !teams || !teams.length) return null;
    var normalizedChampion = normalizeName(championName);
    for (var i = 0; i < teams.length; i++) {
      var teamName = teams[i].name || teams[i].teamName || '';
      if (normalizeName(teamName) === normalizedChampion) return teams[i];
    }
    for (var j = 0; j < teams.length; j++) {
      var candidate = normalizeName(teams[j].name || teams[j].teamName || '');
      if (candidate && (normalizedChampion.indexOf(candidate) !== -1 || candidate.indexOf(normalizedChampion) !== -1)) return teams[j];
    }
    return null;
  }

  function getChampionLogo(championTeam) {
    return (championTeam && championTeam.logo) || 'images/logo.png';
  }

  function getFirstPhoto(photos) {
    if (!photos) return '';
    var list = typeof photos === 'string' ? photos.split(',') : (Array.isArray(photos) ? photos : []);
    for (var i = 0; i < list.length; i++) {
      var url = String(list[i] || '').trim();
      if (url) return url;
    }
    return '';
  }

  function normalizeName(name) {
    return String(name || '').toLowerCase().replace(/\s+/g, '').trim();
  }

  // =============================================
  // 載入特定賽季的詳細檔案
  // =============================================
  function loadArchiveDetail(seasonId) {
    // 重置 UI
    awardsGrid.innerHTML = '';
    if (awardsSection) awardsSection.style.display = 'none';
    standingsTbody.innerHTML = '';
    standingsLoading.style.display = '';
    standingsWrapper.style.display = 'none';
    playoffsEmpty.style.display = 'none';
    playoffsBracketWrapper.style.display = 'none';
    summarySection.style.display = 'none';
    finalSection.style.display = 'none';
    finalResult.innerHTML = '';
    photosSection.style.display = 'none';
    trendsSection.style.display = 'none';

    var archivePromise = archiveCache[seasonId]
      ? Promise.resolve(archiveCache[seasonId])
      : API.getArchive(seasonId);

    archivePromise
      .then(function (data) {
        archiveCache[seasonId] = data;
        renderSeasonCards();
        renderDetailTitle(data, seasonId);
        renderSummary(data.summary, data, seasonId);
        renderFinalResult(data.playoffs);
        renderPlayoffs(data.playoffs);
        renderAwards(data.awards || data);
        renderStandings(data.standings || []);
        renderPhotos(data.photos);
      })
      .catch(function () {
        standingsLoading.style.display = 'none';
        awardsGrid.innerHTML = '<p class="text-muted">' + I18n.t('error.loadFailed') + '</p>';
      });
  }

  function scrollToDetail() {
    if (!detailSection) return;
    window.setTimeout(function () {
      detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function renderDetailTitle(data, seasonId) {
    if (!detailTitle) return;
    var season = findSeasonById(seasonId);
    var champion = getChampionName(data);
    var parts = [];
    if (getSeasonShortName(season)) parts.push(getSeasonShortName(season));
    if (champion) parts.push(champion + ' Champions');
    detailTitle.textContent = parts.length ? parts.join(' - ') : 'Hall of Fame Detail';
  }

  function findSeasonById(seasonId) {
    for (var i = 0; i < completedSeasons.length; i++) {
      if (completedSeasons[i].id === seasonId) return completedSeasons[i];
    }
    return null;
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
    if (awardsSection) awardsSection.style.display = awardsGrid.children.length > 0 ? '' : 'none';
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
  function renderFinalResult(playoffs) {
    if (!finalSection || !finalResult) return;
    var game = findFinalGame(playoffs);
    if (!game) {
      finalSection.style.display = 'none';
      finalResult.innerHTML = '';
      return;
    }

    var homeName = game.homeTeamName || game.homeTeam || game.team1 || 'TBD';
    var awayName = game.awayTeamName || game.awayTeam || game.team2 || 'TBD';
    var homeScore = game.homeScore != null ? game.homeScore : '-';
    var awayScore = game.awayScore != null ? game.awayScore : '-';
    var isCompleted = game.status === 'completed' || (game.homeScore != null && game.awayScore != null);
    var homeWinner = isCompleted && Number(game.homeScore) > Number(game.awayScore);
    var awayWinner = isCompleted && Number(game.awayScore) > Number(game.homeScore);

    finalSection.style.display = '';
    finalResult.innerHTML =
      '<div class="archive-final-team ' + (homeWinner ? 'archive-final-team--winner' : '') + '">' +
        '<span class="archive-final-team-name">' + escapeHtml(homeName) + '</span>' +
        '<strong class="archive-final-score">' + escapeHtml(String(homeScore)) + '</strong>' +
      '</div>' +
      '<div class="archive-final-versus">FINAL</div>' +
      '<div class="archive-final-team ' + (awayWinner ? 'archive-final-team--winner' : '') + '">' +
        '<span class="archive-final-team-name">' + escapeHtml(awayName) + '</span>' +
        '<strong class="archive-final-score">' + escapeHtml(String(awayScore)) + '</strong>' +
      '</div>';
  }

  function findFinalGame(playoffs) {
    if (!playoffs) return null;
    if (playoffs.brackets && playoffs.brackets.length) {
      var championBracket = playoffs.brackets.filter(function (bracket) {
        var key = String(bracket.id || bracket.name || '').toLowerCase();
        return key.indexOf('champ') !== -1 || key.indexOf('冠軍') !== -1;
      })[0] || playoffs.brackets[0];
      var rounds = championBracket.rounds || [];
      for (var i = rounds.length - 1; i >= 0; i--) {
        if (rounds[i].games && rounds[i].games.length) return rounds[i].games[0];
      }
    }
    if (playoffs.rounds && playoffs.rounds.length) {
      for (var j = playoffs.rounds.length - 1; j >= 0; j--) {
        var games = playoffs.rounds[j].games || playoffs.rounds[j];
        if (Array.isArray(games) && games.length) return games[0];
      }
    }
    return null;
  }

  function renderPlayoffs(playoffs) {
    var hasBrackets = playoffs && playoffs.brackets && playoffs.brackets.length > 0;
    var hasRounds   = playoffs && playoffs.rounds   && playoffs.rounds.length   > 0;
    if (!hasBrackets && !hasRounds) {
      playoffsEmpty.style.display = '';
      playoffsBracketWrapper.style.display = 'none';
      return;
    }
    playoffsEmpty.style.display = 'none';
    playoffsBracketWrapper.style.display = '';
    playoffsBracket.innerHTML = '';

    // --- Two-bracket display (champions + consolidation) ---
    if (hasBrackets) {
      playoffsBracket.style.gridTemplateColumns = '';
      playoffsBracket.style.display = 'block';
      playoffs.brackets.forEach(function (bracket) {
        var section = document.createElement('div');
        section.className = 'playoff-bracket-section';

        var header = document.createElement('h3');
        header.className = 'playoff-bracket-section-title';
        header.textContent = bracket.name || bracket.id;
        section.appendChild(header);

        var innerGrid = document.createElement('div');
        innerGrid.className = 'playoff-bracket';
        innerGrid.style.gridTemplateColumns = 'repeat(' + (bracket.rounds || []).length + ', minmax(200px, 1fr))';

        (bracket.rounds || []).forEach(function (round, roundIdx) {
          var roundEl = document.createElement('div');
          roundEl.className = 'playoff-round';

          var titleEl = document.createElement('div');
          titleEl.className = 'playoff-round-title';
          titleEl.textContent = round.name || ('Round ' + (roundIdx + 1));
          roundEl.appendChild(titleEl);

          var gamesEl = document.createElement('div');
          gamesEl.className = 'playoff-round-games';
          (round.games || []).forEach(function (game) {
            var matchup = document.createElement('div');
            matchup.className = 'playoff-matchup';
            var hs = game.homeScore != null ? game.homeScore : null;
            var as_ = game.awayScore != null ? game.awayScore : null;
            var isCompleted = game.status === 'completed' || (hs !== null && as_ !== null);
            var homeWin = isCompleted && Number(hs) > Number(as_);
            var awayWin = isCompleted && Number(as_) > Number(hs);
            matchup.appendChild(createPlayoffTeamEl(game.homeTeamName || '', hs, homeWin));
            matchup.appendChild(createPlayoffTeamEl(game.awayTeamName || '', as_, awayWin));
            gamesEl.appendChild(matchup);
          });
          roundEl.appendChild(gamesEl);
          innerGrid.appendChild(roundEl);
        });

        section.appendChild(innerGrid);
        playoffsBracket.appendChild(section);
      });
      return;
    }

    // --- Legacy single-bracket display ---
    playoffsBracket.style.display = '';
    playoffsBracket.style.gridTemplateColumns = 'repeat(' + playoffs.rounds.length + ', 1fr)';

    playoffs.rounds.forEach(function (round, roundIndex) {
      var roundEl = document.createElement('div');
      roundEl.className = 'playoff-round';

      var titleEl = document.createElement('div');
      titleEl.className = 'playoff-round-title';
      titleEl.textContent = round.name || ('Round ' + (roundIndex + 1));
      roundEl.appendChild(titleEl);

      var gamesEl = document.createElement('div');
      gamesEl.className = 'playoff-round-games';

      var games = round.games || round;
      if (Array.isArray(games)) {
        games.forEach(function (game) {
          var matchup = document.createElement('div');
          matchup.className = 'playoff-matchup';
          var hs = game.homeScore != null ? game.homeScore : null;
          var as_ = game.awayScore != null ? game.awayScore : null;
          var isCompleted = game.status === 'completed' || (hs !== null && as_ !== null);
          matchup.appendChild(createPlayoffTeamEl(game.homeTeamName || game.homeTeam || game.team1 || '', hs, isCompleted && Number(hs) > Number(as_)));
          matchup.appendChild(createPlayoffTeamEl(game.awayTeamName || game.awayTeam || game.team2 || '', as_, isCompleted && Number(as_) > Number(hs)));
          gamesEl.appendChild(matchup);
        });
      }

      roundEl.appendChild(gamesEl);
      playoffsBracket.appendChild(roundEl);
    });
  }

  function createPlayoffTeamEl(teamName, score, isWinner) {
    var el = document.createElement('div');
    el.className = 'playoff-team';
    if (isWinner) el.classList.add('playoff-team--winner');

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
  function renderSummary(summary, data, seasonId) {
    if (!summary) summary = buildChampionStory(data, seasonId);
    if (!summary) {
      summarySection.style.display = 'none';
      return;
    }
    summarySection.style.display = '';
    summaryText.textContent = summary;
  }

  function buildChampionStory(data, seasonId) {
    var champion = getChampionName(data);
    if (!champion) return '';
    var season = findSeasonById(seasonId);
    var seasonName = getSeasonShortName(season) || (season && season.name) || '';
    var finalGame = findFinalGame(data && data.playoffs);
    var story = champion + ' became ' + (seasonName ? seasonName + ' ' : '') + 'champions.';
    if (finalGame) {
      var homeName = finalGame.homeTeamName || finalGame.homeTeam || finalGame.team1 || '';
      var awayName = finalGame.awayTeamName || finalGame.awayTeam || finalGame.team2 || '';
      var homeScore = finalGame.homeScore != null ? finalGame.homeScore : '';
      var awayScore = finalGame.awayScore != null ? finalGame.awayScore : '';
      if (homeName && awayName && homeScore !== '' && awayScore !== '') {
        story += ' Final: ' + homeName + ' ' + homeScore + ' - ' + awayScore + ' ' + awayName + '.';
      }
    }
    if (data && data.awards && data.awards.playoffMvp) {
      story += ' Playoff MVP: ' + data.awards.playoffMvp + '.';
    }
    return story;
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
