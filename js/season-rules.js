var SeasonRules = (function () {
  'use strict';

  function text(value) { return String(value == null ? '' : value).trim(); }
  function isSeasonTwo(season) {
    var value = typeof season === 'string' ? season : text((season || {}).name || (season || {}).id);
    return /(?:season|s)\s*0?2\b/i.test(value) || value.indexOf('第二季') !== -1 || value.indexOf('第2季') !== -1;
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
    var seasonTwo = isSeasonTwo(season);
    var rules = seasonTwo
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
  return { isSeasonTwo:isSeasonTwo, getDefaultSeason:getDefaultSeason, getTeamDivision:getTeamDivision, isReturningTeam:isReturningTeam, buildContext:buildContext, getDivisionNames:getDivisionNames, getExpectedOpponentIds:getExpectedOpponentIds };
})();