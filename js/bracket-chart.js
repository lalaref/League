var SeasonBracketChart = (function () {
  'use strict';

  var SEASON_ONE_ID = '845ca40d-4346-448f-bbe2-06b4104bdbda';
  var _lastTeamMap = {};

  function init() {
    var targets = document.querySelectorAll('[data-season-bracket="season1"]');
    if (!targets.length || typeof API === 'undefined') return;
    targets.forEach(function (target) {
      loadSeasonOne(target);
    });
  }

  function loadSeasonOne(target) {
    target.innerHTML = '<div class="nba-bracket-state">載入 Season 1 Bracket...</div>';
    API.getSeasons()
      .then(function (seasons) {
        var season = findSeasonOne(seasons || []);
        if (!season || !season.id) throw new Error('Season 1 not found');
        target.setAttribute('data-season-id', season.id);
        return Promise.all([
          API.getPlayoffs(season.id),
          API.getTeams(season.id),
          API.getGames(season.id)
        ]).then(function (results) {
          render(target, results[0] || {}, { season: season, teams: results[1] || [], games: results[2] || [] });
        });
      })
      .catch(function () {
        target.innerHTML = '<div class="nba-bracket-state">暫時未能載入 Season 1 Bracket</div>';
      });
  }

  function findSeasonOne(seasons) {
    for (var i = 0; i < seasons.length; i++) {
      var season = seasons[i];
      if (!season) continue;
      var name = String(season.name || season.id || '').toLowerCase();
      if (season.id === SEASON_ONE_ID || /season\s*1/.test(name) || name.indexOf('第一') !== -1 || String(season.minGamesForRanking || '') === '7') {
        return season;
      }
    }
    return null;
  }

  function render(target, data, options) {
    var season = options && options.season ? options.season : null;
    var teams = options && options.teams ? options.teams : [];
    var games = options && options.games ? options.games : [];
    var teamMap = buildTeamMap(teams);
    _lastTeamMap = teamMap;
    var groups = normalizeBracketGroups(data, teamMap, teams, games);
    if (!groups.length) {
      target.innerHTML = '<div class="nba-bracket-state">Season 1 playoff bracket 尚未公布</div>';
      return;
    }

    var title = season && season.name ? season.name : 'Season 1';
    target.innerHTML = '<div class="nba-bracket-head">'
      + '<div><span class="nba-bracket-kicker">Season 1</span><h3>Playoff Bracket Matchup</h3></div>'
      + '<a class="nba-bracket-link" href="schedule.html#playoffs">完整賽程</a>'
      + '</div>'
      + '<div class="nba-bracket-season">' + esc(title) + '</div>'
      + groups.map(renderBracketGroup).join('');
  }

  function normalizeBracketGroups(data, teamMap, teams, games) {
    var groups = [];

    if (data && data.brackets && data.brackets.length) {
      data.brackets.forEach(function (bracket) {
        var rounds = normalizeRounds({ rounds: bracket.rounds || [] }, teamMap);
        if (rounds.length) groups.push({ title: bracket.name || 'Playoff Bracket', rounds: rounds });
      });
    } else {
      var championshipRounds = normalizeRounds(data || {}, teamMap);
      if (championshipRounds.length) groups.push({ title: '冠軍組', rounds: championshipRounds });
    }

    if (!hasRankingGroup(groups)) {
      var rankingRounds = buildRankingRounds(teams, games, groups);
      if (rankingRounds.length) groups.push({ title: '排名賽對賽', rounds: rankingRounds });
    }

    return groups;
  }

  function hasRankingGroup(groups) {
    return (groups || []).some(function (group) {
      var title = String(group.title || '').toLowerCase();
      return title.indexOf('排名') !== -1 || title.indexOf('consol') !== -1 || title.indexOf('ranking') !== -1;
    });
  }

  function normalizeRounds(data, teamMap) {
    var sourceRounds = [];
    if (data && data.brackets && data.brackets.length) {
      data.brackets.forEach(function (bracket) {
        (bracket.rounds || []).forEach(function (round) {
          sourceRounds.push({
            name: (bracket.name ? bracket.name + ' · ' : '') + (round.name || ''),
            round: round.round,
            games: round.games || []
          });
        });
      });
    } else if (data && data.rounds && data.rounds.length) {
      sourceRounds = data.rounds;
    } else if (data && Array.isArray(data.bracket)) {
      sourceRounds = data.bracket.map(function (games, idx) {
        return { name: idx === 0 ? '首輪' : (idx === 1 ? '決賽' : 'Round ' + (idx + 1)), games: games || [] };
      });
    }

    var rounds = sourceRounds.map(function (round, idx) {
      var games = (round.games || []).map(function (game) {
        return normalizeGame(game, teamMap);
      }).filter(Boolean);
      return { name: round.name || ('Round ' + (idx + 1)), games: games };
    }).filter(function (round) { return round.games.length; });

    if (rounds.length === 1 && rounds[0].games.length >= 2) {
      rounds.push({
        name: '決賽',
        games: [buildAdvancementGame(rounds[0].games, '勝方 1', '勝方 2', 'Winner Game 1 vs Winner Game 2')]
      });
    }

    resolveAdvancementPlaceholders(rounds);
    return rounds;
  }

  function buildRankingRounds(teams, games, groups) {
    var standings = computeTeamStandings(teams, games);
    var playoffNames = collectPlayoffTeamNames(groups);
    var rankingTeams = standings.filter(function (team) {
      return !playoffNames[normalizeName(team.teamName)];
    });

    if (rankingTeams.length < 2) return [];

    var firstRoundGames = [];
    if (rankingTeams.length >= 4) {
      firstRoundGames.push(rankingGame(rankingTeams[0], rankingTeams[3]));
      firstRoundGames.push(rankingGame(rankingTeams[1], rankingTeams[2]));
    } else {
      firstRoundGames.push(rankingGame(rankingTeams[0], rankingTeams[1]));
    }

    var rounds = [{ name: '排名賽', games: firstRoundGames }];
    if (firstRoundGames.length >= 2) {
      rounds.push({
        name: '排名決賽',
        games: [buildAdvancementGame(firstRoundGames, '排名賽勝方 1', '排名賽勝方 2', 'Winner Ranking Game 1 vs Winner Ranking Game 2')]
      });
    }

    resolveAdvancementPlaceholders(rounds);
    return rounds;
  }

  function buildAdvancementGame(previousGames, homeFallback, awayFallback, label) {
    var homeName = winnerName(previousGames && previousGames[0], homeFallback);
    var awayName = winnerName(previousGames && previousGames[1], awayFallback);
    return {
      label: homeName + ' vs ' + awayName,
      homeName: homeName,
      awayName: awayName,
      homeScore: '',
      awayScore: '',
      homeWin: false,
      awayWin: false
    };
  }

  function resolveAdvancementPlaceholders(rounds) {
    (rounds || []).forEach(function (round, roundIdx) {
      if (roundIdx === 0) return;
      var previousGames = (rounds[roundIdx - 1] && rounds[roundIdx - 1].games) || [];
      (round.games || []).forEach(function (game) {
        game.homeName = resolveWinnerPlaceholder(game.homeName, previousGames);
        game.awayName = resolveWinnerPlaceholder(game.awayName, previousGames);
        game.label = resolveWinnerPlaceholdersInText(game.label, previousGames);
      });
    });
  }

  function resolveWinnerPlaceholdersInText(value, previousGames) {
    return String(value || '').replace(/(?:勝方|排名賽勝方|Winner\s+Game|Winner\s+Ranking\s+Game)\s*(\d+)/gi, function (token, indexText) {
      var index = parseInt(indexText, 10) - 1;
      return winnerName(previousGames[index], token);
    });
  }

  function resolveWinnerPlaceholder(value, previousGames) {
    var text = String(value || '');
    var match = text.match(/(?:勝方|排名賽勝方|Winner\s+Game|Winner\s+Ranking\s+Game)\s*(\d+)/i);
    if (!match) return value;
    var index = parseInt(match[1], 10) - 1;
    return winnerName(previousGames[index], value);
  }

  function winnerName(game, fallback) {
    if (!game) return fallback;
    if (game.homeWin) return game.homeName || fallback;
    if (game.awayWin) return game.awayName || fallback;
    return fallback;
  }

  function rankingGame(home, away) {
    return {
      label: home.rank + ' vs ' + away.rank,
      homeName: home.teamName,
      awayName: away.teamName,
      homeScore: '',
      awayScore: '',
      homeWin: false,
      awayWin: false
    };
  }

  function computeTeamStandings(teams, games) {
    var table = {};
    (teams || []).forEach(function (team) {
      var id = String(team.id || team.teamId || '');
      if (!id) return;
      table[id] = {
        id: id,
        teamName: team.name || team.teamName || id,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
        points: 0
      };
    });

    (games || []).forEach(function (game) {
      if (!game || game.status !== 'completed') return;
      if (String(game.type || '').toLowerCase() === 'playoff') return;
      var home = table[String(game.homeTeamId || '')];
      var away = table[String(game.awayTeamId || '')];
      if (!home || !away) return;
      var score = getGameScore(game);
      home.played += 1;
      away.played += 1;
      home.pointsFor += score.home;
      home.pointsAgainst += score.away;
      away.pointsFor += score.away;
      away.pointsAgainst += score.home;
      if (score.home > score.away) {
        home.wins += 1;
        away.losses += 1;
        home.points += 3;
        away.points += 1;
      } else if (score.away > score.home) {
        away.wins += 1;
        home.losses += 1;
        away.points += 3;
        home.points += 1;
      } else {
        home.points += 2;
        away.points += 2;
      }
    });

    return Object.keys(table).map(function (id) {
      var team = table[id];
      team.diff = team.pointsFor - team.pointsAgainst;
      return team;
    }).sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      if (b.diff !== a.diff) return b.diff - a.diff;
      if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      return a.teamName.localeCompare(b.teamName);
    }).map(function (team, idx) {
      team.rank = idx + 1;
      return team;
    });
  }

  function getGameScore(game) {
    var hasQuarters = game.homeQ1 || game.homeQ2 || game.homeQ3 || game.homeQ4 || game.awayQ1 || game.awayQ2 || game.awayQ3 || game.awayQ4;
    if (hasQuarters) {
      return {
        home: (parseInt(game.homeQ1, 10) || 0) + (parseInt(game.homeQ2, 10) || 0) + (parseInt(game.homeQ3, 10) || 0) + (parseInt(game.homeQ4, 10) || 0),
        away: (parseInt(game.awayQ1, 10) || 0) + (parseInt(game.awayQ2, 10) || 0) + (parseInt(game.awayQ3, 10) || 0) + (parseInt(game.awayQ4, 10) || 0)
      };
    }
    return {
      home: parseInt(game.homeScore, 10) || 0,
      away: parseInt(game.awayScore, 10) || 0
    };
  }

  function collectPlayoffTeamNames(groups) {
    var names = {};
    (groups || []).forEach(function (group) {
      (group.rounds || []).forEach(function (round) {
        (round.games || []).forEach(function (game) {
          if (game.homeName && game.homeName !== 'TBD' && game.homeName.indexOf('勝方') === -1) names[normalizeName(game.homeName)] = true;
          if (game.awayName && game.awayName !== 'TBD' && game.awayName.indexOf('勝方') === -1) names[normalizeName(game.awayName)] = true;
        });
      });
    });
    return names;
  }

  function normalizeName(value) {
    return String(value || '').trim().toLowerCase();
  }

  function renderBracketGroup(group) {
    return '<div class="nba-bracket-group">'
      + '<div class="nba-bracket-group-title">' + esc(group.title || 'Bracket') + '</div>'
      + '<div class="nba-bracket-scroll"><div class="nba-bracket-grid" style="grid-template-columns:repeat(' + group.rounds.length + ', minmax(220px, 1fr))">'
      + group.rounds.map(renderRound).join('')
      + '</div></div>'
      + '</div>';
  }

  function normalizeGame(game, teamMap) {
    if (!game) return null;
    var homeName = game.homeTeamName || game.home || game.homeTeam || teamName(teamMap, game.homeTeamId) || 'TBD';
    var awayName = game.awayTeamName || game.away || game.awayTeam || teamName(teamMap, game.awayTeamId) || 'TBD';
    var homeScore = valueOrBlank(game.homeScore);
    var awayScore = valueOrBlank(game.awayScore);
    var complete = game.status === 'completed' || (homeScore !== '' && awayScore !== '');
    return {
      label: game.label || game.notes || '',
      homeName: homeName,
      awayName: awayName,
      homeScore: homeScore,
      awayScore: awayScore,
      homeWin: complete && Number(homeScore) > Number(awayScore),
      awayWin: complete && Number(awayScore) > Number(homeScore)
    };
  }

  function renderRound(round) {
    return '<div class="nba-bracket-round">'
      + '<div class="nba-bracket-round-title">' + esc(round.name) + '</div>'
      + '<div class="nba-bracket-games">' + round.games.map(renderGame).join('') + '</div>'
      + '</div>';
  }

  function renderGame(game) {
    return '<div class="nba-bracket-game">'
      + (game.label ? '<div class="nba-bracket-label">' + esc(game.label) + '</div>' : '')
      + renderTeam(game.homeName, game.homeScore, game.homeWin)
      + renderTeam(game.awayName, game.awayScore, game.awayWin)
      + '</div>';
  }

  function renderTeam(name, score, isWinner) {
    return '<div class="nba-bracket-team' + (isWinner ? ' is-winner' : '') + '">'
      + '<span>' + teamLinkByName(name) + '</span>'
      + '<strong>' + esc(String(score)) + '</strong>'
      + '</div>';
  }

  function teamLinkByName(name) {
    var id = findTeamIdByName(name);
    var label = esc(name);
    if (!id) return label;
    return '<a class="team-link team-link--dark" href="team.html?id=' + encodeURIComponent(id) + '">' + label + '</a>';
  }

  function findTeamIdByName(name) {
    var target = normalizeName(name);
    if (!target || target === 'tbd' || target.indexOf('勝方') !== -1) return '';
    var ids = Object.keys(_lastTeamMap || {});
    for (var i = 0; i < ids.length; i++) {
      if (normalizeName(_lastTeamMap[ids[i]]) === target) return ids[i];
    }
    return '';
  }

  function buildTeamMap(teams) {
    var map = {};
    (teams || []).forEach(function (team) {
      if (!team) return;
      map[String(team.id || team.teamId || '')] = team.name || team.teamName || '';
    });
    return map;
  }

  function teamName(map, id) {
    return id != null ? map[String(id)] : '';
  }

  function valueOrBlank(value) {
    return value !== '' && value != null ? value : '';
  }

  function esc(value) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(value == null ? '' : String(value)));
    return div.innerHTML;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { render: render, loadSeasonOne: loadSeasonOne };
})();
