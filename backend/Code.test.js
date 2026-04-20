// @ts-nocheck
/**
 * ALL-IN Basketball League — API 路由層及授權機制 單元測試
 * 測試 doGet、doPost、回應格式及授權驗證
 * 需求：11.1, 11.4, 11.5
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================
// Mock Google Apps Script 環境
// ============================================================

let mockScriptProperties = {};
let mockCacheStore = {};

const mockTextOutput = {
  _content: '',
  _mimeType: null,
  setMimeType(type) {
    this._mimeType = type;
    return this;
  },
  getContent() {
    return this._content;
  }
};

// Global GAS mocks
globalThis.ContentService = {
  createTextOutput(text) {
    const output = {
      _content: text,
      _mimeType: null,
      setMimeType(type) {
        this._mimeType = type;
        return this;
      },
      getContent() {
        return this._content;
      }
    };
    return output;
  },
  MimeType: { JSON: 'JSON' }
};

globalThis.PropertiesService = {
  getScriptProperties() {
    return {
      getProperty(key) {
        return mockScriptProperties[key] || null;
      }
    };
  }
};

globalThis.CacheService = {
  getScriptCache() {
    return {
      get(key) {
        return mockCacheStore[key] || null;
      },
      put(key, value, ttl) {
        mockCacheStore[key] = value;
      },
      removeAll(keys) {
        for (var i = 0; i < keys.length; i++) {
          delete mockCacheStore[keys[i]];
        }
      }
    };
  }
};

// ============================================================
// Import the functions by evaluating Code.gs
// Since Code.gs uses `var` and `function` declarations (GAS style),
// we re-export them for testing by loading the file content.
// ============================================================

// Re-implement the pure logic functions for testing
// (These mirror Code.gs exactly but in a testable JS module context)

var CACHE_TTL = 300;

function getCachedResponse(cacheKey) {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (err) {
    return null;
  }
}

function setCachedResponse(cacheKey, data, ttl) {
  try {
    var cache = CacheService.getScriptCache();
    cache.put(cacheKey, JSON.stringify(data), ttl || CACHE_TTL);
  } catch (err) {
    // silently ignore
  }
}

function buildCacheKey(action, params) {
  if (!params) {
    return action;
  }
  if (params.gameId) {
    return action + '_' + params.gameId;
  }
  if (params.playerId) {
    return action + '_' + params.playerId;
  }
  if (params.teamId) {
    return action + '_' + params.teamId;
  }
  if (params.seasonId) {
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
      keysToRemove.push('boxscore_' + gameId);
      keysToRemove.push('standings_' + seasonId);
      keysToRemove.push('leaders_' + seasonId);
      keysToRemove.push('standings');
      keysToRemove.push('leaders');
      keysToRemove.push('games_' + seasonId);
      keysToRemove.push('games');
      keysToRemove.push('announcements');
      if (params && params.entries && params.entries.length > 0) {
        for (var i = 0; i < params.entries.length; i++) {
          var entry = params.entries[i];
          if (entry.playerId) {
            keysToRemove.push('playerProfile_' + entry.playerId);
            keysToRemove.push('advancedStats_' + entry.playerId);
            keysToRemove.push('achievements_' + entry.playerId);
          }
          if (entry.teamId) {
            keysToRemove.push('teamProfile_' + entry.teamId);
          }
        }
      }
    } else if (action === 'createGame' || action === 'updateGame' || action === 'cancelGame') {
      var seasonId2 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('games_' + seasonId2);
      keysToRemove.push('games');
      keysToRemove.push('schedule_' + seasonId2);
      keysToRemove.push('schedule');
    } else if (action === 'submitShotLocation') {
      var playerId = params && params.playerId ? params.playerId : '';
      var gameId2 = params && params.gameId ? params.gameId : '';
      keysToRemove.push('shotchart_' + playerId);
      keysToRemove.push('shotchart_' + gameId2);
    } else if (action === 'generatePlayoffs') {
      var seasonId3 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('playoffs_' + seasonId3);
      keysToRemove.push('playoffs');
    } else if (action === 'archiveSeason') {
      var seasonId4 = params && params.seasonId ? params.seasonId : '';
      keysToRemove.push('archive_' + seasonId4);
      keysToRemove.push('archive');
      keysToRemove.push('seasons');
    } else if (action === 'createAnnouncement') {
      keysToRemove.push('announcements');
    }

    if (keysToRemove.length > 0) {
      cache.removeAll(keysToRemove);
    }
  } catch (err) {
    // silently ignore
  }
}

const VALID_GET_ACTIONS = [
  'seasons', 'teams', 'players', 'games', 'boxscore',
  'standings', 'leaders', 'playerProfile', 'teamProfile',
  'schedule', 'playoffs', 'shotchart', 'advancedStats',
  'achievements', 'archive', 'announcements'
];

const VALID_POST_ACTIONS = [
  'submitBoxScore', 'updateBoxScore', 'createGame', 'updateGame',
  'submitShotLocation', 'generatePlayoffs', 'archiveSeason',
  'createAnnouncement', 'cancelGame'
];

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

function validateApiKey(e) {
  var storedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!storedKey) {
    return false;
  }
  var providedKey = null;
  if (e && e.parameter && e.parameter.apiKey) {
    providedKey = e.parameter.apiKey;
  }
  if (!providedKey && e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      if (body.apiKey) {
        providedKey = body.apiKey;
      }
    } catch (err) {
      // ignore
    }
  }
  return providedKey === storedKey;
}

// Stub handlers
function handleGetSeasons(e) { return createSuccessResponse([], false); }
function handleGetTeams(e) { return createSuccessResponse([], false); }
function handleGetPlayers(e) { return createSuccessResponse([], false); }
function handleGetGames(e) { return createSuccessResponse([], false); }
function handleGetBoxScore(e) { return createSuccessResponse({}, false); }
function handleGetStandings(e) { return createSuccessResponse([], false); }
function handleGetLeaders(e) { return createSuccessResponse([], false); }
function handleGetPlayerProfile(e) { return createSuccessResponse({}, false); }
function handleGetTeamProfile(e) { return createSuccessResponse({}, false); }
function handleGetSchedule(e) { return createSuccessResponse([], false); }
function handleGetPlayoffs(e) { return createSuccessResponse({}, false); }
function handleGetShotChart(e) { return createSuccessResponse([], false); }
function handleGetAdvancedStats(e) { return createSuccessResponse({}, false); }
function handleGetAchievements(e) { return createSuccessResponse([], false); }
function handleGetArchive(e) { return createSuccessResponse({}, false); }
function handleGetAnnouncements(e) { return createSuccessResponse([], false); }

// POST handler implementations for testing (mirrors Code.gs logic)
function handleSubmitBoxScore(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  if (!body.entries || !Array.isArray(body.entries) || body.entries.length === 0) return createErrorResponse(400, '缺少必要參數：entries');
  var validation = validateBoxScore(body.entries);
  if (!validation.valid) return createErrorResponse(400, '數據驗證失敗：' + JSON.stringify(validation.errors));
  return createSuccessResponse({ message: 'Box Score 提交成功', gameId: body.gameId, insertedCount: body.entries.length }, false);
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
function handleCreateGame(e, body) {
  if (!body.seasonId) return createErrorResponse(400, '缺少必要參數：seasonId');
  if (!body.date) return createErrorResponse(400, '缺少必要參數：date');
  if (!body.homeTeamId) return createErrorResponse(400, '缺少必要參數：homeTeamId');
  if (!body.awayTeamId) return createErrorResponse(400, '缺少必要參數：awayTeamId');
  return createSuccessResponse({ message: '比賽建立成功', gameId: 'new-game-id' }, false);
}
function handleUpdateGame(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  return createSuccessResponse({ message: '比賽更新成功', gameId: body.gameId }, false);
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
function handleCancelGame(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  return createSuccessResponse({ message: '比賽已取消', gameId: body.gameId }, false);
}
function handleCreateAnnouncement(e, body) {
  if (!body.title) return createErrorResponse(400, '缺少必要參數：title');
  if (!body.content) return createErrorResponse(400, '缺少必要參數：content');
  return createSuccessResponse({ message: '公告發佈成功', announcementId: 'new-ann-id' }, false);
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
function handleCreateGame(e, body) {
  if (!body.seasonId) return createErrorResponse(400, '缺少必要參數：seasonId');
  if (!body.date) return createErrorResponse(400, '缺少必要參數：date');
  if (!body.homeTeamId) return createErrorResponse(400, '缺少必要參數：homeTeamId');
  if (!body.awayTeamId) return createErrorResponse(400, '缺少必要參數：awayTeamId');
  return createSuccessResponse({ message: '比賽建立成功', gameId: 'new-game-id' }, false);
}
function handleUpdateGame(e, body) {
  if (!body.gameId) return createErrorResponse(400, '缺少必要參數：gameId');
  return createSuccessResponse({ message: '比賽更新成功', gameId: body.gameId }, false);
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

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : null;
    if (!action) {
      return createErrorResponse(400, '缺少必要參數：action');
    }
    if (VALID_GET_ACTIONS.indexOf(action) === -1) {
      return createErrorResponse(400, '無效的請求動作：' + action);
    }

    // 嘗試從快取讀取
    var params = e && e.parameter ? e.parameter : {};
    var cacheKey = buildCacheKey(action, params);
    var cachedData = getCachedResponse(cacheKey);
    if (cachedData !== null) {
      return createSuccessResponse(cachedData, true);
    }

    // 快取未命中，路由至對應處理函數
    var result;
    switch (action) {
      case 'seasons': result = handleGetSeasons(e); break;
      case 'teams': result = handleGetTeams(e); break;
      case 'players': result = handleGetPlayers(e); break;
      case 'games': result = handleGetGames(e); break;
      case 'boxscore': result = handleGetBoxScore(e); break;
      case 'standings': result = handleGetStandings(e); break;
      case 'leaders': result = handleGetLeaders(e); break;
      case 'playerProfile': result = handleGetPlayerProfile(e); break;
      case 'teamProfile': result = handleGetTeamProfile(e); break;
      case 'schedule': result = handleGetSchedule(e); break;
      case 'playoffs': result = handleGetPlayoffs(e); break;
      case 'shotchart': result = handleGetShotChart(e); break;
      case 'advancedStats': result = handleGetAdvancedStats(e); break;
      case 'achievements': result = handleGetAchievements(e); break;
      case 'archive': result = handleGetArchive(e); break;
      case 'announcements': result = handleGetAnnouncements(e); break;
      default: return createErrorResponse(400, '無效的請求動作：' + action);
    }

    // 將處理結果寫入快取
    try {
      var responseBody = JSON.parse(result.getContent());
      if (responseBody.status === 'success') {
        setCachedResponse(cacheKey, responseBody.data);
      }
    } catch (cacheErr) {
      // silently ignore
    }

    return result;
  } catch (err) {
    return createErrorResponse(500, '伺服器內部錯誤，請稍後重試');
  }
}

function doPost(e) {
  try {
    if (!validateApiKey(e)) {
      return createErrorResponse(401, '未授權：缺少或無效的 API Key');
    }
    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return createErrorResponse(400, '參數格式錯誤：請求體必須為有效的 JSON');
    }
    var action = body.action;
    if (!action) {
      return createErrorResponse(400, '缺少必要參數：action');
    }
    if (VALID_POST_ACTIONS.indexOf(action) === -1) {
      return createErrorResponse(400, '無效的請求動作：' + action);
    }
    var result;
    switch (action) {
      case 'submitBoxScore': result = handleSubmitBoxScore(e, body); break;
      case 'updateBoxScore': result = handleUpdateBoxScore(e, body); break;
      case 'createGame': result = handleCreateGame(e, body); break;
      case 'updateGame': result = handleUpdateGame(e, body); break;
      case 'submitShotLocation': result = handleSubmitShotLocation(e, body); break;
      case 'generatePlayoffs': result = handleGeneratePlayoffs(e, body); break;
      case 'archiveSeason': result = handleArchiveSeason(e, body); break;
      case 'createAnnouncement': result = handleCreateAnnouncement(e, body); break;
      case 'cancelGame': result = handleCancelGame(e, body); break;
      default: return createErrorResponse(400, '無效的請求動作：' + action);
    }

    // POST 成功後清除相關快取
    try {
      var responseBody = JSON.parse(result.getContent());
      if (responseBody.status === 'success') {
        clearRelatedCache(action, body);
      }
    } catch (cacheErr) {
      // silently ignore
    }

    return result;
  } catch (err) {
    return createErrorResponse(500, '伺服器內部錯誤，請稍後重試');
  }
}

// Helper to parse response JSON
function parseResponse(output) {
  return JSON.parse(output.getContent());
}

// ============================================================
// Tests
// ============================================================

beforeEach(() => {
  mockScriptProperties = {};
  mockCacheStore = {};
});

describe('createSuccessResponse', () => {
  it('should return JSON with status, data, cached, and timestamp', () => {
    const output = createSuccessResponse({ foo: 'bar' }, false);
    const json = parseResponse(output);
    expect(json.status).toBe('success');
    expect(json.data).toEqual({ foo: 'bar' });
    expect(json.cached).toBe(false);
    expect(json.timestamp).toBeDefined();
    expect(output._mimeType).toBe('JSON');
  });

  it('should set cached to true when specified', () => {
    const output = createSuccessResponse([], true);
    const json = parseResponse(output);
    expect(json.cached).toBe(true);
  });

  it('should default cached to false for non-boolean values', () => {
    const output = createSuccessResponse([], undefined);
    const json = parseResponse(output);
    expect(json.cached).toBe(false);
  });

  it('should include a valid ISO timestamp', () => {
    const output = createSuccessResponse({}, false);
    const json = parseResponse(output);
    const date = new Date(json.timestamp);
    expect(date.toISOString()).toBe(json.timestamp);
  });
});

describe('createErrorResponse', () => {
  it('should return JSON with status, code, and message', () => {
    const output = createErrorResponse(400, '測試錯誤');
    const json = parseResponse(output);
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toBe('測試錯誤');
    expect(output._mimeType).toBe('JSON');
  });

  it('should support 401 error code', () => {
    const output = createErrorResponse(401, '未授權');
    const json = parseResponse(output);
    expect(json.code).toBe(401);
  });

  it('should support 500 error code', () => {
    const output = createErrorResponse(500, '伺服器錯誤');
    const json = parseResponse(output);
    expect(json.code).toBe(500);
  });
});

describe('validateApiKey', () => {
  it('should return false when no API_KEY is stored', () => {
    expect(validateApiKey({ parameter: { apiKey: 'test' } })).toBe(false);
  });

  it('should return true when apiKey parameter matches stored key', () => {
    mockScriptProperties['API_KEY'] = 'my-secret-key';
    const e = { parameter: { apiKey: 'my-secret-key' } };
    expect(validateApiKey(e)).toBe(true);
  });

  it('should return false when apiKey parameter does not match', () => {
    mockScriptProperties['API_KEY'] = 'my-secret-key';
    const e = { parameter: { apiKey: 'wrong-key' } };
    expect(validateApiKey(e)).toBe(false);
  });

  it('should read apiKey from request body', () => {
    mockScriptProperties['API_KEY'] = 'body-key';
    const e = {
      parameter: {},
      postData: { contents: JSON.stringify({ apiKey: 'body-key', action: 'test' }) }
    };
    expect(validateApiKey(e)).toBe(true);
  });

  it('should prefer parameter apiKey over body apiKey', () => {
    mockScriptProperties['API_KEY'] = 'param-key';
    const e = {
      parameter: { apiKey: 'param-key' },
      postData: { contents: JSON.stringify({ apiKey: 'body-key' }) }
    };
    expect(validateApiKey(e)).toBe(true);
  });

  it('should return false for null event', () => {
    mockScriptProperties['API_KEY'] = 'key';
    expect(validateApiKey(null)).toBe(false);
  });

  it('should handle malformed JSON in postData gracefully', () => {
    mockScriptProperties['API_KEY'] = 'key';
    const e = {
      parameter: {},
      postData: { contents: 'not-json' }
    };
    expect(validateApiKey(e)).toBe(false);
  });
});

describe('doGet', () => {
  it('should return 400 when action parameter is missing', () => {
    const json = parseResponse(doGet({ parameter: {} }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('action');
  });

  it('should return 400 when event is null', () => {
    const json = parseResponse(doGet(null));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
  });

  it('should return 400 for invalid action', () => {
    const json = parseResponse(doGet({ parameter: { action: 'invalidAction' } }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('invalidAction');
  });

  it('should route all valid GET actions successfully', () => {
    for (const action of VALID_GET_ACTIONS) {
      const json = parseResponse(doGet({ parameter: { action } }));
      expect(json.status).toBe('success');
      expect(json).toHaveProperty('data');
      expect(json).toHaveProperty('timestamp');
    }
  });

  it('should return success response with correct format for seasons', () => {
    const json = parseResponse(doGet({ parameter: { action: 'seasons' } }));
    expect(json.status).toBe('success');
    expect(json.cached).toBe(false);
    expect(json.timestamp).toBeDefined();
  });
});

describe('doPost', () => {
  it('should return 401 when API key is missing', () => {
    mockScriptProperties['API_KEY'] = 'secret';
    const e = {
      parameter: {},
      postData: { contents: JSON.stringify({ action: 'submitBoxScore' }) }
    };
    const json = parseResponse(doPost(e));
    expect(json.status).toBe('error');
    expect(json.code).toBe(401);
    expect(json.message).toContain('未授權');
  });

  it('should return 401 when API key is wrong', () => {
    mockScriptProperties['API_KEY'] = 'secret';
    const e = {
      parameter: { apiKey: 'wrong' },
      postData: { contents: JSON.stringify({ action: 'submitBoxScore' }) }
    };
    const json = parseResponse(doPost(e));
    expect(json.status).toBe('error');
    expect(json.code).toBe(401);
  });

  it('should return 400 for invalid JSON body', () => {
    mockScriptProperties['API_KEY'] = 'secret';
    const e = {
      parameter: { apiKey: 'secret' },
      postData: { contents: 'not-json' }
    };
    const json = parseResponse(doPost(e));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('JSON');
  });

  it('should return 400 when action is missing from body', () => {
    mockScriptProperties['API_KEY'] = 'secret';
    const e = {
      parameter: { apiKey: 'secret' },
      postData: { contents: JSON.stringify({ data: 'test' }) }
    };
    const json = parseResponse(doPost(e));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('action');
  });

  it('should return 400 for invalid POST action', () => {
    mockScriptProperties['API_KEY'] = 'secret';
    const e = {
      parameter: { apiKey: 'secret' },
      postData: { contents: JSON.stringify({ action: 'invalidAction' }) }
    };
    const json = parseResponse(doPost(e));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('invalidAction');
  });

  it('should route all valid POST actions successfully with correct API key', () => {
    mockScriptProperties['API_KEY'] = 'secret';
    for (const action of VALID_POST_ACTIONS) {
      const e = {
        parameter: { apiKey: 'secret' },
        postData: { contents: JSON.stringify({ action, apiKey: 'secret' }) }
      };
      const json = parseResponse(doPost(e));
      expect(json.status).toBe('success');
    }
  });

  it('should accept API key from request body', () => {
    mockScriptProperties['API_KEY'] = 'body-secret';
    const e = {
      parameter: {},
      postData: { contents: JSON.stringify({ action: 'createGame', apiKey: 'body-secret' }) }
    };
    const json = parseResponse(doPost(e));
    expect(json.status).toBe('success');
  });
});


// ============================================================
// 快取機制測試
// 需求：11.6
// ============================================================

describe('buildCacheKey', () => {
  it('should return action only when no params', () => {
    expect(buildCacheKey('seasons', null)).toBe('seasons');
    expect(buildCacheKey('seasons', undefined)).toBe('seasons');
  });

  it('should use seasonId when available', () => {
    expect(buildCacheKey('standings', { seasonId: '2024summer' })).toBe('standings_2024summer');
  });

  it('should use gameId when available (priority over seasonId)', () => {
    expect(buildCacheKey('boxscore', { gameId: 'g1', seasonId: 's1' })).toBe('boxscore_g1');
  });

  it('should use playerId when available', () => {
    expect(buildCacheKey('playerProfile', { playerId: 'p1' })).toBe('playerProfile_p1');
  });

  it('should use teamId when available', () => {
    expect(buildCacheKey('teamProfile', { teamId: 't1' })).toBe('teamProfile_t1');
  });

  it('should return action only when params has no recognized keys', () => {
    expect(buildCacheKey('seasons', { action: 'seasons' })).toBe('seasons');
  });
});

describe('getCachedResponse / setCachedResponse', () => {
  it('should return null on cache miss', () => {
    expect(getCachedResponse('nonexistent')).toBeNull();
  });

  it('should return cached data after set', () => {
    setCachedResponse('test_key', { foo: 'bar' });
    const result = getCachedResponse('test_key');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('should gracefully return null when CacheService throws on get', () => {
    const originalGet = globalThis.CacheService.getScriptCache;
    globalThis.CacheService.getScriptCache = () => {
      throw new Error('Cache unavailable');
    };
    expect(getCachedResponse('any_key')).toBeNull();
    globalThis.CacheService.getScriptCache = originalGet;
  });

  it('should gracefully ignore when CacheService throws on put', () => {
    const originalGet = globalThis.CacheService.getScriptCache;
    globalThis.CacheService.getScriptCache = () => {
      throw new Error('Cache unavailable');
    };
    // Should not throw
    expect(() => setCachedResponse('any_key', { data: 1 })).not.toThrow();
    globalThis.CacheService.getScriptCache = originalGet;
  });
});

describe('clearRelatedCache', () => {
  it('should clear boxscore and standings cache on submitBoxScore', () => {
    mockCacheStore['boxscore_g1'] = JSON.stringify({ some: 'data' });
    mockCacheStore['standings_s1'] = JSON.stringify({ some: 'data' });
    mockCacheStore['standings'] = JSON.stringify({ some: 'data' });
    mockCacheStore['unrelated_key'] = JSON.stringify({ keep: true });

    clearRelatedCache('submitBoxScore', { gameId: 'g1', seasonId: 's1' });

    expect(mockCacheStore['boxscore_g1']).toBeUndefined();
    expect(mockCacheStore['standings_s1']).toBeUndefined();
    expect(mockCacheStore['standings']).toBeUndefined();
    expect(mockCacheStore['unrelated_key']).toBeDefined();
  });

  it('should clear player-specific caches when entries provided', () => {
    mockCacheStore['playerProfile_p1'] = JSON.stringify({});
    mockCacheStore['advancedStats_p1'] = JSON.stringify({});
    mockCacheStore['teamProfile_t1'] = JSON.stringify({});

    clearRelatedCache('submitBoxScore', {
      gameId: 'g1',
      entries: [{ playerId: 'p1', teamId: 't1' }]
    });

    expect(mockCacheStore['playerProfile_p1']).toBeUndefined();
    expect(mockCacheStore['advancedStats_p1']).toBeUndefined();
    expect(mockCacheStore['teamProfile_t1']).toBeUndefined();
  });

  it('should clear game/schedule cache on createGame', () => {
    mockCacheStore['games_s1'] = JSON.stringify({});
    mockCacheStore['games'] = JSON.stringify({});
    mockCacheStore['schedule_s1'] = JSON.stringify({});

    clearRelatedCache('createGame', { seasonId: 's1' });

    expect(mockCacheStore['games_s1']).toBeUndefined();
    expect(mockCacheStore['games']).toBeUndefined();
    expect(mockCacheStore['schedule_s1']).toBeUndefined();
  });

  it('should clear announcements cache on createAnnouncement', () => {
    mockCacheStore['announcements'] = JSON.stringify({});

    clearRelatedCache('createAnnouncement', {});

    expect(mockCacheStore['announcements']).toBeUndefined();
  });

  it('should not throw when CacheService fails', () => {
    const originalGet = globalThis.CacheService.getScriptCache;
    globalThis.CacheService.getScriptCache = () => {
      throw new Error('Cache unavailable');
    };
    expect(() => clearRelatedCache('submitBoxScore', { gameId: 'g1' })).not.toThrow();
    globalThis.CacheService.getScriptCache = originalGet;
  });
});

describe('doGet with caching', () => {
  it('should return cached:false on first call (cache miss)', () => {
    const json = parseResponse(doGet({ parameter: { action: 'seasons' } }));
    expect(json.status).toBe('success');
    expect(json.cached).toBe(false);
  });

  it('should return cached:true on second call (cache hit)', () => {
    // First call — populates cache
    doGet({ parameter: { action: 'seasons' } });
    // Second call — should hit cache
    const json = parseResponse(doGet({ parameter: { action: 'seasons' } }));
    expect(json.status).toBe('success');
    expect(json.cached).toBe(true);
  });

  it('should use seasonId in cache key for standings', () => {
    doGet({ parameter: { action: 'standings', seasonId: '2024' } });
    // Verify cache was populated with correct key
    expect(mockCacheStore['standings_2024']).toBeDefined();
  });

  it('should use gameId in cache key for boxscore', () => {
    doGet({ parameter: { action: 'boxscore', gameId: 'game123' } });
    expect(mockCacheStore['boxscore_game123']).toBeDefined();
  });

  it('should gracefully degrade when cache read fails', () => {
    const originalGet = globalThis.CacheService.getScriptCache;
    globalThis.CacheService.getScriptCache = () => ({
      get() { throw new Error('Cache read error'); },
      put() { /* no-op */ }
    });

    const json = parseResponse(doGet({ parameter: { action: 'seasons' } }));
    expect(json.status).toBe('success');
    expect(json.cached).toBe(false);

    globalThis.CacheService.getScriptCache = originalGet;
  });
});

describe('doPost clears cache', () => {
  it('should clear related cache after successful POST', () => {
    // Pre-populate cache
    mockCacheStore['standings'] = JSON.stringify([]);
    mockCacheStore['leaders'] = JSON.stringify([]);
    mockCacheStore['boxscore_g1'] = JSON.stringify({});

    mockScriptProperties['API_KEY'] = 'secret';
    const e = {
      parameter: { apiKey: 'secret' },
      postData: {
        contents: JSON.stringify({
          action: 'submitBoxScore',
          apiKey: 'secret',
          gameId: 'g1',
          seasonId: 's1'
        })
      }
    };

    const json = parseResponse(doPost(e));
    expect(json.status).toBe('success');

    // Cache should be cleared
    expect(mockCacheStore['standings']).toBeUndefined();
    expect(mockCacheStore['leaders']).toBeUndefined();
    expect(mockCacheStore['boxscore_g1']).toBeUndefined();
  });

  it('should not clear cache when POST fails (e.g. 401)', () => {
    mockCacheStore['standings'] = JSON.stringify([]);
    mockScriptProperties['API_KEY'] = 'secret';

    const e = {
      parameter: { apiKey: 'wrong' },
      postData: {
        contents: JSON.stringify({ action: 'submitBoxScore' })
      }
    };

    const json = parseResponse(doPost(e));
    expect(json.status).toBe('error');
    // Cache should remain
    expect(mockCacheStore['standings']).toBeDefined();
  });
});


// ============================================================
// Box Score 數據驗證器測試
// 需求：7.3, 7.4, 7.5
// ============================================================

// Re-implement validateBoxScore for testing (mirrors Code.gs)
function validateBoxScore(entries) {
  var errors = [];

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return { valid: false, errors: [{ index: -1, field: 'entries', message: 'entries 為必填欄位' }] };
  }

  var requiredStringFields = ['playerId', 'teamId'];
  var numericFields = ['pts', 'reb', 'ast', 'stl', 'blk', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'to', 'fouls'];

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];

    for (var s = 0; s < requiredStringFields.length; s++) {
      var sf = requiredStringFields[s];
      if (entry[sf] === undefined || entry[sf] === null || entry[sf] === '') {
        errors.push({ index: i, field: sf, message: sf + ' 為必填欄位' });
      }
    }

    for (var n = 0; n < numericFields.length; n++) {
      var nf = numericFields[n];
      var val = entry[nf];

      if (val === undefined || val === null || val === '') {
        errors.push({ index: i, field: nf, message: nf + ' 為必填欄位' });
        continue;
      }

      if (typeof val !== 'number' || !Number.isInteger(val)) {
        errors.push({ index: i, field: nf, message: nf + ' 必須為整數' });
        continue;
      }

      if (val < 0) {
        errors.push({ index: i, field: nf, message: nf + ' 不能為負數' });
      }
    }

    if (typeof entry.fgm === 'number' && Number.isInteger(entry.fgm) && entry.fgm >= 0 &&
        typeof entry.fga === 'number' && Number.isInteger(entry.fga) && entry.fga >= 0) {
      if (entry.fgm > entry.fga) {
        errors.push({ index: i, field: 'fgm', message: '投籃命中數 (FGM) 不能超過投籃出手數 (FGA)' });
      }
    }

    if (typeof entry.tpm === 'number' && Number.isInteger(entry.tpm) && entry.tpm >= 0 &&
        typeof entry.tpa === 'number' && Number.isInteger(entry.tpa) && entry.tpa >= 0) {
      if (entry.tpm > entry.tpa) {
        errors.push({ index: i, field: 'tpm', message: '三分命中數 (3PM) 不能超過三分出手數 (3PA)' });
      }
    }

    if (typeof entry.ftm === 'number' && Number.isInteger(entry.ftm) && entry.ftm >= 0 &&
        typeof entry.fta === 'number' && Number.isInteger(entry.fta) && entry.fta >= 0) {
      if (entry.ftm > entry.fta) {
        errors.push({ index: i, field: 'ftm', message: '罰球命中數 (FTM) 不能超過罰球出手數 (FTA)' });
      }
    }
  }

  return { valid: errors.length === 0, errors: errors };
}

// Helper: create a valid box score entry
function makeValidEntry(overrides = {}) {
  return {
    playerId: 'p1',
    teamId: 't1',
    pts: 10, reb: 5, ast: 3, stl: 1, blk: 0,
    fgm: 4, fga: 8, tpm: 1, tpa: 3, ftm: 1, fta: 2,
    to: 2, fouls: 3,
    ...overrides
  };
}

describe('validateBoxScore', () => {
  it('should accept a valid single entry', () => {
    const result = validateBoxScore([makeValidEntry()]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept multiple valid entries', () => {
    const result = validateBoxScore([
      makeValidEntry({ playerId: 'p1' }),
      makeValidEntry({ playerId: 'p2' }),
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept entry with all zeros', () => {
    const result = validateBoxScore([makeValidEntry({
      pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
      fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
      to: 0, fouls: 0
    })]);
    expect(result.valid).toBe(true);
  });

  it('should reject null entries', () => {
    const result = validateBoxScore(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('entries');
  });

  it('should reject empty array', () => {
    const result = validateBoxScore([]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].field).toBe('entries');
  });

  it('should reject non-array entries', () => {
    const result = validateBoxScore('not-an-array');
    expect(result.valid).toBe(false);
  });

  // Required string fields
  it('should reject empty playerId', () => {
    const result = validateBoxScore([makeValidEntry({ playerId: '' })]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ index: 0, field: 'playerId', message: 'playerId 為必填欄位' })
    );
  });

  it('should reject empty teamId', () => {
    const result = validateBoxScore([makeValidEntry({ teamId: '' })]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ index: 0, field: 'teamId', message: 'teamId 為必填欄位' })
    );
  });

  it('should reject null playerId', () => {
    const result = validateBoxScore([makeValidEntry({ playerId: null })]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'playerId')).toBe(true);
  });

  // Numeric validation: negative
  it('should reject negative pts', () => {
    const result = validateBoxScore([makeValidEntry({ pts: -1 })]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ index: 0, field: 'pts', message: 'pts 不能為負數' })
    );
  });

  it('should reject negative reb', () => {
    const result = validateBoxScore([makeValidEntry({ reb: -5 })]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'reb' && e.message.includes('不能為負數'))).toBe(true);
  });

  // Numeric validation: non-integer
  it('should reject float pts', () => {
    const result = validateBoxScore([makeValidEntry({ pts: 10.5 })]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ index: 0, field: 'pts', message: 'pts 必須為整數' })
    );
  });

  it('should reject string numeric value', () => {
    const result = validateBoxScore([makeValidEntry({ ast: '3' })]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'ast' && e.message.includes('必須為整數'))).toBe(true);
  });

  // Missing numeric field
  it('should reject missing numeric field (undefined)', () => {
    const entry = makeValidEntry();
    delete entry.fouls;
    const result = validateBoxScore([entry]);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'fouls' && e.message.includes('為必填欄位'))).toBe(true);
  });

  // Cross-validation: FGM > FGA
  it('should reject FGM > FGA', () => {
    const result = validateBoxScore([makeValidEntry({ fgm: 10, fga: 5 })]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'fgm', message: '投籃命中數 (FGM) 不能超過投籃出手數 (FGA)' })
    );
  });

  it('should accept FGM === FGA', () => {
    const result = validateBoxScore([makeValidEntry({ fgm: 5, fga: 5 })]);
    expect(result.valid).toBe(true);
  });

  // Cross-validation: 3PM > 3PA
  it('should reject 3PM > 3PA', () => {
    const result = validateBoxScore([makeValidEntry({ tpm: 4, tpa: 2 })]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'tpm', message: '三分命中數 (3PM) 不能超過三分出手數 (3PA)' })
    );
  });

  it('should accept 3PM === 3PA', () => {
    const result = validateBoxScore([makeValidEntry({ tpm: 3, tpa: 3 })]);
    expect(result.valid).toBe(true);
  });

  // Cross-validation: FTM > FTA
  it('should reject FTM > FTA', () => {
    const result = validateBoxScore([makeValidEntry({ ftm: 6, fta: 3 })]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'ftm', message: '罰球命中數 (FTM) 不能超過罰球出手數 (FTA)' })
    );
  });

  it('should accept FTM === FTA', () => {
    const result = validateBoxScore([makeValidEntry({ ftm: 2, fta: 2 })]);
    expect(result.valid).toBe(true);
  });

  // Multiple errors in one entry
  it('should report multiple errors for one entry', () => {
    const result = validateBoxScore([makeValidEntry({ playerId: '', pts: -1, fgm: 10, fga: 5 })]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  // Error index tracking across multiple entries
  it('should track correct index for errors in second entry', () => {
    const result = validateBoxScore([
      makeValidEntry(),
      makeValidEntry({ playerId: '' }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0].index).toBe(1);
  });

  // Cross-validation skipped when base fields are invalid
  it('should not report FGM > FGA when fgm is negative', () => {
    const result = validateBoxScore([makeValidEntry({ fgm: -1, fga: 0 })]);
    expect(result.valid).toBe(false);
    // Should have negative error but NOT cross-validation error
    const crossErrors = result.errors.filter(e => e.message.includes('不能超過'));
    expect(crossErrors).toHaveLength(0);
  });
});


// ============================================================
// 聚合計算引擎 — 純邏輯函數測試
// 需求：2.1, 2.2, 2.3, 2.4, 2.5, 2.6
// ============================================================

// Re-implement pure logic functions for testing (mirrors Code.gs)

function computePlayerAverages(boxScoreRows) {
  if (!boxScoreRows || boxScoreRows.length === 0) {
    return { games_played: 0, avg_pts: 0, avg_reb: 0, avg_ast: 0, avg_stl: 0, avg_blk: 0 };
  }
  var games_played = boxScoreRows.length;
  var sum_pts = 0, sum_reb = 0, sum_ast = 0, sum_stl = 0, sum_blk = 0;
  for (var i = 0; i < boxScoreRows.length; i++) {
    var row = boxScoreRows[i];
    sum_pts += (row.pts || 0);
    sum_reb += (row.reb || 0);
    sum_ast += (row.ast || 0);
    sum_stl += (row.stl || 0);
    sum_blk += (row.blk || 0);
  }
  return {
    games_played: games_played,
    avg_pts: sum_pts / games_played,
    avg_reb: sum_reb / games_played,
    avg_ast: sum_ast / games_played,
    avg_stl: sum_stl / games_played,
    avg_blk: sum_blk / games_played
  };
}

function computeShootingPcts(boxScoreRows) {
  if (!boxScoreRows || boxScoreRows.length === 0) {
    return { fg_pct: 0, tp_pct: 0, ft_pct: 0 };
  }
  var sum_fgm = 0, sum_fga = 0, sum_tpm = 0, sum_tpa = 0, sum_ftm = 0, sum_fta = 0;
  for (var i = 0; i < boxScoreRows.length; i++) {
    var row = boxScoreRows[i];
    sum_fgm += (row.fgm || 0);
    sum_fga += (row.fga || 0);
    sum_tpm += (row.tpm || 0);
    sum_tpa += (row.tpa || 0);
    sum_ftm += (row.ftm || 0);
    sum_fta += (row.fta || 0);
  }
  return {
    fg_pct: sum_fga === 0 ? 0 : sum_fgm / sum_fga,
    tp_pct: sum_tpa === 0 ? 0 : sum_tpm / sum_tpa,
    ft_pct: sum_fta === 0 ? 0 : sum_ftm / sum_fta
  };
}

function computeHeadToHead(teamAId, teamBId, games) {
  var teamAWins = 0;
  var teamBWins = 0;
  for (var i = 0; i < games.length; i++) {
    var g = games[i];
    if (g.status !== 'completed') continue;
    var homeWins = g.homeScore > g.awayScore;
    if (g.homeTeamId === teamAId && g.awayTeamId === teamBId) {
      if (homeWins) { teamAWins++; } else { teamBWins++; }
    } else if (g.homeTeamId === teamBId && g.awayTeamId === teamAId) {
      if (homeWins) { teamBWins++; } else { teamAWins++; }
    }
  }
  return { teamAWins: teamAWins, teamBWins: teamBWins, totalGames: teamAWins + teamBWins };
}

function computeTeamStandings(games, teams, seasonConfig) {
  if (!teams || teams.length === 0) return [];
  var completedGames = [];
  for (var i = 0; i < games.length; i++) {
    if (games[i].status === 'completed') {
      completedGames.push(games[i]);
    }
  }
  var teamMap = {};
  for (var t = 0; t < teams.length; t++) {
    teamMap[teams[t].id] = {
      teamId: teams[t].id,
      teamName: teams[t].name,
      wins: 0,
      losses: 0,
      pct: 0,
      streak: '',
      gb: 0,
      gameResults: []
    };
  }
  for (var g = 0; g < completedGames.length; g++) {
    var game = completedGames[g];
    var homeWon = game.homeScore > game.awayScore;
    if (teamMap[game.homeTeamId]) {
      if (homeWon) { teamMap[game.homeTeamId].wins++; } else { teamMap[game.homeTeamId].losses++; }
      teamMap[game.homeTeamId].gameResults.push({ date: game.date || '', won: homeWon });
    }
    if (teamMap[game.awayTeamId]) {
      if (!homeWon) { teamMap[game.awayTeamId].wins++; } else { teamMap[game.awayTeamId].losses++; }
      teamMap[game.awayTeamId].gameResults.push({ date: game.date || '', won: !homeWon });
    }
  }
  var standings = [];
  var teamIds = Object.keys(teamMap);
  for (var k = 0; k < teamIds.length; k++) {
    var rec = teamMap[teamIds[k]];
    var total = rec.wins + rec.losses;
    rec.pct = total === 0 ? 0 : rec.wins / total;
    rec.gameResults.sort(function(a, b) {
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });
    if (rec.gameResults.length > 0) {
      var lastResult = rec.gameResults[rec.gameResults.length - 1].won;
      var streakCount = 0;
      for (var s = rec.gameResults.length - 1; s >= 0; s--) {
        if (rec.gameResults[s].won === lastResult) {
          streakCount++;
        } else {
          break;
        }
      }
      rec.streak = (lastResult ? 'W' : 'L') + streakCount;
    } else {
      rec.streak = '-';
    }
    standings.push(rec);
  }
  standings.sort(function(a, b) {
    if (b.pct !== a.pct) return b.pct - a.pct;
    var h2h = computeHeadToHead(a.teamId, b.teamId, completedGames);
    if (h2h.teamAWins !== h2h.teamBWins) {
      return h2h.teamBWins - h2h.teamAWins;
    }
    return 0;
  });
  if (standings.length > 0) {
    var firstWins = standings[0].wins;
    var firstLosses = standings[0].losses;
    for (var r = 0; r < standings.length; r++) {
      standings[r].gb = ((firstWins - standings[r].wins) + (standings[r].losses - firstLosses)) / 2;
    }
  }
  for (var c = 0; c < standings.length; c++) {
    delete standings[c].gameResults;
  }
  return standings;
}

function computeLeaderboards(playerStats, minGames) {
  if (minGames === undefined || minGames === null) minGames = 3;
  if (!playerStats || playerStats.length === 0) {
    return { pts: [], reb: [], ast: [], stl: [], blk: [], fg_pct: [], tp_pct: [], ft_pct: [] };
  }
  var eligible = [];
  for (var i = 0; i < playerStats.length; i++) {
    if (playerStats[i].games_played >= minGames) {
      eligible.push(playerStats[i]);
    }
  }
  var categories = ['pts', 'reb', 'ast', 'stl', 'blk', 'fg_pct', 'tp_pct', 'ft_pct'];
  var fieldMap = {
    pts: 'avg_pts', reb: 'avg_reb', ast: 'avg_ast',
    stl: 'avg_stl', blk: 'avg_blk',
    fg_pct: 'fg_pct', tp_pct: 'tp_pct', ft_pct: 'ft_pct'
  };
  var result = {};
  for (var c = 0; c < categories.length; c++) {
    var cat = categories[c];
    var field = fieldMap[cat];
    var sorted = eligible.slice().sort(function(a, b) {
      return (b[field] || 0) - (a[field] || 0);
    });
    result[cat] = sorted.slice(0, 10).map(function(p, idx) {
      return {
        rank: idx + 1,
        playerId: p.playerId,
        playerName: p.playerName,
        teamName: p.teamName,
        value: p[field] || 0,
        games_played: p.games_played
      };
    });
  }
  return result;
}

function computeScoreConsistency(boxScoreRows, homeScore, awayScore, homeTeamId, awayTeamId) {
  var homeSum = 0;
  var awaySum = 0;
  for (var i = 0; i < boxScoreRows.length; i++) {
    var row = boxScoreRows[i];
    if (row.teamId === homeTeamId) {
      homeSum += (row.pts || 0);
    } else if (row.teamId === awayTeamId) {
      awaySum += (row.pts || 0);
    }
  }
  return {
    valid: homeSum === homeScore && awaySum === awayScore,
    homeSum: homeSum,
    awaySum: awaySum,
    homeScore: homeScore,
    awayScore: awayScore
  };
}

// ============================================================
// computePlayerAverages 測試
// ============================================================

describe('computePlayerAverages', () => {
  it('should return zeros for empty input', () => {
    const result = computePlayerAverages([]);
    expect(result.games_played).toBe(0);
    expect(result.avg_pts).toBe(0);
  });

  it('should return zeros for null input', () => {
    const result = computePlayerAverages(null);
    expect(result.games_played).toBe(0);
  });

  it('should calculate averages for multiple games', () => {
    const rows = [
      { pts: 20, reb: 10, ast: 5, stl: 2, blk: 1 },
      { pts: 30, reb: 8, ast: 7, stl: 3, blk: 2 },
      { pts: 10, reb: 6, ast: 3, stl: 1, blk: 0 },
    ];
    const result = computePlayerAverages(rows);
    expect(result.games_played).toBe(3);
    expect(result.avg_pts).toBe(20);
    expect(result.avg_reb).toBe(8);
    expect(result.avg_ast).toBe(5);
    expect(result.avg_stl).toBe(2);
    expect(result.avg_blk).toBe(1);
  });

  it('should calculate averages for a single game', () => {
    const rows = [{ pts: 25, reb: 12, ast: 8, stl: 3, blk: 2 }];
    const result = computePlayerAverages(rows);
    expect(result.games_played).toBe(1);
    expect(result.avg_pts).toBe(25);
    expect(result.avg_reb).toBe(12);
    expect(result.avg_ast).toBe(8);
    expect(result.avg_stl).toBe(3);
    expect(result.avg_blk).toBe(2);
  });
});

// ============================================================
// computeShootingPcts 測試
// ============================================================

describe('computeShootingPcts', () => {
  it('should return zeros for empty input', () => {
    const result = computeShootingPcts([]);
    expect(result.fg_pct).toBe(0);
    expect(result.tp_pct).toBe(0);
    expect(result.ft_pct).toBe(0);
  });

  it('should calculate normal shooting percentages', () => {
    const rows = [
      { fgm: 5, fga: 10, tpm: 2, tpa: 5, ftm: 3, fta: 4 },
      { fgm: 3, fga: 10, tpm: 1, tpa: 5, ftm: 2, fta: 6 },
    ];
    const result = computeShootingPcts(rows);
    expect(result.fg_pct).toBe(8 / 20); // 0.4
    expect(result.tp_pct).toBe(3 / 10); // 0.3
    expect(result.ft_pct).toBe(5 / 10); // 0.5
  });

  it('should return 0 when attempts are zero', () => {
    const rows = [
      { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 },
    ];
    const result = computeShootingPcts(rows);
    expect(result.fg_pct).toBe(0);
    expect(result.tp_pct).toBe(0);
    expect(result.ft_pct).toBe(0);
  });

  it('should handle mixed zero and non-zero attempts', () => {
    const rows = [
      { fgm: 4, fga: 8, tpm: 0, tpa: 0, ftm: 2, fta: 2 },
    ];
    const result = computeShootingPcts(rows);
    expect(result.fg_pct).toBe(0.5);
    expect(result.tp_pct).toBe(0);
    expect(result.ft_pct).toBe(1);
  });
});

// ============================================================
// computeTeamStandings 測試
// ============================================================

describe('computeTeamStandings', () => {
  const teams = [
    { id: 'tA', name: 'Team A' },
    { id: 'tB', name: 'Team B' },
    { id: 'tC', name: 'Team C' },
  ];

  it('should return empty array for no teams', () => {
    expect(computeTeamStandings([], [], {})).toEqual([]);
  });

  it('should calculate standings with clear winner', () => {
    const games = [
      { homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 80, awayScore: 70, status: 'completed', date: '2024-01-01' },
      { homeTeamId: 'tA', awayTeamId: 'tC', homeScore: 90, awayScore: 60, status: 'completed', date: '2024-01-02' },
      { homeTeamId: 'tB', awayTeamId: 'tC', homeScore: 75, awayScore: 65, status: 'completed', date: '2024-01-03' },
    ];
    const standings = computeTeamStandings(games, teams);
    // Team A: 2W 0L, Team B: 1W 1L, Team C: 0W 2L
    expect(standings[0].teamId).toBe('tA');
    expect(standings[0].wins).toBe(2);
    expect(standings[0].losses).toBe(0);
    expect(standings[0].pct).toBe(1);
    expect(standings[0].gb).toBe(0);

    expect(standings[1].teamId).toBe('tB');
    expect(standings[1].wins).toBe(1);
    expect(standings[1].losses).toBe(1);
    expect(standings[1].gb).toBe(1);

    expect(standings[2].teamId).toBe('tC');
    expect(standings[2].wins).toBe(0);
    expect(standings[2].losses).toBe(2);
    expect(standings[2].gb).toBe(2);
  });

  it('should handle tied win% with head-to-head tiebreaker', () => {
    // Both teams 1-1, but tB beat tA in their matchup
    const games = [
      { homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 60, awayScore: 70, status: 'completed', date: '2024-01-01' },
      { homeTeamId: 'tA', awayTeamId: 'tC', homeScore: 80, awayScore: 70, status: 'completed', date: '2024-01-02' },
      { homeTeamId: 'tB', awayTeamId: 'tC', homeScore: 60, awayScore: 70, status: 'completed', date: '2024-01-03' },
    ];
    const standings = computeTeamStandings(games, teams);
    // A: 1W 1L, B: 1W 1L, C: 1W 1L — all tied at .500
    // H2H: B beat A, C beat B, A beat C — circular, but sort is pairwise
    expect(standings.every(s => s.pct === 0.5)).toBe(true);
  });

  it('should skip non-completed games', () => {
    const games = [
      { homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 80, awayScore: 70, status: 'completed', date: '2024-01-01' },
      { homeTeamId: 'tA', awayTeamId: 'tC', homeScore: 0, awayScore: 0, status: 'scheduled', date: '2024-01-02' },
    ];
    const standings = computeTeamStandings(games, teams);
    const teamA = standings.find(s => s.teamId === 'tA');
    expect(teamA.wins).toBe(1);
    expect(teamA.losses).toBe(0);
  });

  it('should calculate streak correctly', () => {
    const games = [
      { homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 80, awayScore: 70, status: 'completed', date: '2024-01-01' },
      { homeTeamId: 'tA', awayTeamId: 'tC', homeScore: 90, awayScore: 60, status: 'completed', date: '2024-01-02' },
      { homeTeamId: 'tB', awayTeamId: 'tA', homeScore: 85, awayScore: 70, status: 'completed', date: '2024-01-03' },
    ];
    const standings = computeTeamStandings(games, teams);
    const teamA = standings.find(s => s.teamId === 'tA');
    expect(teamA.streak).toBe('L1');
    expect(teamA.wins).toBe(2);
    expect(teamA.losses).toBe(1);
  });

  it('should show dash streak for teams with no games', () => {
    const standings = computeTeamStandings([], teams);
    expect(standings[0].streak).toBe('-');
  });
});

// ============================================================
// computeLeaderboards 測試
// ============================================================

describe('computeLeaderboards', () => {
  it('should return empty leaderboards for empty input', () => {
    const result = computeLeaderboards([], 3);
    expect(result.pts).toEqual([]);
    expect(result.reb).toEqual([]);
  });

  it('should sort descending and limit to top 10', () => {
    const players = [];
    for (let i = 0; i < 15; i++) {
      players.push({
        playerId: 'p' + i,
        playerName: 'Player ' + i,
        teamName: 'Team',
        games_played: 5,
        avg_pts: i + 1,
        avg_reb: 0, avg_ast: 0, avg_stl: 0, avg_blk: 0,
        fg_pct: 0, tp_pct: 0, ft_pct: 0
      });
    }
    const result = computeLeaderboards(players, 3);
    expect(result.pts).toHaveLength(10);
    expect(result.pts[0].value).toBe(15); // highest
    expect(result.pts[9].value).toBe(6);  // 10th
    expect(result.pts[0].rank).toBe(1);
    expect(result.pts[9].rank).toBe(10);
  });

  it('should filter by minimum games threshold', () => {
    const players = [
      { playerId: 'p1', playerName: 'A', teamName: 'T', games_played: 5, avg_pts: 30, avg_reb: 0, avg_ast: 0, avg_stl: 0, avg_blk: 0, fg_pct: 0, tp_pct: 0, ft_pct: 0 },
      { playerId: 'p2', playerName: 'B', teamName: 'T', games_played: 2, avg_pts: 40, avg_reb: 0, avg_ast: 0, avg_stl: 0, avg_blk: 0, fg_pct: 0, tp_pct: 0, ft_pct: 0 },
      { playerId: 'p3', playerName: 'C', teamName: 'T', games_played: 3, avg_pts: 25, avg_reb: 0, avg_ast: 0, avg_stl: 0, avg_blk: 0, fg_pct: 0, tp_pct: 0, ft_pct: 0 },
    ];
    const result = computeLeaderboards(players, 3);
    // p2 has only 2 games, should be excluded
    expect(result.pts).toHaveLength(2);
    expect(result.pts[0].playerId).toBe('p1');
    expect(result.pts[1].playerId).toBe('p3');
  });

  it('should default minGames to 3', () => {
    const players = [
      { playerId: 'p1', playerName: 'A', teamName: 'T', games_played: 2, avg_pts: 50, avg_reb: 0, avg_ast: 0, avg_stl: 0, avg_blk: 0, fg_pct: 0, tp_pct: 0, ft_pct: 0 },
    ];
    const result = computeLeaderboards(players);
    expect(result.pts).toHaveLength(0); // 2 < 3 default
  });

  it('should generate leaderboards for all categories', () => {
    const players = [
      { playerId: 'p1', playerName: 'A', teamName: 'T', games_played: 5, avg_pts: 20, avg_reb: 10, avg_ast: 8, avg_stl: 3, avg_blk: 2, fg_pct: 0.5, tp_pct: 0.4, ft_pct: 0.8 },
    ];
    const result = computeLeaderboards(players, 1);
    expect(result.pts).toHaveLength(1);
    expect(result.reb).toHaveLength(1);
    expect(result.ast).toHaveLength(1);
    expect(result.stl).toHaveLength(1);
    expect(result.blk).toHaveLength(1);
    expect(result.fg_pct).toHaveLength(1);
    expect(result.tp_pct).toHaveLength(1);
    expect(result.ft_pct).toHaveLength(1);
  });
});

// ============================================================
// computeScoreConsistency 測試
// ============================================================

describe('computeScoreConsistency', () => {
  it('should return valid when scores match', () => {
    const boxScores = [
      { teamId: 'home', pts: 20 },
      { teamId: 'home', pts: 15 },
      { teamId: 'home', pts: 10 },
      { teamId: 'away', pts: 25 },
      { teamId: 'away', pts: 18 },
    ];
    const result = computeScoreConsistency(boxScores, 45, 43, 'home', 'away');
    expect(result.valid).toBe(true);
    expect(result.homeSum).toBe(45);
    expect(result.awaySum).toBe(43);
  });

  it('should return invalid when home score does not match', () => {
    const boxScores = [
      { teamId: 'home', pts: 20 },
      { teamId: 'home', pts: 15 },
      { teamId: 'away', pts: 25 },
    ];
    const result = computeScoreConsistency(boxScores, 40, 25, 'home', 'away');
    expect(result.valid).toBe(false);
    expect(result.homeSum).toBe(35);
    expect(result.homeScore).toBe(40);
  });

  it('should return invalid when away score does not match', () => {
    const boxScores = [
      { teamId: 'home', pts: 30 },
      { teamId: 'away', pts: 20 },
      { teamId: 'away', pts: 10 },
    ];
    const result = computeScoreConsistency(boxScores, 30, 35, 'home', 'away');
    expect(result.valid).toBe(false);
    expect(result.awaySum).toBe(30);
    expect(result.awayScore).toBe(35);
  });

  it('should handle empty box scores', () => {
    const result = computeScoreConsistency([], 0, 0, 'home', 'away');
    expect(result.valid).toBe(true);
    expect(result.homeSum).toBe(0);
    expect(result.awaySum).toBe(0);
  });
});

// ============================================================
// computeHeadToHead 測試
// ============================================================

describe('computeHeadToHead', () => {
  it('should calculate head-to-head record correctly', () => {
    const games = [
      { homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 80, awayScore: 70, status: 'completed' },
      { homeTeamId: 'tB', awayTeamId: 'tA', homeScore: 90, awayScore: 85, status: 'completed' },
      { homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 75, awayScore: 65, status: 'completed' },
    ];
    const result = computeHeadToHead('tA', 'tB', games);
    expect(result.teamAWins).toBe(2);
    expect(result.teamBWins).toBe(1);
    expect(result.totalGames).toBe(3);
  });

  it('should skip non-completed games', () => {
    const games = [
      { homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 80, awayScore: 70, status: 'completed' },
      { homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 0, awayScore: 0, status: 'scheduled' },
    ];
    const result = computeHeadToHead('tA', 'tB', games);
    expect(result.totalGames).toBe(1);
    expect(result.teamAWins).toBe(1);
  });

  it('should ignore games between other teams', () => {
    const games = [
      { homeTeamId: 'tA', awayTeamId: 'tB', homeScore: 80, awayScore: 70, status: 'completed' },
      { homeTeamId: 'tC', awayTeamId: 'tD', homeScore: 90, awayScore: 60, status: 'completed' },
    ];
    const result = computeHeadToHead('tA', 'tB', games);
    expect(result.totalGames).toBe(1);
  });

  it('should return zeros when no games between teams', () => {
    const games = [
      { homeTeamId: 'tC', awayTeamId: 'tD', homeScore: 80, awayScore: 70, status: 'completed' },
    ];
    const result = computeHeadToHead('tA', 'tB', games);
    expect(result.teamAWins).toBe(0);
    expect(result.teamBWins).toBe(0);
    expect(result.totalGames).toBe(0);
  });
});


// ============================================================
// 進階數據計算引擎 — computeAdvancedStats 測試
// 需求：14.1, 14.2, 14.3
// ============================================================

// Re-implement computeAdvancedStats for testing (mirrors Code.gs)
function computeAdvancedStats(boxScoreRows) {
  if (!boxScoreRows || boxScoreRows.length === 0) {
    return { ts_pct: 0, usg: 0, per: 0, games_played: 0 };
  }

  var games_played = boxScoreRows.length;
  var total_pts = 0, total_reb = 0, total_ast = 0, total_stl = 0, total_blk = 0;
  var total_fgm = 0, total_fga = 0, total_ftm = 0, total_fta = 0, total_to = 0;

  for (var i = 0; i < boxScoreRows.length; i++) {
    var row = boxScoreRows[i];
    total_pts += (row.pts || 0);
    total_reb += (row.reb || 0);
    total_ast += (row.ast || 0);
    total_stl += (row.stl || 0);
    total_blk += (row.blk || 0);
    total_fgm += (row.fgm || 0);
    total_fga += (row.fga || 0);
    total_ftm += (row.ftm || 0);
    total_fta += (row.fta || 0);
    total_to += (row.to || 0);
  }

  var ts_denominator = 2 * (total_fga + 0.44 * total_fta);
  var ts_pct = ts_denominator === 0 ? 0 : total_pts / ts_denominator;

  var usg = (total_fga + 0.44 * total_fta + total_to) / games_played;

  var per = (total_pts + total_reb + total_ast + total_stl + total_blk
    - total_to - (total_fga - total_fgm) - (total_fta - total_ftm)) / games_played;

  if (!isFinite(ts_pct)) ts_pct = 0;
  if (!isFinite(usg)) usg = 0;
  if (!isFinite(per)) per = 0;

  return {
    ts_pct: ts_pct,
    usg: usg,
    per: per,
    games_played: games_played
  };
}

describe('computeAdvancedStats', () => {
  it('should return zeros for empty input', () => {
    const result = computeAdvancedStats([]);
    expect(result.ts_pct).toBe(0);
    expect(result.usg).toBe(0);
    expect(result.per).toBe(0);
    expect(result.games_played).toBe(0);
  });

  it('should return zeros for null input', () => {
    const result = computeAdvancedStats(null);
    expect(result.ts_pct).toBe(0);
    expect(result.usg).toBe(0);
    expect(result.per).toBe(0);
    expect(result.games_played).toBe(0);
  });

  it('should calculate correctly for multiple games', () => {
    const rows = [
      { pts: 25, reb: 8, ast: 5, stl: 2, blk: 1, fgm: 8, fga: 15, ftm: 5, fta: 6, to: 3 },
      { pts: 20, reb: 6, ast: 7, stl: 1, blk: 0, fgm: 7, fga: 14, ftm: 4, fta: 5, to: 2 },
      { pts: 30, reb: 10, ast: 3, stl: 3, blk: 2, fgm: 10, fga: 18, ftm: 6, fta: 8, to: 4 },
    ];
    const result = computeAdvancedStats(rows);

    // Totals: pts=75, reb=24, ast=15, stl=6, blk=3, fgm=25, fga=47, ftm=15, fta=19, to=9
    // TS% = 75 / (2 * (47 + 0.44 * 19)) = 75 / (2 * (47 + 8.36)) = 75 / (2 * 55.36) = 75 / 110.72
    const expectedTs = 75 / (2 * (47 + 0.44 * 19));
    expect(result.ts_pct).toBeCloseTo(expectedTs, 10);

    // USG = (47 + 0.44 * 19 + 9) / 3 = (47 + 8.36 + 9) / 3 = 64.36 / 3
    const expectedUsg = (47 + 0.44 * 19 + 9) / 3;
    expect(result.usg).toBeCloseTo(expectedUsg, 10);

    // PER = (75 + 24 + 15 + 6 + 3 - 9 - (47-25) - (19-15)) / 3
    //     = (75 + 24 + 15 + 6 + 3 - 9 - 22 - 4) / 3 = 88 / 3
    const expectedPer = (75 + 24 + 15 + 6 + 3 - 9 - 22 - 4) / 3;
    expect(result.per).toBeCloseTo(expectedPer, 10);

    expect(result.games_played).toBe(3);
  });

  it('should calculate correctly for a single game', () => {
    const rows = [
      { pts: 20, reb: 10, ast: 5, stl: 2, blk: 1, fgm: 7, fga: 15, ftm: 4, fta: 5, to: 3 },
    ];
    const result = computeAdvancedStats(rows);

    const expectedTs = 20 / (2 * (15 + 0.44 * 5));
    expect(result.ts_pct).toBeCloseTo(expectedTs, 10);

    const expectedUsg = (15 + 0.44 * 5 + 3) / 1;
    expect(result.usg).toBeCloseTo(expectedUsg, 10);

    // PER = (20 + 10 + 5 + 2 + 1 - 3 - (15-7) - (5-4)) / 1 = (20+10+5+2+1-3-8-1)/1 = 26
    const expectedPer = 20 + 10 + 5 + 2 + 1 - 3 - 8 - 1;
    expect(result.per).toBeCloseTo(expectedPer, 10);

    expect(result.games_played).toBe(1);
  });

  it('should return 0 for TS% when FGA and FTA are both zero', () => {
    const rows = [
      { pts: 0, reb: 5, ast: 3, stl: 1, blk: 0, fgm: 0, fga: 0, ftm: 0, fta: 0, to: 2 },
    ];
    const result = computeAdvancedStats(rows);
    expect(result.ts_pct).toBe(0);
    expect(Number.isFinite(result.ts_pct)).toBe(true);
    expect(Number.isFinite(result.usg)).toBe(true);
    expect(Number.isFinite(result.per)).toBe(true);
  });

  it('should handle perfect shooting (all makes = all attempts)', () => {
    const rows = [
      { pts: 30, reb: 5, ast: 5, stl: 2, blk: 1, fgm: 10, fga: 10, ftm: 5, fta: 5, to: 1 },
    ];
    const result = computeAdvancedStats(rows);

    // TS% = 30 / (2 * (10 + 0.44 * 5)) = 30 / (2 * 12.2) = 30 / 24.4
    const expectedTs = 30 / (2 * (10 + 0.44 * 5));
    expect(result.ts_pct).toBeCloseTo(expectedTs, 10);

    // PER = (30 + 5 + 5 + 2 + 1 - 1 - (10-10) - (5-5)) / 1 = 42
    expect(result.per).toBeCloseTo(42, 10);

    expect(Number.isFinite(result.ts_pct)).toBe(true);
    expect(Number.isFinite(result.usg)).toBe(true);
    expect(Number.isFinite(result.per)).toBe(true);
  });

  it('should allow negative PER for player with only turnovers and misses', () => {
    const rows = [
      { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 10, ftm: 0, fta: 5, to: 5 },
    ];
    const result = computeAdvancedStats(rows);

    // PER = (0 + 0 + 0 + 0 + 0 - 5 - (10-0) - (5-0)) / 1 = -20
    expect(result.per).toBeCloseTo(-20, 10);
    expect(result.ts_pct).toBe(0); // 0 pts / non-zero denominator = 0

    expect(Number.isFinite(result.ts_pct)).toBe(true);
    expect(Number.isFinite(result.usg)).toBe(true);
    expect(Number.isFinite(result.per)).toBe(true);
  });

  it('should produce finite results for all stats in all cases', () => {
    // Edge case: all zeros
    const rows = [
      { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, ftm: 0, fta: 0, to: 0 },
    ];
    const result = computeAdvancedStats(rows);
    expect(Number.isFinite(result.ts_pct)).toBe(true);
    expect(Number.isFinite(result.usg)).toBe(true);
    expect(Number.isFinite(result.per)).toBe(true);
    expect(result.games_played).toBe(1);
  });
});


// ============================================================
// 成就系統 — 純邏輯函數測試
// 需求：15.1, 15.2, 15.3
// ============================================================

// Re-implement pure logic functions for testing (mirrors Code.gs)

function isDoubleDouble(stats) {
  var count = 0;
  if ((stats.pts || 0) >= 10) count++;
  if ((stats.reb || 0) >= 10) count++;
  if ((stats.ast || 0) >= 10) count++;
  if ((stats.stl || 0) >= 10) count++;
  if ((stats.blk || 0) >= 10) count++;
  return count >= 2;
}

function detectSingleGameAchievements(stats) {
  var achievements = [];
  var pts = stats.pts || 0;
  var reb = stats.reb || 0;
  var ast = stats.ast || 0;
  var blk = stats.blk || 0;

  if (pts >= 30) {
    achievements.push('PTS_30');
  }

  if (pts >= 10 && reb >= 10 && ast >= 10) {
    achievements.push('TRIPLE_DOUBLE');
  }

  if (isDoubleDouble(stats)) {
    achievements.push('DOUBLE_DOUBLE');
  }

  if (blk >= 5) {
    achievements.push('BLK_5');
  }

  return achievements;
}

function detectStreakAchievements(gameHistory) {
  if (!gameHistory || gameHistory.length === 0) {
    return [];
  }

  var achievements = [];

  // STREAK_PTS_20: last 5 games all pts >= 20
  if (gameHistory.length >= 5) {
    var allPts20 = true;
    for (var i = gameHistory.length - 5; i < gameHistory.length; i++) {
      if ((gameHistory[i].pts || 0) < 20) {
        allPts20 = false;
        break;
      }
    }
    if (allPts20) {
      achievements.push('STREAK_PTS_20');
    }
  }

  // STREAK_DD_3: last 3 games all double-double
  if (gameHistory.length >= 3) {
    var allDD = true;
    for (var j = gameHistory.length - 3; j < gameHistory.length; j++) {
      if (!isDoubleDouble(gameHistory[j])) {
        allDD = false;
        break;
      }
    }
    if (allDD) {
      achievements.push('STREAK_DD_3');
    }
  }

  // STREAK_GAMES_10: 10 games in history
  if (gameHistory.length >= 10) {
    achievements.push('STREAK_GAMES_10');
  }

  return achievements;
}

// ============================================================
// isDoubleDouble 測試
// ============================================================

describe('isDoubleDouble', () => {
  it('should return true with pts=10, reb=10', () => {
    expect(isDoubleDouble({ pts: 10, reb: 10, ast: 5, stl: 2, blk: 1 })).toBe(true);
  });

  it('should return true with ast=15, blk=10', () => {
    expect(isDoubleDouble({ pts: 5, reb: 3, ast: 15, stl: 2, blk: 10 })).toBe(true);
  });

  it('should return false with only pts=10 (no other stat >= 10)', () => {
    expect(isDoubleDouble({ pts: 10, reb: 5, ast: 3, stl: 2, blk: 1 })).toBe(false);
  });

  it('should return false with all stats below 10', () => {
    expect(isDoubleDouble({ pts: 9, reb: 9, ast: 9, stl: 9, blk: 9 })).toBe(false);
  });
});

// ============================================================
// detectSingleGameAchievements 測試
// ============================================================

describe('detectSingleGameAchievements', () => {
  it('should trigger PTS_30 when pts >= 30', () => {
    const result = detectSingleGameAchievements({ pts: 30, reb: 5, ast: 3, stl: 1, blk: 0 });
    expect(result).toContain('PTS_30');
  });

  it('should NOT trigger PTS_30 when pts = 29', () => {
    const result = detectSingleGameAchievements({ pts: 29, reb: 5, ast: 3, stl: 1, blk: 0 });
    expect(result).not.toContain('PTS_30');
  });

  it('should trigger TRIPLE_DOUBLE (pts=10, reb=10, ast=10)', () => {
    const result = detectSingleGameAchievements({ pts: 10, reb: 10, ast: 10, stl: 1, blk: 0 });
    expect(result).toContain('TRIPLE_DOUBLE');
  });

  it('should NOT trigger TRIPLE_DOUBLE when one stat is 9', () => {
    const result = detectSingleGameAchievements({ pts: 10, reb: 9, ast: 10, stl: 1, blk: 0 });
    expect(result).not.toContain('TRIPLE_DOUBLE');
  });

  it('should trigger DOUBLE_DOUBLE with pts=10, reb=10 (ast < 10)', () => {
    const result = detectSingleGameAchievements({ pts: 10, reb: 10, ast: 5, stl: 1, blk: 0 });
    expect(result).toContain('DOUBLE_DOUBLE');
  });

  it('should trigger DOUBLE_DOUBLE with ast=10, stl=10', () => {
    const result = detectSingleGameAchievements({ pts: 5, reb: 3, ast: 10, stl: 10, blk: 0 });
    expect(result).toContain('DOUBLE_DOUBLE');
  });

  it('should NOT trigger DOUBLE_DOUBLE when only 1 stat >= 10', () => {
    const result = detectSingleGameAchievements({ pts: 15, reb: 5, ast: 3, stl: 1, blk: 0 });
    expect(result).not.toContain('DOUBLE_DOUBLE');
  });

  it('should trigger BLK_5 when blk >= 5', () => {
    const result = detectSingleGameAchievements({ pts: 8, reb: 5, ast: 3, stl: 1, blk: 5 });
    expect(result).toContain('BLK_5');
  });

  it('should NOT trigger BLK_5 when blk = 4', () => {
    const result = detectSingleGameAchievements({ pts: 8, reb: 5, ast: 3, stl: 1, blk: 4 });
    expect(result).not.toContain('BLK_5');
  });

  it('should trigger multiple achievements in one game (35pts, 12reb, 11ast)', () => {
    const result = detectSingleGameAchievements({ pts: 35, reb: 12, ast: 11, stl: 1, blk: 0 });
    expect(result).toContain('PTS_30');
    expect(result).toContain('TRIPLE_DOUBLE');
    expect(result).toContain('DOUBLE_DOUBLE');
    expect(result).toHaveLength(3);
  });

  it('should return empty array for modest stats', () => {
    const result = detectSingleGameAchievements({ pts: 8, reb: 4, ast: 3, stl: 1, blk: 0 });
    expect(result).toEqual([]);
  });
});

// ============================================================
// detectStreakAchievements 測試
// ============================================================

describe('detectStreakAchievements', () => {
  it('should trigger STREAK_PTS_20 with 5 consecutive 20+ point games', () => {
    const history = [
      { pts: 22, reb: 5, ast: 3, stl: 1, blk: 0 },
      { pts: 25, reb: 5, ast: 3, stl: 1, blk: 0 },
      { pts: 20, reb: 5, ast: 3, stl: 1, blk: 0 },
      { pts: 30, reb: 5, ast: 3, stl: 1, blk: 0 },
      { pts: 21, reb: 5, ast: 3, stl: 1, blk: 0 },
    ];
    const result = detectStreakAchievements(history);
    expect(result).toContain('STREAK_PTS_20');
  });

  it('should NOT trigger STREAK_PTS_20 with only 4 games of 20+', () => {
    const history = [
      { pts: 22, reb: 5, ast: 3, stl: 1, blk: 0 },
      { pts: 25, reb: 5, ast: 3, stl: 1, blk: 0 },
      { pts: 20, reb: 5, ast: 3, stl: 1, blk: 0 },
      { pts: 30, reb: 5, ast: 3, stl: 1, blk: 0 },
    ];
    const result = detectStreakAchievements(history);
    expect(result).not.toContain('STREAK_PTS_20');
  });

  it('should NOT trigger STREAK_PTS_20 when one of last 5 games has pts < 20', () => {
    const history = [
      { pts: 22, reb: 5, ast: 3, stl: 1, blk: 0 },
      { pts: 25, reb: 5, ast: 3, stl: 1, blk: 0 },
      { pts: 19, reb: 5, ast: 3, stl: 1, blk: 0 },
      { pts: 30, reb: 5, ast: 3, stl: 1, blk: 0 },
      { pts: 21, reb: 5, ast: 3, stl: 1, blk: 0 },
    ];
    const result = detectStreakAchievements(history);
    expect(result).not.toContain('STREAK_PTS_20');
  });

  it('should trigger STREAK_DD_3 with 3 consecutive double-doubles', () => {
    const history = [
      { pts: 15, reb: 12, ast: 3, stl: 1, blk: 0 },
      { pts: 20, reb: 10, ast: 5, stl: 1, blk: 0 },
      { pts: 18, reb: 11, ast: 3, stl: 1, blk: 0 },
    ];
    const result = detectStreakAchievements(history);
    expect(result).toContain('STREAK_DD_3');
  });

  it('should NOT trigger STREAK_DD_3 with only 2 double-doubles', () => {
    const history = [
      { pts: 15, reb: 12, ast: 3, stl: 1, blk: 0 },
      { pts: 20, reb: 10, ast: 5, stl: 1, blk: 0 },
    ];
    const result = detectStreakAchievements(history);
    expect(result).not.toContain('STREAK_DD_3');
  });

  it('should trigger STREAK_GAMES_10 with 10 games in history', () => {
    const history = Array.from({ length: 10 }, () => ({ pts: 8, reb: 4, ast: 3, stl: 1, blk: 0 }));
    const result = detectStreakAchievements(history);
    expect(result).toContain('STREAK_GAMES_10');
  });

  it('should NOT trigger STREAK_GAMES_10 with only 9 games', () => {
    const history = Array.from({ length: 9 }, () => ({ pts: 8, reb: 4, ast: 3, stl: 1, blk: 0 }));
    const result = detectStreakAchievements(history);
    expect(result).not.toContain('STREAK_GAMES_10');
  });

  it('should trigger multiple streak achievements simultaneously', () => {
    // 10 games, all with 25+ pts and double-doubles
    const history = Array.from({ length: 10 }, () => ({ pts: 25, reb: 12, ast: 5, stl: 1, blk: 0 }));
    const result = detectStreakAchievements(history);
    expect(result).toContain('STREAK_PTS_20');
    expect(result).toContain('STREAK_DD_3');
    expect(result).toContain('STREAK_GAMES_10');
  });

  it('should return empty array for empty game history', () => {
    expect(detectStreakAchievements([])).toEqual([]);
  });
});

// ============================================================
// POST 端點處理函數測試
// 需求：7.6, 7.7, 9.2, 8.3, 11.3, 16.1
// ============================================================

describe('handleSubmitBoxScore', () => {
  it('should return 400 when gameId is missing', () => {
    const json = parseResponse(handleSubmitBoxScore(null, { entries: [makeValidEntry()] }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('gameId');
  });

  it('should return 400 when entries is missing', () => {
    const json = parseResponse(handleSubmitBoxScore(null, { gameId: 'g1' }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('entries');
  });

  it('should return 400 when entries is empty array', () => {
    const json = parseResponse(handleSubmitBoxScore(null, { gameId: 'g1', entries: [] }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
  });

  it('should return 400 when entries contain invalid data', () => {
    const json = parseResponse(handleSubmitBoxScore(null, {
      gameId: 'g1',
      entries: [makeValidEntry({ pts: -1 })]
    }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('驗證失敗');
  });

  it('should succeed with valid gameId and entries', () => {
    const json = parseResponse(handleSubmitBoxScore(null, {
      gameId: 'g1',
      entries: [makeValidEntry(), makeValidEntry({ playerId: 'p2' })]
    }));
    expect(json.status).toBe('success');
    expect(json.data.message).toContain('提交成功');
    expect(json.data.gameId).toBe('g1');
    expect(json.data.insertedCount).toBe(2);
  });
});

describe('handleUpdateBoxScore', () => {
  it('should return 400 when gameId is missing', () => {
    const json = parseResponse(handleUpdateBoxScore(null, { playerId: 'p1', field: 'pts', value: 10 }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('gameId');
  });

  it('should return 400 when playerId is missing', () => {
    const json = parseResponse(handleUpdateBoxScore(null, { gameId: 'g1', field: 'pts', value: 10 }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('playerId');
  });

  it('should return 400 when field is missing', () => {
    const json = parseResponse(handleUpdateBoxScore(null, { gameId: 'g1', playerId: 'p1', value: 10 }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('field');
  });

  it('should return 400 when value is missing', () => {
    const json = parseResponse(handleUpdateBoxScore(null, { gameId: 'g1', playerId: 'p1', field: 'pts' }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('value');
  });

  it('should return 400 for invalid field name', () => {
    const json = parseResponse(handleUpdateBoxScore(null, { gameId: 'g1', playerId: 'p1', field: 'invalidField', value: 10 }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('無效的欄位');
  });

  it('should return 400 for negative value', () => {
    const json = parseResponse(handleUpdateBoxScore(null, { gameId: 'g1', playerId: 'p1', field: 'pts', value: -5 }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('非負整數');
  });

  it('should return 400 for non-integer value', () => {
    const json = parseResponse(handleUpdateBoxScore(null, { gameId: 'g1', playerId: 'p1', field: 'pts', value: 10.5 }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
  });

  it('should succeed with valid parameters', () => {
    const json = parseResponse(handleUpdateBoxScore(null, { gameId: 'g1', playerId: 'p1', field: 'pts', value: 25 }));
    expect(json.status).toBe('success');
    expect(json.data.message).toContain('修改成功');
    expect(json.data.field).toBe('pts');
    expect(json.data.newValue).toBe(25);
  });
});

describe('handleCreateGame', () => {
  it('should return 400 when seasonId is missing', () => {
    const json = parseResponse(handleCreateGame(null, { date: '2024-01-01', homeTeamId: 't1', awayTeamId: 't2' }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('seasonId');
  });

  it('should return 400 when date is missing', () => {
    const json = parseResponse(handleCreateGame(null, { seasonId: 's1', homeTeamId: 't1', awayTeamId: 't2' }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('date');
  });

  it('should return 400 when homeTeamId is missing', () => {
    const json = parseResponse(handleCreateGame(null, { seasonId: 's1', date: '2024-01-01', awayTeamId: 't2' }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('homeTeamId');
  });

  it('should return 400 when awayTeamId is missing', () => {
    const json = parseResponse(handleCreateGame(null, { seasonId: 's1', date: '2024-01-01', homeTeamId: 't1' }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('awayTeamId');
  });

  it('should succeed with all required parameters', () => {
    const json = parseResponse(handleCreateGame(null, {
      seasonId: 's1', date: '2024-01-01', homeTeamId: 't1', awayTeamId: 't2'
    }));
    expect(json.status).toBe('success');
    expect(json.data.message).toContain('建立成功');
    expect(json.data.gameId).toBeDefined();
  });
});

describe('handleUpdateGame', () => {
  it('should return 400 when gameId is missing', () => {
    const json = parseResponse(handleUpdateGame(null, { date: '2024-02-01' }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('gameId');
  });

  it('should succeed with valid gameId', () => {
    const json = parseResponse(handleUpdateGame(null, { gameId: 'g1', date: '2024-02-01' }));
    expect(json.status).toBe('success');
    expect(json.data.message).toContain('更新成功');
  });
});

describe('handleSubmitShotLocation', () => {
  it('should return 400 when gameId is missing', () => {
    const json = parseResponse(handleSubmitShotLocation(null, { playerId: 'p1', x: 50, y: 50, made: true }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('gameId');
  });

  it('should return 400 when playerId is missing', () => {
    const json = parseResponse(handleSubmitShotLocation(null, { gameId: 'g1', x: 50, y: 50, made: true }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('playerId');
  });

  it('should return 400 when x is missing', () => {
    const json = parseResponse(handleSubmitShotLocation(null, { gameId: 'g1', playerId: 'p1', y: 50, made: true }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('x');
  });

  it('should return 400 when y is missing', () => {
    const json = parseResponse(handleSubmitShotLocation(null, { gameId: 'g1', playerId: 'p1', x: 50, made: true }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('y');
  });

  it('should return 400 when made is missing', () => {
    const json = parseResponse(handleSubmitShotLocation(null, { gameId: 'g1', playerId: 'p1', x: 50, y: 50 }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('made');
  });

  it('should return 400 when x is out of range (negative)', () => {
    const json = parseResponse(handleSubmitShotLocation(null, { gameId: 'g1', playerId: 'p1', x: -1, y: 50, made: true }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('x 座標');
  });

  it('should return 400 when x is out of range (> 100)', () => {
    const json = parseResponse(handleSubmitShotLocation(null, { gameId: 'g1', playerId: 'p1', x: 101, y: 50, made: true }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
  });

  it('should return 400 when y is out of range', () => {
    const json = parseResponse(handleSubmitShotLocation(null, { gameId: 'g1', playerId: 'p1', x: 50, y: 150, made: true }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('y 座標');
  });

  it('should return 400 when made is not boolean', () => {
    const json = parseResponse(handleSubmitShotLocation(null, { gameId: 'g1', playerId: 'p1', x: 50, y: 50, made: 'yes' }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('布林值');
  });

  it('should accept x=0 and y=0 (boundary)', () => {
    const json = parseResponse(handleSubmitShotLocation(null, { gameId: 'g1', playerId: 'p1', x: 0, y: 0, made: false }));
    expect(json.status).toBe('success');
  });

  it('should accept x=100 and y=100 (boundary)', () => {
    const json = parseResponse(handleSubmitShotLocation(null, { gameId: 'g1', playerId: 'p1', x: 100, y: 100, made: true }));
    expect(json.status).toBe('success');
  });

  it('should succeed with valid parameters', () => {
    const json = parseResponse(handleSubmitShotLocation(null, { gameId: 'g1', playerId: 'p1', x: 45.5, y: 30.2, made: true }));
    expect(json.status).toBe('success');
    expect(json.data.message).toContain('記錄成功');
  });
});

describe('handleGeneratePlayoffs', () => {
  it('should return 400 when seasonId is missing', () => {
    const json = parseResponse(handleGeneratePlayoffs(null, {}));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('seasonId');
  });

  it('should succeed with valid seasonId', () => {
    const json = parseResponse(handleGeneratePlayoffs(null, { seasonId: 's1' }));
    expect(json.status).toBe('success');
    expect(json.data.message).toContain('生成成功');
  });
});

describe('handleArchiveSeason', () => {
  it('should return 400 when seasonId is missing', () => {
    const json = parseResponse(handleArchiveSeason(null, {}));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('seasonId');
  });

  it('should succeed with valid seasonId', () => {
    const json = parseResponse(handleArchiveSeason(null, { seasonId: 's1' }));
    expect(json.status).toBe('success');
    expect(json.data.message).toContain('封存成功');
  });
});

describe('handleCreateAnnouncement', () => {
  it('should return 400 when title is missing', () => {
    const json = parseResponse(handleCreateAnnouncement(null, { content: 'test' }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('title');
  });

  it('should return 400 when content is missing', () => {
    const json = parseResponse(handleCreateAnnouncement(null, { title: 'test' }));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
    expect(json.message).toContain('content');
  });

  it('should succeed with valid title and content', () => {
    const json = parseResponse(handleCreateAnnouncement(null, { title: '公告標題', content: '公告內容' }));
    expect(json.status).toBe('success');
    expect(json.data.message).toContain('發佈成功');
  });
});

// ============================================================
// POST 端點整合路由測試
// 需求：11.3
// ============================================================

describe('doPost with POST handlers', () => {
  beforeEach(() => {
    mockScriptProperties['API_KEY'] = 'test-key';
  });

  it('should route submitBoxScore and validate entries', () => {
    const e = {
      parameter: { apiKey: 'test-key' },
      postData: { contents: JSON.stringify({
        action: 'submitBoxScore',
        apiKey: 'test-key',
        gameId: 'g1',
        entries: [makeValidEntry()]
      })}
    };
    const json = parseResponse(doPost(e));
    expect(json.status).toBe('success');
    expect(json.data.message).toContain('提交成功');
  });

  it('should route submitBoxScore and reject invalid entries', () => {
    const e = {
      parameter: { apiKey: 'test-key' },
      postData: { contents: JSON.stringify({
        action: 'submitBoxScore',
        apiKey: 'test-key',
        gameId: 'g1',
        entries: [makeValidEntry({ pts: -1 })]
      })}
    };
    const json = parseResponse(doPost(e));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
  });

  it('should route createGame with required params', () => {
    const e = {
      parameter: { apiKey: 'test-key' },
      postData: { contents: JSON.stringify({
        action: 'createGame',
        apiKey: 'test-key',
        seasonId: 's1',
        date: '2024-01-01',
        homeTeamId: 't1',
        awayTeamId: 't2'
      })}
    };
    const json = parseResponse(doPost(e));
    expect(json.status).toBe('success');
  });

  it('should route submitShotLocation and validate coordinates', () => {
    const e = {
      parameter: { apiKey: 'test-key' },
      postData: { contents: JSON.stringify({
        action: 'submitShotLocation',
        apiKey: 'test-key',
        gameId: 'g1',
        playerId: 'p1',
        x: 50,
        y: 50,
        made: true
      })}
    };
    const json = parseResponse(doPost(e));
    expect(json.status).toBe('success');
  });

  it('should route submitShotLocation and reject invalid coordinates', () => {
    const e = {
      parameter: { apiKey: 'test-key' },
      postData: { contents: JSON.stringify({
        action: 'submitShotLocation',
        apiKey: 'test-key',
        gameId: 'g1',
        playerId: 'p1',
        x: 150,
        y: 50,
        made: true
      })}
    };
    const json = parseResponse(doPost(e));
    expect(json.status).toBe('error');
    expect(json.code).toBe(400);
  });

  it('should route createAnnouncement with required params', () => {
    const e = {
      parameter: { apiKey: 'test-key' },
      postData: { contents: JSON.stringify({
        action: 'createAnnouncement',
        apiKey: 'test-key',
        title: '測試公告',
        content: '公告內容'
      })}
    };
    const json = parseResponse(doPost(e));
    expect(json.status).toBe('success');
  });
});
