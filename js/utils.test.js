/**
 * ALL-IN Basketball League — utils.js 單元測試
 * 驗證 ID 生成、日期格式化、數值格式化等通用工具函數
 */
const Utils = require('./utils.js');
const { describe, it, expect } = require('vitest');

describe('Utils.generateId', () => {
  it('should return a non-empty string', () => {
    const id = Utils.generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should return a valid UUID v4 format', () => {
    const id = Utils.generateId();
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(id).toMatch(uuidV4Regex);
  });

  it('should generate unique IDs across multiple calls', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(Utils.generateId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('Utils.formatDate', () => {
  it('should format YYYY-MM-DD to Chinese date format', () => {
    expect(Utils.formatDate('2024-01-15')).toBe('2024年1月15日');
  });

  it('should handle single-digit month and day without leading zeros', () => {
    expect(Utils.formatDate('2024-03-05')).toBe('2024年3月5日');
  });

  it('should return empty string for null/undefined', () => {
    expect(Utils.formatDate(null)).toBe('');
    expect(Utils.formatDate(undefined)).toBe('');
  });

  it('should return empty string for non-string input', () => {
    expect(Utils.formatDate(12345)).toBe('');
  });

  it('should return original string for invalid date format', () => {
    expect(Utils.formatDate('not-a-date')).toBe('not-a-date');
    expect(Utils.formatDate('2024/01/15')).toBe('2024/01/15');
  });
});

describe('Utils.formatNumber', () => {
  it('should format number with default 1 decimal place', () => {
    expect(Utils.formatNumber(25.678)).toBe('25.7');
  });

  it('should format number with specified decimal places', () => {
    expect(Utils.formatNumber(25.678, 2)).toBe('25.68');
    expect(Utils.formatNumber(25.678, 0)).toBe('26');
  });

  it('should return "0" for null/undefined/NaN', () => {
    expect(Utils.formatNumber(null)).toBe('0');
    expect(Utils.formatNumber(undefined)).toBe('0');
    expect(Utils.formatNumber(NaN)).toBe('0');
  });

  it('should return "0" for Infinity', () => {
    expect(Utils.formatNumber(Infinity)).toBe('0');
    expect(Utils.formatNumber(-Infinity)).toBe('0');
  });

  it('should handle zero correctly', () => {
    expect(Utils.formatNumber(0)).toBe('0.0');
    expect(Utils.formatNumber(0, 2)).toBe('0.00');
  });
});

describe('Utils.formatPercentage', () => {
  it('should format decimal as percentage', () => {
    expect(Utils.formatPercentage(0.456)).toBe('45.6%');
  });

  it('should format with specified decimal places', () => {
    expect(Utils.formatPercentage(0.456, 2)).toBe('45.60%');
  });

  it('should handle zero', () => {
    expect(Utils.formatPercentage(0)).toBe('0.0%');
  });

  it('should handle 1.0 (100%)', () => {
    expect(Utils.formatPercentage(1.0)).toBe('100.0%');
  });

  it('should return "0.0%" for null/undefined/NaN', () => {
    expect(Utils.formatPercentage(null)).toBe('0.0%');
    expect(Utils.formatPercentage(undefined)).toBe('0.0%');
    expect(Utils.formatPercentage(NaN)).toBe('0.0%');
  });
});

describe('Utils.formatGameScore', () => {
  it('should format home and away scores', () => {
    expect(Utils.formatGameScore(78, 65)).toBe('78 - 65');
  });

  it('should handle zero scores', () => {
    expect(Utils.formatGameScore(0, 0)).toBe('0 - 0');
  });

  it('should default to 0 for null/undefined', () => {
    expect(Utils.formatGameScore(null, 65)).toBe('0 - 65');
    expect(Utils.formatGameScore(78, undefined)).toBe('78 - 0');
  });
});
