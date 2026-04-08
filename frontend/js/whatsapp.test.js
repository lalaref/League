/**
 * ALL-IN Basketball League — whatsapp.js 單元測試
 * 驗證 WhatsApp 分享模組的訊息格式化、電話驗證及批量分享功能
 */
const WhatsAppShare = require('./whatsapp.js');
const { describe, it, expect, vi, beforeEach } = require('vitest');

const sampleGame = {
  date: '2024-01-15',
  homeTeamName: 'Thunder Dragons',
  awayTeamName: 'Fire Phoenix',
  homeScore: 78,
  awayScore: 65
};

const sampleBoxScore = {
  homeStats: [
    { playerName: '陳大文', number: 7, pts: 25, reb: 8, ast: 5 },
    { playerName: '李小明', number: 11, pts: 18, reb: 3, ast: 7 }
  ],
  awayStats: [
    { playerName: '王五', number: 3, pts: 20, reb: 10, ast: 2 }
  ]
};

const sampleTeams = [
  { id: 'team1', name: 'Thunder Dragons', captainWhatsApp: '85291234567' },
  { id: 'team2', name: 'Fire Phoenix', captainWhatsApp: '85298765432' },
  { id: 'team3', name: 'No Phone Team', captainWhatsApp: '' }
];

describe('WhatsAppShare.formatGameMessage', () => {
  it('should include date, teams, and score', () => {
    var msg = WhatsAppShare.formatGameMessage(sampleGame, null);
    expect(msg).toContain('2024-01-15');
    expect(msg).toContain('Thunder Dragons');
    expect(msg).toContain('Fire Phoenix');
    expect(msg).toContain('78');
    expect(msg).toContain('65');
  });

  it('should include Box Score summary when provided', () => {
    var msg = WhatsAppShare.formatGameMessage(sampleGame, sampleBoxScore);
    expect(msg).toContain('Box Score');
    expect(msg).toContain('陳大文');
    expect(msg).toContain('25');
  });

  it('should show top 3 players per team sorted by points', () => {
    var msg = WhatsAppShare.formatGameMessage(sampleGame, sampleBoxScore);
    // Home team: 陳大文 (25) should appear before 李小明 (18)
    var chenIdx = msg.indexOf('陳大文');
    var liIdx = msg.indexOf('李小明');
    expect(chenIdx).toBeLessThan(liIdx);
  });

  it('should handle null box score gracefully', () => {
    var msg = WhatsAppShare.formatGameMessage(sampleGame, null);
    expect(msg).toContain('ALL-IN Basketball League');
    expect(msg).not.toContain('Box Score');
  });
});

describe('WhatsAppShare.formatScheduleMessage', () => {
  var games = [
    { date: '2024-02-01', time: '19:00', venue: '修頓球場', homeTeamId: 'team1', awayTeamId: 'team2', awayTeamName: 'Fire Phoenix' },
    { date: '2024-02-08', time: '20:00', venue: '維多利亞公園', homeTeamId: 'team3', awayTeamId: 'team1', homeTeamName: 'No Phone Team' }
  ];

  it('should include date, time, venue, and opponent for each game', () => {
    var msg = WhatsAppShare.formatScheduleMessage('team1', games);
    expect(msg).toContain('2024-02-01');
    expect(msg).toContain('19:00');
    expect(msg).toContain('修頓球場');
    expect(msg).toContain('Fire Phoenix');
    expect(msg).toContain('2024-02-08');
    expect(msg).toContain('No Phone Team');
  });

  it('should indicate home/away status', () => {
    var msg = WhatsAppShare.formatScheduleMessage('team1', games);
    expect(msg).toContain('(主場)');
    expect(msg).toContain('(客場)');
  });

  it('should handle empty games list', () => {
    var msg = WhatsAppShare.formatScheduleMessage('team1', []);
    expect(msg).toContain('暫無');
  });
});

describe('WhatsAppShare.openChat', () => {
  beforeEach(() => {
    // Mock window.open
    global.window = { open: vi.fn() };
  });

  it('should open wa.me link with correct format', () => {
    WhatsAppShare.openChat('85291234567', 'Hello');
    expect(window.open).toHaveBeenCalledWith(
      'https://wa.me/85291234567?text=Hello',
      '_blank'
    );
  });

  it('should URL-encode the message', () => {
    WhatsAppShare.openChat('85291234567', 'Hello World!');
    var call = window.open.mock.calls[0][0];
    expect(call).toContain('Hello%20World!');
  });

  it('should strip non-numeric characters from phone number', () => {
    WhatsAppShare.openChat('+852-9123-4567', 'Hi');
    expect(window.open).toHaveBeenCalledWith(
      'https://wa.me/85291234567?text=Hi',
      '_blank'
    );
  });

  it('should not open if phone number is empty', () => {
    WhatsAppShare.openChat('', 'Hi');
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe('WhatsAppShare.validatePhoneNumber', () => {
  it('should return valid with phone for team with WhatsApp number', () => {
    var result = WhatsAppShare.validatePhoneNumber('team1', sampleTeams);
    expect(result.valid).toBe(true);
    expect(result.phone).toBe('85291234567');
  });

  it('should return invalid for team without WhatsApp number', () => {
    var result = WhatsAppShare.validatePhoneNumber('team3', sampleTeams);
    expect(result.valid).toBe(false);
  });

  it('should return invalid for non-existent team', () => {
    var result = WhatsAppShare.validatePhoneNumber('nonexistent', sampleTeams);
    expect(result.valid).toBe(false);
  });

  it('should strip non-numeric characters from phone', () => {
    var teams = [{ id: 't1', captainWhatsApp: '+852-9123-4567' }];
    var result = WhatsAppShare.validatePhoneNumber('t1', teams);
    expect(result.valid).toBe(true);
    expect(result.phone).toBe('85291234567');
  });
});

describe('WhatsAppShare.batchShare', () => {
  beforeEach(() => {
    global.window = { open: vi.fn() };
  });

  it('should send to teams with valid phone numbers', () => {
    var result = WhatsAppShare.batchShare(['team1', 'team2'], 'Hello', sampleTeams);
    expect(result.sent).toEqual(['team1', 'team2']);
    expect(result.skipped).toEqual([]);
    expect(window.open).toHaveBeenCalledTimes(2);
  });

  it('should skip teams without phone numbers', () => {
    var result = WhatsAppShare.batchShare(['team1', 'team3'], 'Hello', sampleTeams);
    expect(result.sent).toEqual(['team1']);
    expect(result.skipped).toEqual(['team3']);
  });

  it('should handle all teams having no phone', () => {
    var result = WhatsAppShare.batchShare(['team3'], 'Hello', sampleTeams);
    expect(result.sent).toEqual([]);
    expect(result.skipped).toEqual(['team3']);
  });

  it('should not miss any team in the list', () => {
    var result = WhatsAppShare.batchShare(['team1', 'team2', 'team3'], 'Hi', sampleTeams);
    expect(result.sent.length + result.skipped.length).toBe(3);
  });
});
