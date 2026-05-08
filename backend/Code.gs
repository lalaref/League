/**
 * ALL-IN Basketball League — Google Apps Script Backend
 * API 路由層、授權機制、快取管理
 */

// ============================================================
// 常量
// ============================================================
var CACHE_TTL = 300;

var VALID_GET_ACTIONS = [
  'seasons', 'teams', 'players', 'games', 'boxscore',
  'standings', 'leaders', 'playerProfile', 'teamProfile',
  'schedule', 'playoffs', 'shotchart', 'advancedStats',
  'achievements', 'archive', 'announcements', 'recentAchievements', 'teamByToken'
];

var VALID_POST_ACTIONS = [
  'submitBoxScore', 'updateBoxScore', 'createGame', 'updateGame',
  'submitShotLocation', 'generatePlayoffs', 'archiveSeason',
  'createAnnouncement', 'updateAnnouncement', 'deleteAnnouncement',
  'cancelGame', 'deleteGame',
  'createTeam', 'updateTeam', 'deleteTeam',
  'publicUpdateTeam', 'publicCreatePlayer', 'publicUpdatePlayer', 'publicDeletePlayer'
];

// ============================================================
// 回應工具
// ============================================================
function createSuccessResponse(data, cached) {
  var response = {
    status: 'success',
    data: data,
    cached: cached === true,
    timestamp: new Date().toISOString()
  };
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function createErrorResponse(code, message) {
  var response = {
    status: 'error',
    code: code,
    message: message
  };
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 授權驗證
// ============================================================
function validateApiKey(e) {
  var storedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!storedKey) return false;
  var providedKey = null;
  if (e && e.parameter && e.parameter.apiKey) {
    providedKey = e.parameter.apiKey;
  }
  if (!providedKey && e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      if (body.apiKey) providedKey = body.apiKey;
    } catch (err) { /* ignore */ }
  }
  return providedKey === storedKey;
}

// ============================================================
// 快取管理
// ============================================================
function getCachedResponse(cacheKey) {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
    return null;
  } catch (err) { return null; }
}

function setCachedResponse(cacheKey, data, ttl) {
  try {
    var cache = CacheService.getScriptCache();
    cache.put(cacheKey, JSON.stringify(data), ttl || CACHE_TTL);
  } catch (err) { /* ignore */ }
}

function buildCacheKey(action, params) {
  if (!params) return action;
  if (params.gameId) return action + '_' + params.gameId;
  if (params.playerId) return action + '_' + params.playerId;
  if (params.teamId) return action + '_' + params.teamId;
  if (params.seasonId) {
    // Leaders are keyed per-category to avoid one category evicting another
    if (action === 'leaders' && params.cat) return action + '_' + params.seasonId + '_' + params.cat;
    return action + '_' + params.seasonId;
  }
  return action;
}

function clearRelatedCache(action, params) {
  try {
    var cache = CacheService.getScriptCache();
    var keysToRemove = [];

    if (action === 'submitBoxScore' || action === 'updateBoxScore') {
      var gameId = params && params.gameId ? params.gameId : '';
      var seasonId = params && params.seasonId ? params.seasonId : '';
      // If seasonId not provided, look it up from Games sheet so caches are properly cleared
      if (!seasonId && gameId) {
        try {
          var gRows = _sheetToObjects('Games');
          for (var k = 0; k < gRows.length; k++) {
            if (String(gRows[k].id) === String(gameId)) { seasonId = String(gRows[k].seasonId || ''); break; }
          }
        } catch (e) { /* ignore */ }
      }
      var leaderCats = ['pts', 'reb', 'ast', 'stl', 'blk', 'fg_pct', 'tp_pct', 'ft_pct'];
      leaderCats.forEach(function(cat) { keysToRemove.push('leaders_' + seasonId + '_' + cat); });
      keysToRemove.push('boxscore_' + gameId, 'standings_' + seasonId, 'leaders_' + seasonId);
      keysToRemove.push('standings', 'leaders', 'games_' + seasonId, 'games');
      keysToRemove.push('schedule_' + seasonId, 'schedule', 'recentAchievements_' + seasonId);
      if (params && params.entries && params.entries.length > 0) {
        for (var i = 0; i < params.entries.length; i++) {
          var entry = params.entries[i];
          if (entry.playerId) {
            keysToRemove.push('playerProfile_' + entry.playerId, 'advancedStats_' + entry.playerId, 'achievements_' + entry.playerId);
          }
          if (entry.teamId) keysToRemove.push('teamProfile_' + entry.teamId);
        }
      }
    } else if (action === 'createGame' || action === 'updateGame' || action === 'cancelGame' || action === 'deleteGame') {
      var seasonId2 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('games_' + seasonId2, 'games', 'schedule_' + seasonId2, 'schedule');
    } else if (action === 'submitShotLocation') {
      keysToRemove.push('shotchart_' + (params && params.playerId || ''), 'shotchart_' + (params && params.gameId || ''));
    } else if (action === 'generatePlayoffs') {
      var seasonId3 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('playoffs_' + seasonId3, 'playoffs');
    } else if (action === 'archiveSeason') {
      var seasonId4 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('archive_' + seasonId4, 'archive', 'seasons');
    } else if (action === 'createAnnouncement' || action === 'updateAnnouncement' || action === 'deleteAnnouncement') {
      keysToRemove.push('announcements');
    }

    if (keysToRemove.length > 0) cache.removeAll(keysToRemove);
  } catch (err) { /* ignore */ }
}

// ============================================================
// HELPERS
// ============================================================

/** Read a sheet as an array of plain objects keyed by header row. */
function _sheetToObjects(name) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    var all = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    var headers = all[0];
    var rows = [];
    for (var i = 1; i < all.length; i++) {
      var obj = {}; var hasData = false;
      for (var j = 0; j < headers.length; j++) {
        if (!headers[j]) continue;
        var v = all[i][j];
        if (v instanceof Date) {
          // Time-only values (epoch 1899-12-30)
          if (v.getFullYear() <= 1900) {
            v = ('0' + v.getHours()).slice(-2) + ':' + ('0' + v.getMinutes()).slice(-2);
          } else {
            v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          }
        }
        obj[headers[j]] = v;
        if (v !== '' && v !== null && v !== undefined) hasData = true;
      }
      if (hasData) rows.push(obj);
    }
    return rows;
  } catch (err) { Logger.log('[_sheetToObjects] ' + name + ': ' + err.message); return []; }
}

function _str(v) { return (v != null && v !== '') ? String(v) : ''; }
function _num(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
function _rnd(v, d) { var f = Math.pow(10, d || 1); return Math.round(_num(v) * f) / f; }

// ============================================================
// GET 處理器  (return raw data — doGet wraps in createSuccessResponse)
// ============================================================

function handleGetSeasons(e) {
  return _sheetToObjects('Seasons').map(function(r) {
    return { id: _str(r.id), name: _str(r.name), status: _str(r.status),
             startDate: _str(r.startDate), endDate: _str(r.endDate) };
  }).filter(function(s) { return s.id; });
}

function handleGetTeams(e) {
  var sid = e && e.parameter ? _str(e.parameter.seasonId) : '';
  var rows = _sheetToObjects('Teams');
  if (sid) rows = rows.filter(function(r) { return _str(r.seasonId) === sid; });
  return rows.map(function(r) {
    return { id: _str(r.id), seasonId: _str(r.seasonId), name: _str(r.name),
             captain: _str(r.captain), captainWhatsApp: _str(r.captainWhatsApp || r.whatsapp),
             logo: _str(r.logo), description: _str(r.description),
             jerseyHome: _str(r.jerseyHome), jerseyAway: _str(r.jerseyAway),
             whatsapp: _str(r.captainWhatsApp || r.whatsapp),
             teamToken: _str(r.teamToken) };
  }).filter(function(t) { return t.id; });
}

function handleGetTeamByToken(e) {
  var token = e && e.parameter ? _str(e.parameter.token) : '';
  if (!token) return createErrorResponse(400, '缺少必要參數：token');
  var rows = _sheetToObjects('Teams');
  var team = null;
  for (var i = 0; i < rows.length; i++) {
    if (_str(rows[i].teamToken) === token) { team = rows[i]; break; }
  }
  if (!team) return createErrorResponse(404, '找不到此球隊，請確認連結是否正確');
  var playerRows = _sheetToObjects('Players').filter(function(p) { return _str(p.teamId) === _str(team.id); });
  var players = playerRows.map(function(p) {
    return { id: _str(p.id), teamId: _str(p.teamId), name: _str(p.name),
             number: (p.number !== '' && p.number != null) ? _num(p.number) : '',
             position: _str(p.position), photo: _str(p.photo) };
  });
  var payload = { team: { id: _str(team.id), seasonId: _str(team.seasonId), name: _str(team.name),
                           captain: _str(team.captain), captainWhatsApp: _str(team.captainWhatsApp || team.whatsapp),
                           logo: _str(team.logo), description: _str(team.description),
                           jerseyHome: _str(team.jerseyHome), jerseyAway: _str(team.jerseyAway) },
                  players: players };
  return createSuccessResponse(payload, false);
}

function handleGetPlayers(e) {
  var tid = e && e.parameter ? _str(e.parameter.teamId) : '';
  var rows = _sheetToObjects('Players');
  if (tid) rows = rows.filter(function(r) { return _str(r.teamId) === tid; });
  return rows.map(function(r) {
    return { id: _str(r.id), teamId: _str(r.teamId), name: _str(r.name),
             number: (r.number !== '' && r.number != null) ? _num(r.number) : '',
             position: _str(r.position), photo: _str(r.photo) };
  }).filter(function(p) { return p.id; });
}

function _buildTeamMap(teamRows) {
  var m = {}; teamRows.forEach(function(t) { m[_str(t.id)] = t; }); return m;
}

function _gamesWithTeamNames(gameRows, teamMap) {
  return gameRows.map(function(g) {
    var ht = teamMap[_str(g.homeTeamId)] || {}, at = teamMap[_str(g.awayTeamId)] || {};
    var hs = (g.homeScore !== '' && g.homeScore != null) ? _num(g.homeScore) : null;
    var as_ = (g.awayScore !== '' && g.awayScore != null) ? _num(g.awayScore) : null;
    return { id: _str(g.id), seasonId: _str(g.seasonId), date: _str(g.date), time: _str(g.time),
             venue: _str(g.venue), homeTeamId: _str(g.homeTeamId), awayTeamId: _str(g.awayTeamId),
             homeTeamName: _str(g.homeTeamName || ht.name || ''),
             awayTeamName: _str(g.awayTeamName || at.name || ''),
             homeScore: hs, awayScore: as_,
             homeJersey: _str(ht.jerseyHome || ''), awayJersey: _str(at.jerseyAway || ''),
             type: _str(g.type || 'regular'), status: _str(g.status || 'scheduled'),
             mvpPlayerId: _str(g.mvpPlayerId || ''),
             homeQ1: _num(g.homeQ1), homeQ2: _num(g.homeQ2), homeQ3: _num(g.homeQ3), homeQ4: _num(g.homeQ4),
             awayQ1: _num(g.awayQ1), awayQ2: _num(g.awayQ2), awayQ3: _num(g.awayQ3), awayQ4: _num(g.awayQ4) };
  }).filter(function(g) { return g.id; });
}

function handleGetGames(e) {
  var sid = e && e.parameter ? _str(e.parameter.seasonId) : '';
  var gameRows = _sheetToObjects('Games');
  var teamMap = _buildTeamMap(_sheetToObjects('Teams'));
  if (sid) gameRows = gameRows.filter(function(g) { return _str(g.seasonId) === sid; });
  return _gamesWithTeamNames(gameRows, teamMap);
}

function handleGetSchedule(e) { return handleGetGames(e); }

function handleGetBoxScore(e) {
  var gameId = e && e.parameter ? _str(e.parameter.gameId) : '';
  if (!gameId) return {};
  var teamMap = _buildTeamMap(_sheetToObjects('Teams'));
  var playerRows = _sheetToObjects('Players');
  var playerMap = {}; playerRows.forEach(function(p) { playerMap[_str(p.id)] = p; });
  var gameRows = _sheetToObjects('Games');
  var game = null;
  for (var i = 0; i < gameRows.length; i++) { if (_str(gameRows[i].id) === gameId) { game = gameRows[i]; break; } }
  if (!game) return {};
  var ht = teamMap[_str(game.homeTeamId)] || {}, at = teamMap[_str(game.awayTeamId)] || {};
  var gameData = { id: gameId, seasonId: _str(game.seasonId), date: _str(game.date), time: _str(game.time),
    venue: _str(game.venue), homeTeamId: _str(game.homeTeamId), awayTeamId: _str(game.awayTeamId),
    homeTeamName: _str(game.homeTeamName || ht.name || ''), awayTeamName: _str(game.awayTeamName || at.name || ''),
    homeScore: (game.homeScore !== '' && game.homeScore != null) ? _num(game.homeScore) : null,
    awayScore: (game.awayScore !== '' && game.awayScore != null) ? _num(game.awayScore) : null,
    homeJersey: _str(ht.jerseyHome || ''), awayJersey: _str(at.jerseyAway || ''),
    status: _str(game.status || 'scheduled'), mvpPlayerId: _str(game.mvpPlayerId || ''),
    homeQ1: _num(game.homeQ1), homeQ2: _num(game.homeQ2), homeQ3: _num(game.homeQ3), homeQ4: _num(game.homeQ4),
    awayQ1: _num(game.awayQ1), awayQ2: _num(game.awayQ2), awayQ3: _num(game.awayQ3), awayQ4: _num(game.awayQ4) };
  var boxRows = _sheetToObjects('BoxScores').filter(function(b) { return _str(b.gameId) === gameId; });
  var homeStats = [], awayStats = [];
  boxRows.forEach(function(b) {
    var p = playerMap[_str(b.playerId)] || {}, tm = teamMap[_str(b.teamId)] || {};
    var reb = _num(b.reb) || (_num(b.oreb) + _num(b.dreb));
    var entry = { playerId: _str(b.playerId), playerName: _str(p.name || ''),
      number: (p.number !== '' && p.number != null) ? p.number : '',
      teamId: _str(b.teamId), teamName: _str(tm.name || ''),
      pts: _num(b.pts), reb: reb, oreb: _num(b.oreb), dreb: _num(b.dreb),
      ast: _num(b.ast), stl: _num(b.stl), blk: _num(b.blk),
      fgm: _num(b.fgm), fga: _num(b.fga), tpm: _num(b.tpm), tpa: _num(b.tpa),
      ftm: _num(b.ftm), fta: _num(b.fta), to: _num(b.to), fouls: _num(b.fouls) };
    if (_str(b.teamId) === _str(game.homeTeamId)) homeStats.push(entry); else awayStats.push(entry);
  });
  homeStats.sort(function(a,b){return b.pts-a.pts;}); awayStats.sort(function(a,b){return b.pts-a.pts;});
  return { game: gameData, homeStats: homeStats, awayStats: awayStats };
}

function handleGetStandings(e) {
  var sid = e && e.parameter ? _str(e.parameter.seasonId) : '';
  var teamRows = _sheetToObjects('Teams');
  var gameRows = _sheetToObjects('Games').filter(function(g) {
    return _str(g.seasonId) === sid && _str(g.status) === 'completed' && _str(g.type) !== 'playoff';
  });
  var teams = {};
  teamRows.filter(function(t){return _str(t.seasonId)===sid;}).forEach(function(t) {
    teams[_str(t.id)] = { teamId: _str(t.id), teamName: _str(t.name), wins:0, losses:0, draws:0, pf:0, pa:0 };
  });
  gameRows.forEach(function(g) {
    var hid=_str(g.homeTeamId), aid=_str(g.awayTeamId), hs=_num(g.homeScore), as_=_num(g.awayScore);
    if (!teams[hid]) teams[hid] = { teamId:hid, teamName:'', wins:0, losses:0, draws:0, pf:0, pa:0 };
    if (!teams[aid]) teams[aid] = { teamId:aid, teamName:'', wins:0, losses:0, draws:0, pf:0, pa:0 };
    teams[hid].pf+=hs; teams[hid].pa+=as_; teams[aid].pf+=as_; teams[aid].pa+=hs;
    if (hs>as_) { teams[hid].wins++; teams[aid].losses++; }
    else if (as_>hs) { teams[aid].wins++; teams[hid].losses++; }
    else { teams[hid].draws++; teams[aid].draws++; }
  });
  var standings = Object.keys(teams).map(function(tid) {
    var t=teams[tid], played=t.wins+t.losses+t.draws;
    return { teamId:t.teamId, teamName:t.teamName, played:played,
             wins:t.wins, losses:t.losses, draws:t.draws,
             points:t.wins*2+t.draws, diff:t.pf-t.pa, pointsFor:t.pf, pointsAgainst:t.pa };
  });
  standings.sort(function(a,b){ return b.points-a.points || b.diff-a.diff || b.wins-a.wins; });
  return standings;
}

function _aggregateBoxBySeasonGames(boxRows, seasonGameIds) {
  var agg = {};
  boxRows.forEach(function(b) {
    if (!seasonGameIds[_str(b.gameId)]) return;
    var pid = _str(b.playerId), tid = _str(b.teamId);
    if (!agg[pid]) agg[pid] = { playerId:pid, teamId:tid, gp:0, pts:0, reb:0, ast:0, stl:0, blk:0, fgm:0, fga:0, tpm:0, tpa:0, ftm:0, fta:0, to:0 };
    var s=agg[pid]; s.gp++; s.pts+=_num(b.pts);
    s.reb+=_num(b.reb)||(_num(b.oreb)+_num(b.dreb));
    s.ast+=_num(b.ast); s.stl+=_num(b.stl); s.blk+=_num(b.blk);
    s.fgm+=_num(b.fgm); s.fga+=_num(b.fga); s.tpm+=_num(b.tpm); s.tpa+=_num(b.tpa);
    s.ftm+=_num(b.ftm); s.fta+=_num(b.fta); s.to+=_num(b.to);
  });
  return agg;
}

function handleGetLeaders(e) {
  var sid = e && e.parameter ? _str(e.parameter.seasonId) : '';
  var cat = e && e.parameter ? _str(e.parameter.cat || e.parameter.category || 'pts') : 'pts';
  var gameRows = _sheetToObjects('Games');
  var seasonGameIds = {};
  gameRows.filter(function(g){return _str(g.seasonId)===sid&&_str(g.status)==='completed';})
    .forEach(function(g){seasonGameIds[_str(g.id)]=true;});
  var playerMap = {}, teamMap = {};
  _sheetToObjects('Players').forEach(function(p){playerMap[_str(p.id)]=p;});
  _sheetToObjects('Teams').forEach(function(t){teamMap[_str(t.id)]=t;});
  var agg = _aggregateBoxBySeasonGames(_sheetToObjects('BoxScores'), seasonGameIds);
  var leaders = Object.keys(agg).map(function(pid) {
    var s=agg[pid], gp=s.gp||1, p=playerMap[pid]||{}, tm=teamMap[s.teamId]||{};
    var fgPct=s.fga>0?_rnd(s.fgm/s.fga*100,1):0;
    var tpPct=s.tpa>0?_rnd(s.tpm/s.tpa*100,1):0;
    var ftPct=s.fta>0?_rnd(s.ftm/s.fta*100,1):0;
    var val;
    if (cat==='pts') val=_rnd(s.pts/gp,1);
    else if (cat==='reb') val=_rnd(s.reb/gp,1);
    else if (cat==='ast') val=_rnd(s.ast/gp,1);
    else if (cat==='stl') val=_rnd(s.stl/gp,1);
    else if (cat==='blk') val=_rnd(s.blk/gp,1);
    else if (cat==='fg_pct') val=fgPct;
    else if (cat==='tp_pct') val=tpPct;
    else if (cat==='ft_pct') val=ftPct;
    else val=_rnd(s.pts/gp,1);
    // Filter zero-attempt shooting stats
    if (cat==='fg_pct'&&s.fga===0) return null;
    if (cat==='tp_pct'&&s.tpa===0) return null;
    if (cat==='ft_pct'&&s.fta===0) return null;
    return { playerId:pid, playerName:_str(p.name||''), teamId:s.teamId,
             teamName:_str(tm.name||''), value:val, gamesPlayed:s.gp };
  }).filter(function(l){return l!==null;});
  leaders.sort(function(a,b){return b.value-a.value;});
  leaders.forEach(function(l,i){l.rank=i+1;});
  return leaders;
}

function handleGetPlayerProfile(e) {
  var pid = e && e.parameter ? _str(e.parameter.playerId) : '';
  if (!pid) return {};
  var playerRows=_sheetToObjects('Players'), teamRows=_sheetToObjects('Teams');
  var gameRows=_sheetToObjects('Games'), boxRows=_sheetToObjects('BoxScores');
  var seasonRows=_sheetToObjects('Seasons');
  var teamMap={}, gameMap={}, seasonMap={};
  teamRows.forEach(function(t){teamMap[_str(t.id)]=t;});
  gameRows.forEach(function(g){gameMap[_str(g.id)]=g;});
  seasonRows.forEach(function(s){seasonMap[_str(s.id)]=s;});
  var player=null;
  for (var i=0;i<playerRows.length;i++){if(_str(playerRows[i].id)===pid){player=playerRows[i];break;}}
  if (!player) return {};
  var team=teamMap[_str(player.teamId)]||{};
  var playerBox=boxRows.filter(function(b){return _str(b.playerId)===pid;});
  var gameLogs=[], seasonStats={};
  playerBox.forEach(function(b) {
    var g=gameMap[_str(b.gameId)]; if(!g||!g.id) return;
    var sid=_str(g.seasonId), isHome=_str(g.homeTeamId)===_str(player.teamId);
    var oppId=isHome?_str(g.awayTeamId):_str(g.homeTeamId), opp=teamMap[oppId]||{};
    var ts=isHome?_num(g.homeScore):_num(g.awayScore), os=isHome?_num(g.awayScore):_num(g.homeScore);
    var reb=_num(b.reb)||(_num(b.oreb)+_num(b.dreb));
    gameLogs.push({ gameId:_str(g.id), date:_str(g.date), opponent:_str(opp.name||oppId),
      teamScore:ts, opponentScore:os, pts:_num(b.pts), reb:reb,
      oreb:_num(b.oreb), dreb:_num(b.dreb), ast:_num(b.ast), stl:_num(b.stl), blk:_num(b.blk),
      fgm:_num(b.fgm), fga:_num(b.fga), tpm:_num(b.tpm), tpa:_num(b.tpa),
      ftm:_num(b.ftm), fta:_num(b.fta), to:_num(b.to), fouls:_num(b.fouls) });
    if (!seasonStats[sid]) seasonStats[sid]={gp:0,pts:0,reb:0,ast:0,stl:0,blk:0,fgm:0,fga:0,tpm:0,tpa:0,ftm:0,fta:0};
    var ss=seasonStats[sid]; ss.gp++; ss.pts+=_num(b.pts); ss.reb+=reb; ss.ast+=_num(b.ast);
    ss.stl+=_num(b.stl); ss.blk+=_num(b.blk); ss.fgm+=_num(b.fgm); ss.fga+=_num(b.fga);
    ss.tpm+=_num(b.tpm); ss.tpa+=_num(b.tpa); ss.ftm+=_num(b.ftm); ss.fta+=_num(b.fta);
  });
  gameLogs.sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});
  var sids=Object.keys(seasonStats).sort(function(a,b){
    var sa=seasonMap[a]||{}, sb=seasonMap[b]||{};
    if(sa.status==='active')return -1; if(sb.status==='active')return 1;
    return (sb.endDate||sb.id||'').localeCompare(sa.endDate||sa.id||'');
  });
  var cur=sids.length>0?seasonStats[sids[0]]:null, avg={};
  if (cur&&cur.gp>0) {
    var gp=cur.gp;
    avg={ gamesPlayed:gp, pts:_rnd(cur.pts/gp,1), reb:_rnd(cur.reb/gp,1), ast:_rnd(cur.ast/gp,1),
          stl:_rnd(cur.stl/gp,1), blk:_rnd(cur.blk/gp,1),
          fgm:_rnd(cur.fgm/gp,1), fga:_rnd(cur.fga/gp,1), tpm:_rnd(cur.tpm/gp,1), tpa:_rnd(cur.tpa/gp,1),
          ftm:_rnd(cur.ftm/gp,1), fta:_rnd(cur.fta/gp,1),
          fgPct:cur.fga>0?_rnd(cur.fgm/cur.fga*100,1):0,
          tpPct:cur.tpa>0?_rnd(cur.tpm/cur.tpa*100,1):0,
          ftPct:cur.fta>0?_rnd(cur.ftm/cur.fta*100,1):0 };
  }
  var seasonHistory=sids.map(function(sid){
    var s=seasonStats[sid], gp=s.gp||1, sea=seasonMap[sid]||{};
    return { seasonId:sid, seasonName:_str(sea.name||sid), gamesPlayed:s.gp,
             pts:_rnd(s.pts/gp,1), reb:_rnd(s.reb/gp,1), ast:_rnd(s.ast/gp,1),
             stl:_rnd(s.stl/gp,1), blk:_rnd(s.blk/gp,1),
             fgPct:s.fga>0?_rnd(s.fgm/s.fga*100,1):0,
             tpPct:s.tpa>0?_rnd(s.tpm/s.tpa*100,1):0,
             ftPct:s.fta>0?_rnd(s.ftm/s.fta*100,1):0 };
  });
  return { info:{ id:pid, name:_str(player.name), number:(player.number!==''&&player.number!=null)?_num(player.number):'',
    teamId:_str(player.teamId), teamName:_str(team.name||''), position:_str(player.position||''),
    photo:_str(player.photo||''), gamesPlayed:gameLogs.length }, seasonAvg:avg, gameLogs:gameLogs, seasonHistory:seasonHistory };
}

function handleGetTeamProfile(e) {
  var tid = e && e.parameter ? _str(e.parameter.teamId) : '';
  if (!tid) return {};
  var teamRows=_sheetToObjects('Teams'), playerRows=_sheetToObjects('Players');
  var gameRows=_sheetToObjects('Games'), boxRows=_sheetToObjects('BoxScores');
  var seasonRows=_sheetToObjects('Seasons');
  var teamMap={}, seasonMap={};
  teamRows.forEach(function(t){teamMap[_str(t.id)]=t;}); seasonRows.forEach(function(s){seasonMap[_str(s.id)]=s;});
  var team=teamMap[tid]; if(!team) return {};
  var teamPlayers=playerRows.filter(function(p){return _str(p.teamId)===tid;});
  var playerMap={}; teamPlayers.forEach(function(p){playerMap[_str(p.id)]=p;});
  // Roster stats
  var pBox={};
  boxRows.forEach(function(b){
    var pid=_str(b.playerId); if(!playerMap[pid]) return;
    if(!pBox[pid]) pBox[pid]={gp:0,pts:0,reb:0,ast:0,stl:0,blk:0,fgm:0,fga:0};
    var s=pBox[pid]; s.gp++; s.pts+=_num(b.pts); s.reb+=_num(b.reb)||(_num(b.oreb)+_num(b.dreb));
    s.ast+=_num(b.ast); s.stl+=_num(b.stl); s.blk+=_num(b.blk); s.fgm+=_num(b.fgm); s.fga+=_num(b.fga);
  });
  var roster=teamPlayers.map(function(p){
    var s=pBox[_str(p.id)]||{gp:0,pts:0,reb:0,ast:0,stl:0,blk:0,fgm:0,fga:0}, gp=s.gp||1;
    return { id:_str(p.id), name:_str(p.name), number:(p.number!==''&&p.number!=null)?_num(p.number):'',
             position:_str(p.position||''), pts:_rnd(s.pts/gp,1), reb:_rnd(s.reb/gp,1),
             ast:_rnd(s.ast/gp,1), stl:_rnd(s.stl/gp,1), blk:_rnd(s.blk/gp,1),
             fgPct:s.fga>0?_rnd(s.fgm/s.fga*100,1):0, gamesPlayed:s.gp };
  }).sort(function(a,b){return (_num(a.number)||999)-(_num(b.number)||999);});
  // Season history + H2H
  var teamGames=gameRows.filter(function(g){return _str(g.homeTeamId)===tid||_str(g.awayTeamId)===tid;});
  var shist={}, h2h={};
  teamGames.forEach(function(g){
    var isHome=_str(g.homeTeamId)===tid, oppId=isHome?_str(g.awayTeamId):_str(g.homeTeamId);
    var opp=teamMap[oppId]||{}, ts=isHome?_num(g.homeScore):_num(g.awayScore), os=isHome?_num(g.awayScore):_num(g.homeScore);
    var sid=_str(g.seasonId);
    if (_str(g.status)==='completed'&&_str(g.type)!=='playoff') {
      if(!shist[sid]) shist[sid]={wins:0,losses:0,draws:0};
      if(ts>os) shist[sid].wins++; else if(os>ts) shist[sid].losses++; else shist[sid].draws++;
    }
    if (_str(g.status)==='completed') {
      if(!h2h[oppId]) h2h[oppId]={teamName:_str(opp.name||oppId),wins:0,losses:0,draws:0,games:[]};
      if(ts>os) h2h[oppId].wins++; else if(os>ts) h2h[oppId].losses++; else h2h[oppId].draws++;
      h2h[oppId].games.push({gameId:_str(g.id),date:_str(g.date),homeScore:_num(g.homeScore),awayScore:_num(g.awayScore),won:ts>os});
    }
  });
  Object.keys(h2h).forEach(function(k){h2h[k].games.sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});});
  var historyArr=Object.keys(shist).map(function(sid){
    var sh=shist[sid], sea=seasonMap[sid]||{};
    return {seasonId:sid,seasonName:_str(sea.name||sid),wins:sh.wins,losses:sh.losses,draws:sh.draws,rank:null};
  }).sort(function(a,b){return (b.seasonId||'').localeCompare(a.seasonId||'');});
  return { info:{id:tid,name:_str(team.name||''),captain:_str(team.captain||''),logo:_str(team.logo||''),
    description:_str(team.description||''),jerseyHome:_str(team.jerseyHome||''),jerseyAway:_str(team.jerseyAway||'')},
    roster:roster, history:historyArr, h2h:h2h };
}

function handleGetPlayoffs(e) {
  var sid = e && e.parameter ? _str(e.parameter.seasonId) : '';
  var teamMap = _buildTeamMap(_sheetToObjects('Teams'));
  var games=_sheetToObjects('Games').filter(function(g){return _str(g.seasonId)===sid&&_str(g.type)==='playoff';});
  if (!games.length) return { rounds:[] };
  var roundMap={};
  games.forEach(function(g){
    var r=_num(g.playoffRound)||1; if(!roundMap[r]) roundMap[r]=[];
    var ht=teamMap[_str(g.homeTeamId)]||{}, at=teamMap[_str(g.awayTeamId)]||{};
    roundMap[r].push({id:_str(g.id),homeTeamId:_str(g.homeTeamId),awayTeamId:_str(g.awayTeamId),
      homeTeamName:_str(g.homeTeamName||ht.name||''),awayTeamName:_str(g.awayTeamName||at.name||''),
      homeScore:(g.homeScore!==''&&g.homeScore!=null)?_num(g.homeScore):null,
      awayScore:(g.awayScore!==''&&g.awayScore!=null)?_num(g.awayScore):null,
      status:_str(g.status||'scheduled'),seed:_str(g.playoffSeed||'')});
  });
  var names=['首輪','準決賽','決賽','總決賽'];
  var rounds=Object.keys(roundMap).sort(function(a,b){return _num(a)-_num(b);}).map(function(r,i){
    return {name:names[_num(r)-1]||('Round '+r),round:_num(r),games:roundMap[r]};
  });
  return { rounds:rounds };
}

function handleGetShotChart(e) {
  var pid=e&&e.parameter?_str(e.parameter.playerId):'';
  var gid=e&&e.parameter?_str(e.parameter.gameId):'';
  var rows=_sheetToObjects('ShotLocations');
  if (pid) rows=rows.filter(function(r){return _str(r.playerId)===pid;});
  if (gid) rows=rows.filter(function(r){return _str(r.gameId)===gid;});
  return rows.map(function(r){
    return {id:_str(r.id),playerId:_str(r.playerId),gameId:_str(r.gameId),
      x:_num(r.x),y:_num(r.y),made:r.made===true||r.made==='true'||r.made==='TRUE'||r.made===1,
      shotType:_str(r.shotType||'')};
  });
}

function handleGetAdvancedStats(e) {
  var pid=e&&e.parameter?_str(e.parameter.playerId):'';
  if (!pid) return {};
  var playerBox=_sheetToObjects('BoxScores').filter(function(b){return _str(b.playerId)===pid;});
  if (!playerBox.length) return {ts_pct:0,usg_pct:0,per:0};
  var t={gp:0,pts:0,fga:0,fta:0,fgm:0,tpm:0,reb:0,ast:0,stl:0,blk:0,to:0,ftm:0};
  playerBox.forEach(function(b){
    t.gp++; t.pts+=_num(b.pts); t.fga+=_num(b.fga); t.fta+=_num(b.fta);
    t.fgm+=_num(b.fgm); t.tpm+=_num(b.tpm); t.reb+=_num(b.reb)||(_num(b.oreb)+_num(b.dreb));
    t.ast+=_num(b.ast); t.stl+=_num(b.stl); t.blk+=_num(b.blk); t.to+=_num(b.to); t.ftm+=_num(b.ftm);
  });
  var tsDen=2*(t.fga+0.44*t.fta), ts_pct=tsDen>0?_rnd(t.pts/tsDen*100,1):0;
  // Team poss for USG
  var gids={}, allBox=_sheetToObjects('BoxScores');
  playerBox.forEach(function(b){gids[_str(b.gameId)]=_str(b.teamId);});
  var tmT={fga:0,fta:0,to:0};
  allBox.forEach(function(b){
    var gid=_str(b.gameId);
    if(gids[gid]&&_str(b.teamId)===gids[gid]){tmT.fga+=_num(b.fga);tmT.fta+=_num(b.fta);tmT.to+=_num(b.to);}
  });
  var pPoss=t.fga+0.44*t.fta+t.to, tmPoss=tmT.fga+0.44*tmT.fta+tmT.to;
  var usg_pct=tmPoss>0?_rnd(pPoss/tmPoss*100,1):0;
  var gp=t.gp||1, missedFG=t.fga-t.fgm, missedFT=t.fta-t.ftm;
  var per=_rnd((t.pts+t.reb+t.ast+t.stl+t.blk-missedFG-0.5*missedFT-t.to)/gp,1);
  return {ts_pct:ts_pct,usg_pct:usg_pct,per:per};
}

function handleGetAchievements(e) {
  var pid=e&&e.parameter?_str(e.parameter.playerId):'';
  var rows=_sheetToObjects('Achievements');
  if (pid) rows=rows.filter(function(r){return _str(r.playerId)===pid;});
  return rows.map(function(r){
    return {id:_str(r.id),playerId:_str(r.playerId),gameId:_str(r.gameId||''),
      type:_str(r.type),date:_str(r.date),description:_str(r.description||'')};
  }).filter(function(a){return a.playerId;});
}

function handleGetArchive(e) {
  var sid=e&&e.parameter?_str(e.parameter.seasonId):'';
  if (!sid) return {};
  var fakeE={parameter:{seasonId:sid}};
  var standings=handleGetStandings(fakeE);
  var playoffs=handleGetPlayoffs(fakeE);
  var seasonRows=_sheetToObjects('Seasons');
  var season=null; for(var i=0;i<seasonRows.length;i++){if(_str(seasonRows[i].id)===sid){season=seasonRows[i];break;}}
  var standingsArr=standings.map(function(t){
    return {team:t.teamName,wins:t.wins,losses:t.losses,pct:t.played>0?_rnd(t.wins/t.played,3):0};
  });
  var awards={};
  if(standings.length>0) awards.champion=standings[0].teamName;
  var ptsL=handleGetLeaders({parameter:{seasonId:sid,cat:'pts'}});
  if(ptsL.length>0) awards.scoringLeader=(ptsL[0].playerName||'')+' ('+ptsL[0].value+')';
  var rebL=handleGetLeaders({parameter:{seasonId:sid,cat:'reb'}});
  if(rebL.length>0) awards.reboundLeader=(rebL[0].playerName||'')+' ('+rebL[0].value+')';
  var astL=handleGetLeaders({parameter:{seasonId:sid,cat:'ast'}});
  if(astL.length>0) awards.assistLeader=(astL[0].playerName||'')+' ('+astL[0].value+')';
  if(season){
    if(season.champion) awards.champion=_str(season.champion);
    if(season.playoffMvp) awards.playoffMvp=_str(season.playoffMvp);
    if(season.bestRookie) awards.bestRookie=_str(season.bestRookie);
  }
  return {seasonId:sid,seasonName:season?_str(season.name):'',standings:standingsArr,playoffs:playoffs,awards:awards,
    summary:season&&season.summary?_str(season.summary):'',photos:season&&season.photos?_str(season.photos):''};
}

function handleGetAnnouncements(e) {
  var rows=_sheetToObjects('Announcements').map(function(r){
    return {id:_str(r.id),date:_str(r.date),title:_str(r.title),content:_str(r.content||''),
      pinned:r.pinned===true||r.pinned==='true'||r.pinned==='TRUE',
      hidden:r.hidden===true||r.hidden==='true'||r.hidden==='TRUE',
      photo:_str(r.photo||'')};
  }).filter(function(a){return a.title;});
  rows.sort(function(a,b){ if(a.pinned&&!b.pinned)return -1; if(!a.pinned&&b.pinned)return 1; return (b.date||'').localeCompare(a.date||''); });
  return rows;
}

function handleGetRecentAchievements(e) {
  var sid=e&&e.parameter?_str(e.parameter.seasonId):'';
  var playerMap={};
  _sheetToObjects('Players').forEach(function(p){playerMap[_str(p.id)]=p;});
  var rows=_sheetToObjects('Achievements').map(function(r){
    var p=playerMap[_str(r.playerId)]||{};
    return {id:_str(r.id),playerId:_str(r.playerId),playerName:_str(p.name||''),
      gameId:_str(r.gameId||''),type:_str(r.type),date:_str(r.date),description:_str(r.description||'')};
  }).filter(function(a){return a.playerId;});
  rows.sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});
  return rows.slice(0,10);
}

// ============================================================
// POST 處理器
// ============================================================
function handleSubmitBoxScore(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  if (!body.entries || !Array.isArray(body.entries) || body.entries.length === 0) return createErrorResponse(400, '缺少必要參數：entries');
  var validation = validateBoxScore(body.entries);
  if (!validation.valid) return createErrorResponse(400, '數據驗證失敗：' + JSON.stringify(validation.errors));

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('BoxScores');
    if (!sheet) return createErrorResponse(500, '找不到 BoxScores 工作表');

    // --- 讀取 BoxScores 表格的欄位標題，建立 colMap ---
    var bHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var bColMap = {};
    bHeaders.forEach(function (h, i) { if (h) bColMap[String(h).trim()] = i; });
    // gameId 欄位位置（fallback to index 1）
    var gameIdColIdx = bColMap['gameId'] !== undefined ? bColMap['gameId'] : 1;

    // --- 冪等：刪除此 gameId 的現有記錄 ---
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
      var rowsToDelete = [];
      for (var i = data.length - 1; i >= 0; i--) {
        if (String(data[i][gameIdColIdx]) === String(body.gameId)) {
          rowsToDelete.push(i + 2); // 1-indexed, +1 for header
        }
      }
      for (var d = 0; d < rowsToDelete.length; d++) {
        sheet.deleteRow(rowsToDelete[d]);
      }
    }

    // --- 寫入新記錄（依照標題欄位寫入，不依賴固定位置）---
    var now = new Date().toISOString();
    var numCols = bHeaders.length;
    var rows = body.entries.map(function (entry) {
      var reb = (entry.oreb || 0) + (entry.dreb || 0);
      var row = new Array(numCols).fill('');
      function setCol(field, val) { if (bColMap[field] !== undefined) row[bColMap[field]] = val; }
      setCol('id',        Utilities.getUuid());
      setCol('gameId',    body.gameId);
      setCol('playerId',  entry.playerId);
      setCol('teamId',    entry.teamId);
      setCol('pts',       entry.pts   || 0);
      setCol('reb',       reb);
      setCol('ast',       entry.ast   || 0);
      setCol('stl',       entry.stl   || 0);
      setCol('blk',       entry.blk   || 0);
      setCol('fgm',       entry.fgm   || 0);
      setCol('fga',       entry.fga   || 0);
      setCol('tpm',       entry.tpm   || 0);
      setCol('tpa',       entry.tpa   || 0);
      setCol('ftm',       entry.ftm   || 0);
      setCol('fta',       entry.fta   || 0);
      setCol('to',        entry.to    || 0);
      setCol('fouls',     entry.fouls || 0);
      setCol('oreb',      entry.oreb  || 0);
      setCol('dreb',      entry.dreb  || 0);
      setCol('updatedAt', now);
      return row;
    });
    if (rows.length > 0) {
      var insertRow = sheet.getLastRow() + 1;
      sheet.getRange(insertRow, 1, rows.length, numCols).setValues(rows);
    }

    // --- 更新 Games 工作表：比分、狀態、MVP ---
    var gamesSheet = ss.getSheetByName('Games');
    if (gamesSheet) {
      var gLastRow = gamesSheet.getLastRow();
      if (gLastRow > 1) {
        // Build header map once
        var gHeaders = gamesSheet.getRange(1, 1, 1, gamesSheet.getLastColumn()).getValues()[0];
        var gColMap = {};
        gHeaders.forEach(function (h, idx) { gColMap[h] = idx + 1; });

        var gData = gamesSheet.getRange(2, 1, gLastRow - 1, gamesSheet.getLastColumn()).getValues();
        for (var g = 0; g < gData.length; g++) {
          if (String(gData[g][0]) === String(body.gameId)) {
            var gRowNum = g + 2;
            // Use header-based indices (not hardcoded) to read homeTeamId / awayTeamId
            var homeTeamIdIdx = gColMap['homeTeamId'] ? gColMap['homeTeamId'] - 1 : 4;
            var awayTeamIdIdx = gColMap['awayTeamId'] ? gColMap['awayTeamId'] - 1 : 5;
            var homeTeamId = String(gData[g][homeTeamIdIdx]);
            var awayTeamId = String(gData[g][awayTeamIdIdx]);
            // Compute totals from entries
            var homeScore = 0; var awayScore = 0;
            body.entries.forEach(function (en) {
              if (String(en.teamId) === homeTeamId) homeScore += (en.pts || 0);
              else if (String(en.teamId) === awayTeamId) awayScore += (en.pts || 0);
            });
            if (gColMap['homeScore']) gamesSheet.getRange(gRowNum, gColMap['homeScore']).setValue(homeScore);
            if (gColMap['awayScore']) gamesSheet.getRange(gRowNum, gColMap['awayScore']).setValue(awayScore);
            if (gColMap['status']) gamesSheet.getRange(gRowNum, gColMap['status']).setValue('completed');
            if (gColMap['mvpPlayerId'] && body.mvpPlayerId) gamesSheet.getRange(gRowNum, gColMap['mvpPlayerId']).setValue(body.mvpPlayerId);
            // Quarter scores
            var qFields = ['homeQ1','homeQ2','homeQ3','homeQ4','awayQ1','awayQ2','awayQ3','awayQ4'];
            qFields.forEach(function (qf) {
              if (gColMap[qf] && body[qf] !== undefined) gamesSheet.getRange(gRowNum, gColMap[qf]).setValue(body[qf] || 0);
            });
            break;
          }
        }
      }
    }

    return createSuccessResponse({ message: 'Box Score 提交成功', gameId: body.gameId, insertedCount: rows.length }, false);
  } catch (err) {
    return createErrorResponse(500, 'Box Score 寫入失敗：' + err.message);
  }
}

function handleUpdateBoxScore(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  if (!body.playerId) return createErrorResponse(400, '缺少必要參數：playerId');
  if (!body.field) return createErrorResponse(400, '缺少必要參數：field');
  if (body.value === undefined || body.value === null) return createErrorResponse(400, '缺少必要參數：value');
  var editableFields = ['pts', 'reb', 'ast', 'stl', 'blk', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'to', 'fouls'];
  if (editableFields.indexOf(body.field) === -1) return createErrorResponse(400, '無效的欄位名稱：' + body.field);
  if (typeof body.value !== 'number' || !Number.isInteger(body.value) || body.value < 0) return createErrorResponse(400, body.field + ' 必須為非負整數');
  return createSuccessResponse({ message: 'Box Score 修改成功', gameId: body.gameId, field: body.field, newValue: body.value }, false);
}

function _gameColMap(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var m = {};
  headers.forEach(function(h, i) { if (h) m[String(h).trim()] = i; });
  return { headers: headers, map: m };
}

function _findGameRow(sheet, colMap, gameId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var idIdx = colMap['id'] !== undefined ? colMap['id'] : 0;
  var data = sheet.getRange(2, 1, lastRow - 1, Object.keys(colMap).length || sheet.getLastColumn()).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][idIdx]) === String(gameId)) return i + 2;
  }
  return -1;
}

function handleCreateGame(e, body) {
  if (!body.seasonId) return createErrorResponse(400, '缺少必要參數：seasonId');
  if (!body.date) return createErrorResponse(400, '缺少必要參數：date');
  if (!body.homeTeamId) return createErrorResponse(400, '缺少必要參數：homeTeamId');
  if (!body.awayTeamId) return createErrorResponse(400, '缺少必要參數：awayTeamId');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Games');
    if (!sheet) return createErrorResponse(500, '找不到 Games 工作表');
    var cm = _gameColMap(sheet);
    var gameId = Utilities.getUuid();
    var row = new Array(cm.headers.length).fill('');
    function s(f, v) { if (cm.map[f] !== undefined) row[cm.map[f]] = v; }
    s('id', gameId); s('seasonId', body.seasonId);
    s('date', body.date); s('time', body.time || '');
    s('venue', body.venue || '');
    s('homeTeamId', body.homeTeamId); s('awayTeamId', body.awayTeamId);
    s('type', body.type || 'regular'); s('status', 'scheduled');
    s('updatedAt', new Date().toISOString());
    sheet.appendRow(row);
    return createSuccessResponse({ message: '比賽建立成功', gameId: gameId }, false);
  } catch (err) {
    return createErrorResponse(500, '比賽建立失敗：' + err.message);
  }
}

function handleUpdateGame(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Games');
    if (!sheet) return createErrorResponse(500, '找不到 Games 工作表');
    var cm = _gameColMap(sheet);
    var rowNum = _findGameRow(sheet, cm.map, body.gameId);
    if (rowNum === -1) return createErrorResponse(404, '找不到比賽：' + body.gameId);
    ['date','time','venue','homeTeamId','awayTeamId','type'].forEach(function(f) {
      if (body[f] !== undefined && cm.map[f] !== undefined)
        sheet.getRange(rowNum, cm.map[f] + 1).setValue(body[f]);
    });
    if (cm.map['updatedAt'] !== undefined) sheet.getRange(rowNum, cm.map['updatedAt'] + 1).setValue(new Date().toISOString());
    return createSuccessResponse({ message: '比賽更新成功', gameId: body.gameId }, false);
  } catch (err) {
    return createErrorResponse(500, '比賽更新失敗：' + err.message);
  }
}

function handleCancelGame(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Games');
    if (!sheet) return createErrorResponse(500, '找不到 Games 工作表');
    var cm = _gameColMap(sheet);
    var rowNum = _findGameRow(sheet, cm.map, body.gameId);
    if (rowNum === -1) return createErrorResponse(404, '找不到比賽：' + body.gameId);
    if (cm.map['status'] !== undefined) sheet.getRange(rowNum, cm.map['status'] + 1).setValue('cancelled');
    if (cm.map['updatedAt'] !== undefined) sheet.getRange(rowNum, cm.map['updatedAt'] + 1).setValue(new Date().toISOString());
    return createSuccessResponse({ message: '比賽已取消', gameId: body.gameId }, false);
  } catch (err) {
    return createErrorResponse(500, '比賽取消失敗：' + err.message);
  }
}

function handleSubmitShotLocation(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  if (!body.playerId) return createErrorResponse(400, '缺少必要參數：playerId');
  if (body.x === undefined || body.x === null) return createErrorResponse(400, '缺少必要參數：x');
  if (body.y === undefined || body.y === null) return createErrorResponse(400, '缺少必要參數：y');
  if (body.made === undefined || body.made === null) return createErrorResponse(400, '缺少必要參數：made');
  if (typeof body.x !== 'number' || body.x < 0 || body.x > 100) return createErrorResponse(400, 'x 座標必須為 0-100 之間的數值');
  if (typeof body.y !== 'number' || body.y < 0 || body.y > 100) return createErrorResponse(400, 'y 座標必須為 0-100 之間的數值');
  if (typeof body.made !== 'boolean') return createErrorResponse(400, 'made 必須為布林值（true/false）');
  return createSuccessResponse({ message: '投籃位置記錄成功', shotId: 'new-shot-id' }, false);
}

function handleGeneratePlayoffs(e, body) {
  if (!body.seasonId) return createErrorResponse(400, '缺少必要參數：seasonId');
  return createSuccessResponse({ message: '季後賽對陣表生成成功', seasonId: body.seasonId }, false);
}

function handleArchiveSeason(e, body) {
  if (!body.seasonId) return createErrorResponse(400, '缺少必要參數：seasonId');
  return createSuccessResponse({ message: '賽季封存成功', seasonId: body.seasonId }, false);
}

function handleCreateAnnouncement(e, body) {
  if (!body.title) return createErrorResponse(400, '缺少必要參數：title');
  if (!body.content) return createErrorResponse(400, '缺少必要參數：content');
  return createSuccessResponse({ message: '公告發佈成功', announcementId: 'new-ann-id' }, false);
}

function handleUpdateAnnouncement(e, body) {
  if (!body.announcementId) return createErrorResponse(400, '缺少必要參數：announcementId');
  return createSuccessResponse({ message: '公告更新成功', announcementId: body.announcementId }, false);
}

function handleDeleteAnnouncement(e, body) {
  if (!body.announcementId) return createErrorResponse(400, '缺少必要參數：announcementId');
  return createSuccessResponse({ message: '公告已刪除', announcementId: body.announcementId }, false);
}

function handleDeleteGame(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Games');
    if (!sheet) return createErrorResponse(500, '找不到 Games 工作表');
    var cm = _gameColMap(sheet);
    var rowNum = _findGameRow(sheet, cm.map, body.gameId);
    if (rowNum === -1) return createErrorResponse(404, '找不到比賽：' + body.gameId);
    sheet.deleteRow(rowNum);
    return createSuccessResponse({ message: '比賽已刪除', gameId: body.gameId }, false);
  } catch (err) {
    return createErrorResponse(500, '比賽刪除失敗：' + err.message);
  }
}

function handleCreateTeam(e, body) {
  if (!body.seasonId) return createErrorResponse(400, '缺少必要參數：seasonId');
  if (!body.name) return createErrorResponse(400, '缺少必要參數：name');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Teams');
    if (!sheet) return createErrorResponse(500, '找不到 Teams 工作表');
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i; });
    var newId = Utilities.getUuid();
    var row = new Array(headers.length).fill('');
    var set = function(f, v) { if (colMap[f] !== undefined) row[colMap[f]] = v || ''; };
    set('id', newId); set('seasonId', body.seasonId); set('name', body.name);
    set('captain', body.captain); set('captainWhatsApp', body.captainWhatsApp);
    set('whatsapp', body.captainWhatsApp);
    set('logo', body.logo); set('description', body.description);
    set('jerseyHome', body.jerseyHome); set('jerseyAway', body.jerseyAway);
    set('teamToken', body.teamToken || Utilities.getUuid());
    sheet.appendRow(row);
    return createSuccessResponse({ message: '球隊建立成功', teamId: newId }, false);
  } catch(err) { return createErrorResponse(500, '球隊建立失敗：' + err.message); }
}

function handleUpdateTeam(e, body) {
  if (!body.teamId) return createErrorResponse(400, '缺少必要參數：teamId');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Teams');
    if (!sheet) return createErrorResponse(500, '找不到 Teams 工作表');
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return createErrorResponse(404, '找不到球隊');
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i + 1; }); // 1-indexed
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var rowNum = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]) === String(body.teamId)) { rowNum = i + 2; break; }
    }
    if (rowNum < 0) return createErrorResponse(404, '找不到球隊 ID：' + body.teamId);
    var fields = ['name','captain','captainWhatsApp','whatsapp','logo','description','jerseyHome','jerseyAway','teamToken'];
    fields.forEach(function(f) {
      if (body[f] !== undefined && colMap[f]) {
        sheet.getRange(rowNum, colMap[f]).setValue(body[f]);
      }
    });
    // Sync whatsapp = captainWhatsApp
    if (body.captainWhatsApp !== undefined && colMap['whatsapp']) {
      sheet.getRange(rowNum, colMap['whatsapp']).setValue(body.captainWhatsApp);
    }
    return createSuccessResponse({ message: '球隊更新成功', teamId: body.teamId }, false);
  } catch(err) { return createErrorResponse(500, '球隊更新失敗：' + err.message); }
}

function handleDeleteTeam(e, body) {
  if (!body.teamId) return createErrorResponse(400, '缺少必要參數：teamId');
  return createSuccessResponse({ message: '球隊已刪除', teamId: body.teamId }, false);
}

// --- Public (token-authenticated) team management ---
function _getTeamByToken(token) {
  var rows = _sheetToObjects('Teams');
  for (var i = 0; i < rows.length; i++) {
    if (_str(rows[i].teamToken) === token) return rows[i];
  }
  return null;
}

function handlePublicUpdateTeam(e, body) {
  if (!body.teamToken) return createErrorResponse(400, '缺少必要參數：teamToken');
  var team = _getTeamByToken(_str(body.teamToken));
  if (!team) return createErrorResponse(403, '無效的球隊 token');
  body.teamId = _str(team.id);
  return handleUpdateTeam(e, body);
}

function handlePublicCreatePlayer(e, body) {
  if (!body.teamToken) return createErrorResponse(400, '缺少必要參數：teamToken');
  var team = _getTeamByToken(_str(body.teamToken));
  if (!team) return createErrorResponse(403, '無效的球隊 token');
  if (!body.name) return createErrorResponse(400, '缺少必要參數：name');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Players');
    if (!sheet) return createErrorResponse(500, '找不到 Players 工作表');
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i; });
    var newId = Utilities.getUuid();
    var row = new Array(headers.length).fill('');
    var set = function(f, v) { if (colMap[f] !== undefined) row[colMap[f]] = v || ''; };
    set('id', newId); set('teamId', _str(team.id)); set('name', body.name);
    set('number', body.number !== undefined ? body.number : '');
    set('position', body.position); set('photo', body.photo);
    sheet.appendRow(row);
    return createSuccessResponse({ message: '球員新增成功', playerId: newId }, false);
  } catch(err) { return createErrorResponse(500, '球員新增失敗：' + err.message); }
}

function handlePublicUpdatePlayer(e, body) {
  if (!body.teamToken) return createErrorResponse(400, '缺少必要參數：teamToken');
  var team = _getTeamByToken(_str(body.teamToken));
  if (!team) return createErrorResponse(403, '無效的球隊 token');
  if (!body.playerId) return createErrorResponse(400, '缺少必要參數：playerId');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Players');
    if (!sheet) return createErrorResponse(500, '找不到 Players 工作表');
    var lastRow = sheet.getLastRow();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i + 1; });
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    var rowNum = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]) === String(body.playerId)) { rowNum = i + 2; break; }
    }
    if (rowNum < 0) return createErrorResponse(404, '找不到球員');
    // Verify player belongs to this team
    var tidIdx = (colMap['teamId'] || 2) - 1;
    if (String(data[rowNum - 2][tidIdx]) !== String(team.id)) return createErrorResponse(403, '此球員不屬於您的球隊');
    ['name','number','position','photo'].forEach(function(f) {
      if (body[f] !== undefined && colMap[f]) sheet.getRange(rowNum, colMap[f]).setValue(body[f]);
    });
    return createSuccessResponse({ message: '球員更新成功', playerId: body.playerId }, false);
  } catch(err) { return createErrorResponse(500, '球員更新失敗：' + err.message); }
}

function handlePublicDeletePlayer(e, body) {
  if (!body.teamToken) return createErrorResponse(400, '缺少必要參數：teamToken');
  var team = _getTeamByToken(_str(body.teamToken));
  if (!team) return createErrorResponse(403, '無效的球隊 token');
  if (!body.playerId) return createErrorResponse(400, '缺少必要參數：playerId');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Players');
    if (!sheet) return createErrorResponse(500, '找不到 Players 工作表');
    var lastRow = sheet.getLastRow();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var colMap = {};
    headers.forEach(function(h, i) { colMap[h] = i; }); // 0-indexed for array
    var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
    for (var i = data.length - 1; i >= 0; i--) {
      if (String(data[i][0]) === String(body.playerId) && String(data[i][(colMap['teamId'] || 1)]) === String(team.id)) {
        sheet.deleteRow(i + 2);
        return createSuccessResponse({ message: '球員已刪除', playerId: body.playerId }, false);
      }
    }
    return createErrorResponse(404, '找不到球員或無權限刪除');
  } catch(err) { return createErrorResponse(500, '球員刪除失敗：' + err.message); }
}

// ============================================================
// Box Score 驗證
// ============================================================
function validateBoxScore(entries) {
  var errors = [];
  var statFields = ['pts', 'reb', 'ast', 'stl', 'blk', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'to', 'fouls'];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry.playerId) { errors.push('第 ' + (i + 1) + ' 筆缺少 playerId'); continue; }
    if (!entry.teamId) { errors.push('第 ' + (i + 1) + ' 筆缺少 teamId'); continue; }
    for (var j = 0; j < statFields.length; j++) {
      var field = statFields[j];
      if (entry[field] !== undefined && entry[field] !== null) {
        if (typeof entry[field] !== 'number' || !Number.isInteger(entry[field]) || entry[field] < 0) {
          errors.push(entry.playerId + ' 的 ' + field + ' 必須為非負整數');
        }
      }
    }
    if (entry.fgm !== undefined && entry.fga !== undefined && entry.fgm > entry.fga) {
      errors.push(entry.playerId + ': FGM 不能大於 FGA');
    }
    if (entry.tpm !== undefined && entry.tpa !== undefined && entry.tpm > entry.tpa) {
      errors.push(entry.playerId + ': 3PM 不能大於 3PA');
    }
    if (entry.ftm !== undefined && entry.fta !== undefined && entry.ftm > entry.fta) {
      errors.push(entry.playerId + ': FTM 不能大於 FTA');
    }
  }
  return { valid: errors.length === 0, errors: errors };
}

// ============================================================
// doGet — 公開 API
// ============================================================
function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : null;
    if (!action) return createErrorResponse(400, '缺少必要參數：action');
    if (VALID_GET_ACTIONS.indexOf(action) === -1) return createErrorResponse(400, '無效的請求動作：' + action);

    // boxscore and games are write-through — skip server cache to always return fresh data
    var NO_CACHE_ACTIONS = ['boxscore', 'games', 'standings', 'schedule'];
    var skipCache = NO_CACHE_ACTIONS.indexOf(action) !== -1;
    var cacheKey = buildCacheKey(action, e.parameter);
    if (!skipCache) {
      var cached = getCachedResponse(cacheKey);
      if (cached !== null) return createSuccessResponse(cached, true);
    }

    var data;
    switch (action) {
      case 'seasons':             data = handleGetSeasons(e);             break;
      case 'teams':               data = handleGetTeams(e);               break;
      case 'players':             data = handleGetPlayers(e);             break;
      case 'games':               data = handleGetGames(e);               break;
      case 'boxscore':            data = handleGetBoxScore(e);            break;
      case 'standings':           data = handleGetStandings(e);           break;
      case 'leaders':             data = handleGetLeaders(e);             break;
      case 'playerProfile':       data = handleGetPlayerProfile(e);       break;
      case 'teamProfile':         data = handleGetTeamProfile(e);         break;
      case 'schedule':            data = handleGetSchedule(e);            break;
      case 'playoffs':            data = handleGetPlayoffs(e);            break;
      case 'shotchart':           data = handleGetShotChart(e);           break;
      case 'advancedStats':       data = handleGetAdvancedStats(e);       break;
      case 'achievements':        data = handleGetAchievements(e);        break;
      case 'archive':             data = handleGetArchive(e);             break;
      case 'announcements':       data = handleGetAnnouncements(e);       break;
      case 'recentAchievements':  data = handleGetRecentAchievements(e);  break;
      case 'teamByToken':         return handleGetTeamByToken(e);         // returns full response
      default: return createErrorResponse(400, '無效的請求動作：' + action);
    }
    if (!skipCache && data !== undefined && data !== null) setCachedResponse(cacheKey, data, CACHE_TTL);
    return createSuccessResponse(data, false);
  } catch (err) {
    Logger.log('[doGet] Error: ' + err.message + ' | action: ' + (e && e.parameter ? e.parameter.action : '?'));
    return createErrorResponse(500, '伺服器內部錯誤，請稍後重試');
  }
}

// ============================================================
// doPost — 需授權 API
// ============================================================
var PUBLIC_POST_ACTIONS = ['publicUpdateTeam', 'publicCreatePlayer', 'publicUpdatePlayer', 'publicDeletePlayer'];

function doPost(e) {
  try {
    var body;
    try { body = JSON.parse(e.postData.contents); } catch (err) {
      return createErrorResponse(400, '參數格式錯誤：請求體必須為有效的 JSON');
    }
    var action = body.action;
    if (!action) return createErrorResponse(400, '缺少必要參數：action');
    if (VALID_POST_ACTIONS.indexOf(action) === -1) return createErrorResponse(400, '無效的請求動作：' + action);
    // Public token-authenticated actions skip API key check
    if (PUBLIC_POST_ACTIONS.indexOf(action) === -1) {
      if (!validateApiKey(e)) return createErrorResponse(401, '未授權：缺少或無效的 API Key');
    }

    var result;
    switch (action) {
      case 'submitBoxScore': result = handleSubmitBoxScore(e, body); break;
      case 'updateBoxScore': result = handleUpdateBoxScore(e, body); break;
      case 'createGame': result = handleCreateGame(e, body); break;
      case 'updateGame': result = handleUpdateGame(e, body); break;
      case 'cancelGame': result = handleCancelGame(e, body); break;
      case 'deleteGame': result = handleDeleteGame(e, body); break;
      case 'submitShotLocation': result = handleSubmitShotLocation(e, body); break;
      case 'generatePlayoffs': result = handleGeneratePlayoffs(e, body); break;
      case 'archiveSeason': result = handleArchiveSeason(e, body); break;
      case 'createAnnouncement': result = handleCreateAnnouncement(e, body); break;
      case 'updateAnnouncement': result = handleUpdateAnnouncement(e, body); break;
      case 'deleteAnnouncement': result = handleDeleteAnnouncement(e, body); break;
      case 'createTeam': result = handleCreateTeam(e, body); break;
      case 'updateTeam': result = handleUpdateTeam(e, body); break;
      case 'deleteTeam': result = handleDeleteTeam(e, body); break;
      case 'publicUpdateTeam':   result = handlePublicUpdateTeam(e, body);   break;
      case 'publicCreatePlayer': result = handlePublicCreatePlayer(e, body); break;
      case 'publicUpdatePlayer': result = handlePublicUpdatePlayer(e, body); break;
      case 'publicDeletePlayer': result = handlePublicDeletePlayer(e, body); break;
      default: return createErrorResponse(400, '無效的請求動作：' + action);
    }

    // POST 成功後清除相關快取
    try {
      var responseBody = JSON.parse(result.getContent());
      if (responseBody.status === 'success') clearRelatedCache(action, body);
    } catch (cacheErr) { /* ignore */ }

    return result;
  } catch (err) {
    return createErrorResponse(500, '伺服器內部錯誤，請稍後重試');
  }
}
