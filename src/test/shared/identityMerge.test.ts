import { describe, it, expect } from 'vitest';
import { mergeIdentityFromClubLadder, splitIdentityChanges, IDENTITY_FIELDS, isIdentityField } from '../../../shared/utils/identityMerge';
import { PlayerData } from '../../../shared/types';
import { createTestPlayer } from '../shared/factories';

function makePlayer(overrides: Partial<PlayerData>): PlayerData {
  return createTestPlayer(overrides);
}

describe('isIdentityField', () => {
  it('returns true for all identity fields', () => {
    for (const field of IDENTITY_FIELDS) {
      expect(isIdentityField(field)).toBe(true);
    }
  });

  it('returns false for non-identity fields', () => {
    expect(isIdentityField('nRating')).toBe(false);
    expect(isIdentityField('gameResults')).toBe(false);
    expect(isIdentityField('foo')).toBe(false);
  });
});

describe('mergeIdentityFromClubLadder', () => {
  it('replaces identity fields from club ladder', () => {
    const mg = [makePlayer({ rank: 1, lastName: 'Old', firstName: 'Name', rating: 1000, nRating: 1500, gameResults: ['W', 'L', null] })];
    const club = [makePlayer({ rank: 1, lastName: 'New', firstName: 'Player', rating: 1200 })];

    const result = mergeIdentityFromClubLadder(mg, club);

    expect(result[0].lastName).toBe('New');
    expect(result[0].firstName).toBe('Player');
    expect(result[0].rating).toBe(1200);
    // nRating preserved from mini-game
    expect(result[0].nRating).toBe(1500);
    // gameResults preserved from mini-game
    expect(result[0].gameResults).toEqual(['W', 'L', null]);
  });

  it('preserves game results from mini-game', () => {
    const mg = [makePlayer({ rank: 1, gameResults: ['W', 'W', 'L'] })];
    const club = [makePlayer({ rank: 1, gameResults: [null, null, null] })];

    const result = mergeIdentityFromClubLadder(mg, club);

    expect(result[0].gameResults).toEqual(['W', 'W', 'L']);
  });

  it('handles missing club players', () => {
    const mg = [makePlayer({ rank: 99, lastName: 'Only', nRating: 1300 })];
    const club: PlayerData[] = [];

    const result = mergeIdentityFromClubLadder(mg, club);

    expect(result[0].lastName).toBe('Only');
    expect(result[0].nRating).toBe(1300);
  });

  it('handles mixed club/non-club players', () => {
    const mg = [
      makePlayer({ rank: 1, lastName: 'InClub', nRating: 1100 }),
      makePlayer({ rank: 2, lastName: 'NotInClub', nRating: 1200 }),
    ];
    const club = [makePlayer({ rank: 1, lastName: 'ClubName' })];

    const result = mergeIdentityFromClubLadder(mg, club);

    expect(result[0].lastName).toBe('ClubName');
    expect(result[0].nRating).toBe(1100);
    expect(result[1].lastName).toBe('NotInClub');
    expect(result[1].nRating).toBe(1200);
  });

  it('does not merge nRating from club ladder', () => {
    const mg = [makePlayer({ rank: 1, nRating: 1600 })];
    const club = [makePlayer({ rank: 1, nRating: 900 })];

    const result = mergeIdentityFromClubLadder(mg, club);

    expect(result[0].nRating).toBe(1600);
  });

  it('handles empty mini-game players', () => {
    const mg: PlayerData[] = [];
    const club = [makePlayer({ rank: 1 })];

    const result = mergeIdentityFromClubLadder(mg, club);

    expect(result).toEqual([]);
  });

  it('handles both arrays empty', () => {
    const mg: PlayerData[] = [];
    const club: PlayerData[] = [];

    const result = mergeIdentityFromClubLadder(mg, club);

    expect(result).toEqual([]);
  });

  it('merges all identity fields (not just name)', () => {
    const mg = makePlayer({
      rank: 1, lastName: 'Old', firstName: 'Name', rating: 1000,
      grade: '3', phone: '111', school: 'OldSchool', room: '1A',
      trophyEligible: false, attendance: 5, num_games: 10,
      info: 'old info', group: 'B',
    });
    const club = [makePlayer({
      rank: 1, lastName: 'New', firstName: 'Player', rating: 1200,
      grade: '5', phone: '222', school: 'NewSchool', room: '2B',
      trophyEligible: true, attendance: 15, num_games: 20,
      info: 'new info', group: 'A',
    })];

    const result = mergeIdentityFromClubLadder([mg], club);

    expect(result[0].lastName).toBe('New');
    expect(result[0].firstName).toBe('Player');
    expect(result[0].rating).toBe(1200);
    expect(result[0].grade).toBe('5');
    expect(result[0].phone).toBe('222');
    expect(result[0].school).toBe('NewSchool');
    expect(result[0].room).toBe('2B');
    expect(result[0].trophyEligible).toBe(true);
    expect(result[0].attendance).toBe(15);
    expect(result[0].num_games).toBe(20);
    expect(result[0].info).toBe('new info');
    expect(result[0].group).toBe('A');
  });

  it('preserves mini-game gameResults when club has null results', () => {
    const mg = [makePlayer({ rank: 1, gameResults: ['W', 'L', 'W', null] })];
    const club = [makePlayer({ rank: 1, gameResults: [null, null, null, null] })];

    const result = mergeIdentityFromClubLadder(mg, club);

    expect(result[0].gameResults).toEqual(['W', 'L', 'W', null]);
  });

  it('uses club gameResults when mini-game has empty results', () => {
    const mg = [makePlayer({ rank: 1, gameResults: [null, null] })];
    const club = [makePlayer({ rank: 1, gameResults: ['W', 'L'] })];

    const result = mergeIdentityFromClubLadder(mg, club);

    // Mini-game results are truthy (array exists), so they stay
    expect(result[0].gameResults).toEqual([null, null]);
  });
});

describe('splitIdentityChanges', () => {
  it('detects identity changes', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', rating: 1200 })];
    const incoming = [makePlayer({ rank: 1, lastName: 'Jones', rating: 1200, nRating: 1500 })];

    const { identityUpdates, miniGamePlayers } = splitIdentityChanges(incoming, club);

    expect(identityUpdates.length).toBe(1);
    expect(identityUpdates[0].lastName).toBe('Jones');
    expect(miniGamePlayers.length).toBe(1);
    // Mini-game player gets club identity
    expect(miniGamePlayers[0].lastName).toBe('Smith');
    // But preserves incoming nRating
    expect(miniGamePlayers[0].nRating).toBe(1500);
  });

  it('returns empty for unchanged identity', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', rating: 1200 })];
    const incoming = [makePlayer({ rank: 1, lastName: 'Smith', rating: 1200, nRating: 1500 })];

    const { identityUpdates, miniGamePlayers } = splitIdentityChanges(incoming, club);

    expect(identityUpdates.length).toBe(0);
    expect(miniGamePlayers.length).toBe(1);
  });

  it('handles missing club snapshot', () => {
    const incoming = [makePlayer({ rank: 1, lastName: 'Smith' })];
    const club: PlayerData[] = [];

    const { identityUpdates, miniGamePlayers } = splitIdentityChanges(incoming, club);

    expect(identityUpdates.length).toBe(0);
    expect(miniGamePlayers.length).toBe(1);
    expect(miniGamePlayers[0].lastName).toBe('Smith');
  });

  it('game-only changes do not trigger identity update', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', rating: 1200 })];
    const incoming = [
      makePlayer({
        rank: 1,
        lastName: 'Smith',
        rating: 1200,
        nRating: 1600,
        gameResults: ['W', 'L', null],
      }),
    ];

    const { identityUpdates, miniGamePlayers } = splitIdentityChanges(incoming, club);

    expect(identityUpdates.length).toBe(0);
    expect(miniGamePlayers[0].gameResults).toEqual(['W', 'L', null]);
    expect(miniGamePlayers[0].nRating).toBe(1600);
  });

  it('nRating difference does not trigger identity update', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', nRating: 1200 })];
    const incoming = [makePlayer({ rank: 1, lastName: 'Smith', nRating: 1600 })];

    const { identityUpdates } = splitIdentityChanges(incoming, club);

    expect(identityUpdates.length).toBe(0);
  });

  it('preserves nRating and gameResults in miniGamePlayers', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', nRating: 900, gameResults: [null, null] })];
    const incoming = [makePlayer({ rank: 1, lastName: 'Jones', nRating: 1700, gameResults: ['W', 'L'] })];

    const { miniGamePlayers } = splitIdentityChanges(incoming, club);

    // Identity from club, nRating/gameResults from incoming
    expect(miniGamePlayers[0].lastName).toBe('Smith');
    expect(miniGamePlayers[0].nRating).toBe(1700);
    expect(miniGamePlayers[0].gameResults).toEqual(['W', 'L']);
  });

  it('IDENTITY_FIELDS excludes nRating', () => {
    expect(IDENTITY_FIELDS).not.toContain('nRating');
    expect(IDENTITY_FIELDS).toContain('rating');
    expect(IDENTITY_FIELDS).toContain('lastName');
    expect(IDENTITY_FIELDS).toContain('firstName');
  });

  it('handles multiple players with mixed changes', () => {
    const club = [
      makePlayer({ rank: 1, lastName: 'A', rating: 1200 }),
      makePlayer({ rank: 2, lastName: 'B', rating: 1300 }),
      makePlayer({ rank: 3, lastName: 'C', rating: 1400 }),
    ];
    const incoming = [
      makePlayer({ rank: 1, lastName: 'A_Changed', rating: 1200, nRating: 1500 }), // identity changed
      makePlayer({ rank: 2, lastName: 'B', rating: 1300, nRating: 1600 }), // identity same, nRating changed
      makePlayer({ rank: 3, lastName: 'C', rating: 1450, nRating: 1700 }), // rating changed (identity changed)
    ];

    const { identityUpdates, miniGamePlayers } = splitIdentityChanges(incoming, club);

    expect(identityUpdates.length).toBe(2);
    expect(identityUpdates[0].rank).toBe(1);
    expect(identityUpdates[1].rank).toBe(3);

    expect(miniGamePlayers.length).toBe(3);
    expect(miniGamePlayers[0].nRating).toBe(1500);
    expect(miniGamePlayers[1].nRating).toBe(1600);
    expect(miniGamePlayers[2].nRating).toBe(1700);
  });

  it('handles incoming player not in club snapshot', () => {
    const club = [makePlayer({ rank: 1 })];
    const incoming = [
      makePlayer({ rank: 1, lastName: 'InClub' }),
      makePlayer({ rank: 99, lastName: 'NewPlayer', nRating: 1300 }),
    ];

    const { identityUpdates, miniGamePlayers } = splitIdentityChanges(incoming, club);

    // New player not in club — no identity update, kept as-is
    expect(identityUpdates.length).toBe(1); // rank 1 changed
    expect(miniGamePlayers.length).toBe(2);
    expect(miniGamePlayers[1].lastName).toBe('NewPlayer');
    expect(miniGamePlayers[1].nRating).toBe(1300);
  });

  it('handles empty incoming array', () => {
    const club = [makePlayer({ rank: 1 })];
    const incoming: PlayerData[] = [];

    const { identityUpdates, miniGamePlayers } = splitIdentityChanges(incoming, club);

    expect(identityUpdates).toEqual([]);
    expect(miniGamePlayers).toEqual([]);
  });
});

describe('round-trip: merge then split', () => {
  it('merge then split produces consistent result', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Club', rating: 1200, nRating: 900 })];
    const mg = [makePlayer({ rank: 1, lastName: 'Mini', rating: 1100, nRating: 1500, gameResults: ['W', 'L'] })];

    // Step 1: merge
    const merged = mergeIdentityFromClubLadder(mg, club);
    expect(merged[0].lastName).toBe('Club');
    expect(merged[0].nRating).toBe(1500);
    expect(merged[0].gameResults).toEqual(['W', 'L']);

    // Step 2: user edits name in mini-game, saves
    merged[0].lastName = 'Edited';
    const { identityUpdates, miniGamePlayers } = splitIdentityChanges(merged, club);

    // Identity update should reflect the name change
    expect(identityUpdates.length).toBe(1);
    expect(identityUpdates[0].lastName).toBe('Edited');

    // Mini-game file gets club identity back + preserved nRating/gameResults
    expect(miniGamePlayers[0].lastName).toBe('Club');
    expect(miniGamePlayers[0].nRating).toBe(1500);
    expect(miniGamePlayers[0].gameResults).toEqual(['W', 'L']);
  });

  it('merge then split with no edits produces no identity updates', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Club', rating: 1200 })];
    const mg = [makePlayer({ rank: 1, lastName: 'Mini', nRating: 1500 })];

    const merged = mergeIdentityFromClubLadder(mg, club);
    expect(merged[0].lastName).toBe('Club');

    const { identityUpdates } = splitIdentityChanges(merged, club);
    expect(identityUpdates.length).toBe(0);
  });

  it('double merge produces stable result', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Club', rating: 1200 })];
    const mg = [makePlayer({ rank: 1, lastName: 'Mini', nRating: 1500, gameResults: ['W'] })];

    // First merge
    const first = mergeIdentityFromClubLadder(mg, club);
    expect(first[0].lastName).toBe('Club');

    // Second merge (idempotent)
    const second = mergeIdentityFromClubLadder(first, club);
    expect(second[0].lastName).toBe('Club');
    expect(second[0].nRating).toBe(1500);
    expect(second[0].gameResults).toEqual(['W']);
  });

  it('split then merge round-trip with new player added to club', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Club' })];
    const mg = [makePlayer({ rank: 1, lastName: 'Mini', nRating: 1500 })];

    // Merge
    const merged = mergeIdentityFromClubLadder(mg, club);
    expect(merged[0].lastName).toBe('Club');

    // Split (no changes)
    const { identityUpdates, miniGamePlayers } = splitIdentityChanges(merged, club);
    expect(identityUpdates.length).toBe(0);
    expect(miniGamePlayers[0].nRating).toBe(1500);

    // New merge with updated club (new player added)
    const clubWithNew = [
      makePlayer({ rank: 1, lastName: 'Club' }),
      makePlayer({ rank: 2, lastName: 'NewClub', rating: 1300 }),
    ];
    const mgWithNew = [
      makePlayer({ rank: 1, lastName: 'Mini', nRating: 1500 }),
      makePlayer({ rank: 2, lastName: 'NewMini', nRating: 1400 }),
    ];
    const reMerged = mergeIdentityFromClubLadder(mgWithNew, clubWithNew);
    expect(reMerged[0].lastName).toBe('Club');
    expect(reMerged[1].lastName).toBe('NewClub');
    expect(reMerged[1].nRating).toBe(1400);
  });
});

describe('edge cases: identity field comparison', () => {
  it('empty string vs undefined identity field triggers update', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', phone: '' })];
    const incoming = [makePlayer({ rank: 1, lastName: 'Smith', phone: undefined })];

    const { identityUpdates } = splitIdentityChanges(incoming, club);
    expect(identityUpdates.length).toBe(1);
  });

  it('numeric identity fields comparison (rating, attendance, num_games)', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', rating: 1200, attendance: 5, num_games: 10 })];
    const incoming = [makePlayer({ rank: 1, lastName: 'Smith', rating: 1300, attendance: 6, num_games: 11 })];

    const { identityUpdates } = splitIdentityChanges(incoming, club);
    expect(identityUpdates.length).toBe(1);
    expect(identityUpdates[0].rating).toBe(1300);
  });

  it('boolean identity field change (trophyEligible)', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', trophyEligible: true })];
    const incoming = [makePlayer({ rank: 1, lastName: 'Smith', trophyEligible: false })];

    const { identityUpdates } = splitIdentityChanges(incoming, club);
    expect(identityUpdates.length).toBe(1);
    expect(identityUpdates[0].trophyEligible).toBe(false);
  });

  it('grade field change triggers identity update', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', grade: '5' })];
    const incoming = [makePlayer({ rank: 1, lastName: 'Smith', grade: '6' })];

    const { identityUpdates } = splitIdentityChanges(incoming, club);
    expect(identityUpdates.length).toBe(1);
  });

  it('school field change triggers identity update', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', school: 'OldSchool' })];
    const incoming = [makePlayer({ rank: 1, lastName: 'Smith', school: 'NewSchool' })];

    const { identityUpdates } = splitIdentityChanges(incoming, club);
    expect(identityUpdates.length).toBe(1);
  });

  it('room field change triggers identity update', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', room: '1A' })];
    const incoming = [makePlayer({ rank: 1, lastName: 'Smith', room: '2B' })];

    const { identityUpdates } = splitIdentityChanges(incoming, club);
    expect(identityUpdates.length).toBe(1);
  });

  it('info field change triggers identity update', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', info: 'old note' })];
    const incoming = [makePlayer({ rank: 1, lastName: 'Smith', info: 'new note' })];

    const { identityUpdates } = splitIdentityChanges(incoming, club);
    expect(identityUpdates.length).toBe(1);
  });

  it('group field change triggers identity update', () => {
    const club = [makePlayer({ rank: 1, lastName: 'Smith', group: 'A' })];
    const incoming = [makePlayer({ rank: 1, lastName: 'Smith', group: 'B' })];

    const { identityUpdates } = splitIdentityChanges(incoming, club);
    expect(identityUpdates.length).toBe(1);
  });
});

describe('IDENTITY_FIELDS completeness', () => {
  it('contains all expected fields', () => {
    const expected = ['rank', 'group', 'lastName', 'firstName', 'rating', 'trophyEligible', 'grade', 'num_games', 'attendance', 'phone', 'info', 'school', 'room'];
    for (const field of expected) {
      expect(IDENTITY_FIELDS).toContain(field);
    }
  });

  it('excludes non-identity fields', () => {
    const excluded = ['nRating', 'gameResults', 'confirmed', 'confirmedCount'];
    for (const field of excluded) {
      expect(IDENTITY_FIELDS).not.toContain(field);
    }
  });
});
