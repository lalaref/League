var SeasonRules = (function () {
  'use strict';

  var DEFAULT_EXPECTED_GAMES = 7;
  var SEASON1_ID = '845ca40d-4346-448f-bbe2-06b4104bdbda';
  var SEASON2_GROUP_SIZE = 6;
  var SEASON2_EXPECTED_GAMES = 5;

  function getRules(season) {
    var name = String((season && season.name) || '');
    var id = String((season && season.id) || season || '');
    var minGames = season && season.minGamesForRanking != null ? Number(season.minGamesForRanking) : null;
    var isSeason2 = minGames === SEASON2_EXPECTED_GAMES || /season\s*2/i.test(name) || name.indexOf('第二') !== -1 || /season\s*2/i.test(id);
    if (isSeason2) {
      return {
        isDivisionRoundRobin: true,
        expectedGames: SEASON2_EXPECTED_GAMES,
        groupSize: SEASON2_GROUP_SIZE,
        label: 'Season 2 Division single round-robin'
      };
    }
    return {
      isDivisionRoundRobin: false,
      expectedGames: minGames || DEFAULT_EXPECTED_GAMES,
      groupSize: null,
      label: 'Single round-robin'
    };
  }

  function getDefaultSeason(seasons) {
    seasons = seasons || [];
    if (!seasons.length) return null;
    for (var s1 = 0; s1 < seasons.length; s1++) {
      if (isActiveSeason(seasons[s1]) && isSeasonOne(seasons[s1])) return seasons[s1];
    }
    for (var i = seasons.length - 1; i >= 0; i--) {
      if (isActiveSeason(seasons[i])) return seasons[i];
    }
    return seasons[seasons.length - 1];
  }

  function isActiveSeason(season) {
    return season && String(season.status || '').toLowerCase() === 'active';
  }

  function isSeasonOne(season) {
    if (!season) return false;
    var name = String(season.name || season.id || '').toLowerCase();
    return season.id === SEASON1_ID
      || /season\s*1/.test(name)
      || name.indexOf('第一') !== -1
      || String(season.minGamesForRanking || '') === '7';
  }

  function getTeamDivision(team) {
    if (!team) return 'Unassigned';
    return team.division || team.divisionName || team.groupName || team.group || team.pool || 'Unassigned';
  }

  function buildContext(teams, games, season) {
    var rules = getRules(season);
    var teamMap = {};
    var teamMeta = {};
    var teamDivisions = {};
    var divisions = {};

    (teams || []).forEach(function (team) {
      var id = team.id;
      if (!id) return;
      teamMap[id] = team.name || team.teamName || id;
      teamMeta[id] = team;
      var division = rules.isDivisionRoundRobin ? getTeamDivision(team) : 'All Teams';
      teamDivisions[id] = division;
      if (!divisions[division]) divisions[division] = [];
      divisions[division].push(id);
    });

    (games || []).forEach(function (game) {
      addGameTeam(game.homeTeamId, game.homeTeamName || game.home || game.homeTeam);
      addGameTeam(game.awayTeamId, game.awayTeamName || game.away || game.awayTeam);
    });

    Object.keys(divisions).forEach(function (division) {
      divisions[division].sort(function (a, b) {
        return (teamMap[a] || '').localeCompare(teamMap[b] || '');
      });
    });

    return {
      rules: rules,
      teamMap: teamMap,
      teamMeta: teamMeta,
      teamDivisions: teamDivisions,
      divisions: divisions,
      teamIds: Object.keys(teamMap)
    };

    function addGameTeam(id, name) {
      if (!id || teamMap[id]) return;
      teamMap[id] = name || id;
      teamMeta[id] = { id: id, name: teamMap[id] };
      var division = rules.isDivisionRoundRobin ? 'Unassigned' : 'All Teams';
      teamDivisions[id] = division;
      if (!divisions[division]) divisions[division] = [];
      divisions[division].push(id);
    }
  }

  function getExpectedOpponentIds(teamId, context) {
    if (!context || !context.rules.isDivisionRoundRobin) {
      return (context ? context.teamIds : []).filter(function (id) { return id !== teamId; });
    }
    var division = context.teamDivisions[teamId] || 'Unassigned';
    return (context.divisions[division] || []).filter(function (id) { return id !== teamId; });
  }

  function getDivisionNames(context) {
    return Object.keys((context && context.divisions) || {}).sort(function (a, b) {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    });
  }

  function getSortedTeamIds(context) {
    var divisions = getDivisionNames(context);
    var out = [];
    divisions.forEach(function (division) {
      out = out.concat(context.divisions[division] || []);
    });
    return out.length ? out : (context.teamIds || []).slice().sort(function (a, b) {
      return (context.teamMap[a] || '').localeCompare(context.teamMap[b] || '');
    });
  }

  return {
    getRules: getRules,
    getDefaultSeason: getDefaultSeason,
    isSeasonOne: isSeasonOne,
    getTeamDivision: getTeamDivision,
    buildContext: buildContext,
    getExpectedOpponentIds: getExpectedOpponentIds,
    getDivisionNames: getDivisionNames,
    getSortedTeamIds: getSortedTeamIds
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SeasonRules;
}