var SeasonRules = (function () {
  'use strict';

  function text(value) { return String(value == null ? '' : value).trim(); }
  function isSeasonTwo(season) {
    function matchesSeasonTwo(value) {
      value = text(value);
      return /(?:season|s)\s*0?2\b/i.test(value) || /第\s*(?:二|2)\s*(?:季|屆)/.test(value);
    }
    if (typeof season === 'string') return matchesSeasonTwo(season);
    season = season || {};
    return text(season.id) === 'c90f2419-8111-43ef-9506-a2d082426b75'
      || matchesSeasonTwo(season.name)
      || matchesSeasonTwo(season.id)
      || Number(season.minGamesForRanking) === 5;
  }
  function getDefaultSeason(seasons) {
    var list = seasons || [];
    var activeS2 = list.filter(function (s) { return text(s.status).toLowerCase() === 'active' && isSeasonTwo(s); });
    var anyS2 = list.filter(isSeasonTwo);
    var active = list.filter(function (s) { return text(s.status).toLowerCase() === 'active'; });
    return activeS2[activeS2.length - 1] || anyS2[anyS2.length - 1] || active[active.length - 1] || list[list.length - 1] || null;
  }
  function getTeamDivision(team) {
    var value = text((team || {}).division);
    var normalized = value.toLowerCase().replace(/[\s_-]+/g, '');
    normalized = normalized.replace(/^division/, '').replace(/division$/, '');
    if (normalized === 'clutch') return 'Clutch';
    if (normalized === 'fastbreak') return 'Fastbreak';
    return value || 'Unassigned';
  }
  function isReturningTeam(team) {
    return !!text((team || {}).parentTeamId || (team || {}).previousTeamId || (team || {}).season1TeamId);
  }
  function buildContext(teams, games, season) {
    var teamMap = {}, teamMeta = {}, teamIds = [], teamDivisions = {}, divisions = {};
    (teams || []).forEach(function (team) {
      var id = text(team.id || team.teamId); if (!id) return;
      var division = getTeamDivision(team); teamIds.push(id); teamMap[id] = team.name || team.teamName || id;
      teamMeta[id] = team; teamDivisions[id] = division; if (!divisions[division]) divisions[division] = []; divisions[division].push(id);
    });
    var hasClutch = !!(divisions.Clutch && divisions.Clutch.length);
    var hasFastbreak = !!(divisions.Fastbreak && divisions.Fastbreak.length);
    var divisionRoundRobin = isSeasonTwo(season) || (hasClutch && hasFastbreak);
    var rules = divisionRoundRobin
      ? { isDivisionRoundRobin:true, expectedGames:5, divisionCount:2, groupSize:8, groupMinSize:8, groupMaxSize:8, avoidReturningMatchups:false, label:'Season 2: Clutch 8 teams · Fastbreak 8 teams · 5 games per team' }
      : { isDivisionRoundRobin:false, expectedGames:Number((season || {}).minGamesForRanking) || 7, avoidReturningMatchups:false, label:'Regular season' };
    return { rules:rules, season:season, teams:teams || [], games:games || [], teamMap:teamMap, teamMeta:teamMeta, teamIds:teamIds, teamDivisions:teamDivisions, divisions:divisions };
  }
  function getDivisionNames(context) {
    var names = Object.keys((context || {}).divisions || {});
    return names.sort(function (a, b) { return (a === 'Clutch' ? 0 : a === 'Fastbreak' ? 1 : 2) - (b === 'Clutch' ? 0 : b === 'Fastbreak' ? 1 : 2) || a.localeCompare(b); });
  }
  function getExpectedOpponentIds(teamId, context) {
    var division = (context.teamDivisions || {})[teamId];
    return ((context.divisions || {})[division] || []).filter(function (id) { return id !== teamId; });
  }

  // Season 2 playoff brackets seed round 1 by regular-season division rank, crossed
  // between Clutch and Fastbreak (mirrors backend handleGeneratePlayoffs). Slot order is
  // bracket position, not chronological order: slots 1+2 feed the first semi-final.
  var PLAYOFF_SLOT_SEEDS = {
    champions: [[1, 4], [3, 2], [2, 3], [4, 1]],
    consolation: [[5, 8], [7, 6], [6, 7], [8, 5]]
  };

  function buildDivisionRankMap(standings) {
    var ranks = {};
    (standings || []).forEach(function (row) {
      var division = getTeamDivision(row);
      if (division !== 'Clutch' && division !== 'Fastbreak') return;
      var id = text(row.teamId || row.id);
      if (!id) return;
      if (!ranks[division]) ranks[division] = [];
      ranks[division].push(id);
    });
    return ranks;
  }

  // Returns the games in bracket slot order, or null when the seeding cannot be matched
  // confidently (e.g. incomplete standings) so callers keep the API order.
  function orderPlayoffBracketGames(seed, games, standings) {
    var slots = PLAYOFF_SLOT_SEEDS[text(seed).toLowerCase()];
    if (!slots || !games || games.length < 2) return null;
    var ranks = buildDivisionRankMap(standings);
    if (!ranks.Clutch || !ranks.Fastbreak) return null;
    var used = {}, ordered = [], matched = 0;
    games.forEach(function (game) {
      var home = text(game.homeTeamId), away = text(game.awayTeamId);
      for (var i = 0; i < slots.length; i++) {
        if (used[i]) continue;
        var clutch = ranks.Clutch[slots[i][0] - 1], fastbreak = ranks.Fastbreak[slots[i][1] - 1];
        if (!clutch || !fastbreak) continue;
        if ((home === clutch && away === fastbreak) || (home === fastbreak && away === clutch)) {
          ordered[i] = game; used[i] = true; matched++; return;
        }
      }
    });
    if (matched !== games.length) return null;
    return ordered.filter(function (game) { return !!game; });
  }

  return { isSeasonTwo:isSeasonTwo, getDefaultSeason:getDefaultSeason, getTeamDivision:getTeamDivision, isReturningTeam:isReturningTeam, buildContext:buildContext, getDivisionNames:getDivisionNames, getExpectedOpponentIds:getExpectedOpponentIds, orderPlayoffBracketGames:orderPlayoffBracketGames };
})();