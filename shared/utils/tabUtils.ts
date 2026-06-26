import type { PlayerData, LadderData } from '../types/index.js';
import { NUM_ROUNDS } from './constants.js';

/**
 * Parse TSV content into a LadderData object.
 * Handles header detection, duplicate header repair, and metadata line skipping.
 */
export function parseTabContent(content: string): LadderData {
  let lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { header: [], players: [], rawLines: [] };
  }

  // Detect and repair duplicate header
  if (lines.length > 1) {
    const secondLine = lines[1].replace(/\r/g, '');
    const secondLineCols = secondLine.split('\t');
    const isHeader = secondLineCols[13] && secondLineCols[13].trim() === '1';

    if (!isHeader && secondLine.includes('Last Name') && secondLine.includes('First Name')) {
      const normCols = secondLine.split('\t');
      if (normCols[13] && normCols[13].trim() === '1') {
        lines = [lines[0], ...lines.slice(2)];
      }
    }

    if (isHeader) {
      lines = [lines[0], ...lines.slice(2)];
    }
  }

  const header = lines[0].split('\t');
  const players: PlayerData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const player = parsePlayerLine(lines[i]);
    if (player && player.rank > 0 && (player.lastName || player.firstName || player.nRating !== 0)) {
      players.push(player);
    }
  }

  return { header, players, rawLines: lines };
}

/**
 * Parse a single TSV line into a PlayerData object.
 * Shared between server (readLadderFile) and frontend (parseTabContent).
 */
export function parsePlayerLine(line: string): PlayerData | null {
  const fields = line.split('\t');

  // Skip empty rows or footer rows
  if (fields.length < 4 || (!fields[1] && !fields[2])) {
    return null;
  }

  const ratingStr = String(fields[3] || '').trim();
  const isNegRating = ratingStr.startsWith('-');
  const nRateStr = String(fields[5] || '').trim();

  const safeInt = (val: string | null | undefined, fallback: number = 0): number => {
    if (val === null || val === undefined || val.trim() === '') return fallback;
    const n = parseInt(val, 10);
    return isNaN(n) ? fallback : n;
  };

  const gameResults: (string | null)[] = [];
  for (let r = 0; r < NUM_ROUNDS; r++) {
    const value = fields[13 + r]?.trim() || '';
    gameResults.push(value || null);
  }

  return {
    rank: safeInt(fields[4]),
    group: fields[0]?.trim() || '',
    lastName: fields[1] || '',
    firstName: fields[2] || '',
    rating: Math.abs(safeInt(ratingStr)),
    nRating: Math.abs(safeInt(nRateStr)),
    trophyEligible: !isNegRating,
    grade: fields[6] === 'N/A' ? ' ' : (fields[6] || ' '),
    num_games: safeInt(fields[7]),
    attendance: safeInt(fields[8]),
    phone: fields[9] || '',
    info: fields[10] || '',
    school: fields[11] || '',
    room: fields[12] || '',
    gameResults,
  };
}

/**
 * Generate TSV content from players array.
 * Shared between server (generateTabContent) and frontend (playersToTabContent).
 */
export function playersToTabContent(players: PlayerData[]): string {
  const header = ['Group', 'Last Name', 'First Name', 'Rating', 'Rank', 'NRate', 'Grade', 'Num Games', 'Attendance', 'Phone', 'Info', 'School', 'Room', ...Array(NUM_ROUNDS).fill('')].join('\t');
  const lines = [header];

  for (const p of players) {
    const ratingStr = p.trophyEligible ? String(p.rating) : `-${p.rating}`;
    const cols = [
      p.group || '',
      p.lastName || '',
      p.firstName || '',
      ratingStr,
      String(p.rank),
      String(p.nRating),
      (p.grade === 'N/A' ? ' ' : p.grade) || ' ',
      String(p.num_games),
      String(p.attendance),
      p.phone || '',
      p.info || '',
      p.school || '',
      p.room || '',
      ...(p.gameResults || []).map(r => r || ''),
    ];
    lines.push(cols.join('\t'));
  }

  return lines.join('\n') + '\n';
}

/**
 * Generate full TSV content with server-style header (includes Version suffix).
 */
export function generateTabContent(players: PlayerData[], version?: string): string {
  const versionSuffix = version ? `\tVersion ${version}` : '';
  const headerLine = `Group\tLast Name\tFirst Name\tRating\tRnk\tN Rate\tGr\tGms\tAttendance\tPhone\tInfo\tSchool\tRoom\t${Array.from({ length: NUM_ROUNDS }, (_, i) => String(i + 1)).join('\t')}${versionSuffix}`;

  const playerLines = players.map(player => {
    const baseFields = [
      player.group || '',
      player.lastName || '',
      player.firstName || '',
      (player.trophyEligible !== false ? player.rating : '-' + player.rating).toString() || '0',
      player.rank?.toString() || '0',
      (player.trophyEligible !== false ? player.nRating : '-' + player.nRating).toString() || '0',
      player.grade === 'N/A' ? ' ' : (player.grade || ''),
      (player.num_games ?? 0).toString(),
      player.attendance?.toString() || '',
      player.phone || '',
      player.info || '',
      player.school || '',
      player.room || '',
    ];

    const gameResults = player.gameResults || [];
    for (let i = 0; i < NUM_ROUNDS; i++) {
      baseFields.push(gameResults[i] || '');
    }

    return baseFields.join('\t');
  });

  return [headerLine, ...playerLines].join('\n') + '\n';
}
