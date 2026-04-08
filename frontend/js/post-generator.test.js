/**
 * ALL-IN Basketball League — post-generator.js 單元測試
 * 驗證社交文案生成器的 3 種風格模板及雙語生成功能
 */
const PostGenerator = require('./post-generator.js');
const { describe, it, expect } = require('vitest');

const sampleGame = {
  date: '2024-01-15',
  homeTeamName: 'Thunder Dragons',
  awayTeamName: 'Fire Phoenix',
  homeScore: 78,
  awayScore: 65,
  mvp: { name: '陳大文', pts: 25, reb: 8, ast: 5 }
};

describe('PostGenerator.styles', () => {
  it('should expose 3 styles', () => {
    expect(PostGenerator.styles).toEqual(['formal', 'casual', 'analytics']);
  });
});

describe('PostGenerator.generate', () => {
  it('should generate formal Chinese post with all required content', () => {
    var post = PostGenerator.generate(sampleGame, 'formal', 'zh-TW');
    expect(post).toContain('2024-01-15');
    expect(post).toContain('Thunder Dragons');
    expect(post).toContain('Fire Phoenix');
    expect(post).toContain('78');
    expect(post).toContain('65');
    expect(post).toContain('陳大文');
    expect(post).toContain('25');
    expect(post).toContain('#ALLINBasketball');
  });

  it('should generate formal English post with all required content', () => {
    var post = PostGenerator.generate(sampleGame, 'formal', 'en');
    expect(post).toContain('2024-01-15');
    expect(post).toContain('Thunder Dragons');
    expect(post).toContain('Fire Phoenix');
    expect(post).toContain('78');
    expect(post).toContain('65');
    expect(post).toContain('陳大文');
    expect(post).toContain('#ALLINBasketball');
  });

  it('should generate casual style post', () => {
    var post = PostGenerator.generate(sampleGame, 'casual', 'zh-TW');
    expect(post).toContain('Thunder Dragons');
    expect(post).toContain('78');
    expect(post).toContain('🔥');
    expect(post).toContain('#ALLINBasketball');
  });

  it('should generate analytics style post', () => {
    var post = PostGenerator.generate(sampleGame, 'analytics', 'zh-TW');
    expect(post).toContain('📊');
    expect(post).toContain('Thunder Dragons');
    expect(post).toContain('78');
    expect(post).toContain('陳大文');
    expect(post).toContain('#ALLINBasketball');
  });

  it('should handle game with no MVP', () => {
    var game = { ...sampleGame, mvp: null };
    var post = PostGenerator.generate(game, 'formal', 'zh-TW');
    expect(post).toContain('78');
    expect(post).toContain('65');
    expect(post).not.toContain('MVP');
  });

  it('should default to formal style for unknown style', () => {
    var post = PostGenerator.generate(sampleGame, 'unknown', 'zh-TW');
    expect(post).toContain('賽果報告');
  });

  it('should handle tied game', () => {
    var game = { ...sampleGame, homeScore: 70, awayScore: 70 };
    var post = PostGenerator.generate(game, 'formal', 'zh-TW');
    expect(post).toContain('70');
    expect(post).toContain('平手');
  });
});

describe('PostGenerator.generateBilingual', () => {
  it('should return both zh and en versions', () => {
    var result = PostGenerator.generateBilingual(sampleGame, 'formal');
    expect(result).toHaveProperty('zh');
    expect(result).toHaveProperty('en');
    expect(typeof result.zh).toBe('string');
    expect(typeof result.en).toBe('string');
  });

  it('should contain same score data in both versions', () => {
    var result = PostGenerator.generateBilingual(sampleGame, 'formal');
    expect(result.zh).toContain('78');
    expect(result.en).toContain('78');
    expect(result.zh).toContain('65');
    expect(result.en).toContain('65');
  });

  it('should contain same team names in both versions', () => {
    var result = PostGenerator.generateBilingual(sampleGame, 'casual');
    expect(result.zh).toContain('Thunder Dragons');
    expect(result.en).toContain('Thunder Dragons');
  });
});

describe('PostGenerator._findBestPlayer', () => {
  it('should find the top scorer from box score', () => {
    var boxScore = {
      homeStats: [
        { playerName: 'A', pts: 20, reb: 5, ast: 3 },
        { playerName: 'B', pts: 30, reb: 2, ast: 1 }
      ],
      awayStats: [
        { playerName: 'C', pts: 15, reb: 10, ast: 2 }
      ]
    };
    var best = PostGenerator._findBestPlayer(boxScore);
    expect(best.name).toBe('B');
    expect(best.pts).toBe(30);
  });

  it('should return null for empty box score', () => {
    expect(PostGenerator._findBestPlayer(null)).toBeNull();
    expect(PostGenerator._findBestPlayer({ homeStats: [], awayStats: [] })).toBeNull();
  });
});
