import { PlayerData } from '../services/dataService.js';

const PLAYER_FIELDS: (keyof PlayerData)[] = [
  'group',
  'lastName',
  'firstName',
  'rating',
  'nRating',
  'trophyEligible',
  'grade',
  'num_games',
  'attendance',
  'info',
  'phone',
  'school',
  'room',
  'gameResults',
];

const STRING_FIELDS: (keyof PlayerData)[] = [
  'group',
  'lastName',
  'firstName',
  'grade',
  'info',
  'phone',
  'school',
  'room',
];

const NUMBER_FIELDS: (keyof PlayerData)[] = [
  'rating',
  'nRating',
  'num_games',
  'attendance',
];

export function validatePlayerUpdatePayload(body: unknown): Partial<PlayerData> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid payload: expected object');
  }

  const result: Partial<PlayerData> = {};
  const b = body as Record<string, unknown>;

  for (const key of PLAYER_FIELDS) {
    if (!(key in b)) continue;
    const value = b[key];

    if (STRING_FIELDS.includes(key)) {
      (result as Record<string, unknown>)[key] = typeof value === 'string' ? value : String(value ?? '');
    } else if (NUMBER_FIELDS.includes(key)) {
      (result as Record<string, unknown>)[key] = typeof value === 'number' ? Math.floor(value) : parseInt(String(value ?? '0'), 10) || 0;
    } else if (key === 'trophyEligible') {
      (result as Record<string, unknown>)[key] = typeof value === 'boolean' ? value : !!value;
    } else if (key === 'gameResults') {
      (result as Record<string, unknown>)[key] = validateGameResults(value);
    }
  }

  return result;
}

export function validateGameResults(value: unknown): (string | null)[] {
  if (!Array.isArray(value)) {
    return new Array(31).fill(null);
  }

  const results: (string | null)[] = [];
  for (let i = 0; i < 31; i++) {
    const entry = i < value.length ? value[i] : null;
    if (entry === null || entry === undefined) {
      results.push(null);
    } else {
      results.push(String(entry));
    }
  }
  return results;
}

export interface ValidatedGameResult {
  playerRank: number;
  round: number;
  result: string;
}

export function validateGameResult(body: unknown): ValidatedGameResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid game result payload');
  }

  const b = body as Record<string, unknown>;
  const playerRank = typeof b.playerRank === 'number' ? Math.floor(b.playerRank) : parseInt(String(b.playerRank), 10);
  const round = typeof b.round === 'number' ? Math.floor(b.round) : parseInt(String(b.round), 10);
  const result = typeof b.result === 'string' ? b.result : String(b.result ?? '');

  if (isNaN(playerRank) || playerRank < 1) {
    throw new Error('Invalid playerRank');
  }
  if (isNaN(round) || round < 0 || round > 30) {
    throw new Error('Invalid round');
  }
  if (!result) {
    throw new Error('Missing result');
  }

  return { playerRank, round, result };
}

export function validatePlayersArray(value: unknown): PlayerData[] {
  if (!Array.isArray(value)) {
    throw new Error('Expected players array');
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Invalid player at index ${index}`);
    }

    const p = item as Record<string, unknown>;
    const player: PlayerData = {
      rank: typeof p.rank === 'number' ? Math.floor(p.rank) : parseInt(String(p.rank ?? '0'), 10) || 0,
      group: typeof p.group === 'string' ? p.group : String(p.group ?? ''),
      lastName: typeof p.lastName === 'string' ? p.lastName : String(p.lastName ?? ''),
      firstName: typeof p.firstName === 'string' ? p.firstName : String(p.firstName ?? ''),
      rating: typeof p.rating === 'number' ? Math.floor(p.rating) : parseInt(String(p.rating ?? '0'), 10) || 0,
      nRating: typeof p.nRating === 'number' ? Math.floor(p.nRating) : parseInt(String(p.nRating ?? '0'), 10) || 0,
      trophyEligible: typeof p.trophyEligible === 'boolean' ? p.trophyEligible : p.trophyEligible !== false,
      grade: typeof p.grade === 'string' ? p.grade : String(p.grade ?? ''),
      num_games: typeof p.num_games === 'number' ? Math.floor(p.num_games) : parseInt(String(p.num_games ?? '0'), 10) || 0,
      attendance: typeof p.attendance === 'number' ? Math.floor(p.attendance) : parseInt(String(p.attendance ?? '0'), 10) || 0,
      phone: typeof p.phone === 'string' ? p.phone : String(p.phone ?? ''),
      info: typeof p.info === 'string' ? p.info : String(p.info ?? ''),
      school: typeof p.school === 'string' ? p.school : String(p.school ?? ''),
      room: typeof p.room === 'string' ? p.room : String(p.room ?? ''),
      gameResults: validateGameResults(p.gameResults),
    };

    return player;
  });
}

export interface ValidatedDelta {
  playerRank: number;
  round: number;
  result: string;
}

export function validateDeltasArray(value: unknown): ValidatedDelta[] {
  if (!Array.isArray(value)) {
    throw new Error('Expected deltas array');
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Invalid delta at index ${index}`);
    }

    const d = item as Record<string, unknown>;
    const playerRank = typeof d.playerRank === 'number' ? Math.floor(d.playerRank) : parseInt(String(d.playerRank), 10);
    const round = typeof d.round === 'number' ? Math.floor(d.round) : parseInt(String(d.round), 10);
    const result = typeof d.result === 'string' ? d.result : String(d.result ?? '');

    if (isNaN(playerRank) || playerRank < 1) {
      throw new Error(`Invalid playerRank at index ${index}`);
    }
    if (isNaN(round) || round < 0 || round > 30) {
      throw new Error(`Invalid round at index ${index}`);
    }

    return { playerRank, round, result };
  });
}

export function validateStringField(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Missing or invalid ${name}`);
  }
  return value;
}

export function validateClientId(body: unknown): { clientId: string; clientName?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Invalid payload');
  }

  const b = body as Record<string, unknown>;
  const clientId = typeof b.clientId === 'string' ? b.clientId : String(b.clientId ?? '');
  const clientName = typeof b.clientName === 'string' ? b.clientName : undefined;

  if (!clientId) {
    throw new Error('Missing clientId');
  }

  return { clientId, clientName };
}

export function sanitizeFileName(fileName: string): string {
  const sanitized = fileName.replace(/\/|\\/g, '');
  if (sanitized !== fileName) {
    throw new Error('Invalid file name: path traversal detected');
  }
  return sanitized;
}
