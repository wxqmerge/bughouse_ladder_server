import type { PlayerData, LadderData } from '../types/index.js';
import { NUM_ROUNDS } from './constants.js';

/** Expected data fields: 14 metadata (Group..Room) + NUM_ROUNDS game results. */
export const EXPECTED_DATA_FIELDS = 14 + NUM_ROUNDS;

/**
 * Detect the format of a TSV ladder file.
 * Returns metadata about header/data field counts and any format issues.
 */
export interface TabFormatInfo {
  /** Number of fields in the header row. */
  headerFields: number;
  /** Number of fields in the first data row (0 if no data). */
  dataFields: number;
  /** True if header has a Version suffix column not present in data rows. */
  hasVersionColumn: boolean;
  /** True if data rows are missing the Group column (shifted by 1). */
  missingGroupColumn: boolean;
  /** True if the format needs normalization before parsing. */
  needsNormalization: boolean;
  /** List of detected format issues. */
  issues: string[];
}

export function detectTabFormat(lines: string[]): TabFormatInfo {
  const issues: string[] = [];
  if (lines.length === 0) {
    return { headerFields: 0, dataFields: 0, hasVersionColumn: false, missingGroupColumn: false, needsNormalization: false, issues };
  }

  const headerCols = lines[0].split('\t');
  const headerFields = headerCols.length;

  // Find first non-empty data line
  let firstDataLine: string | null = null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim()) {
      firstDataLine = lines[i];
      break;
    }
  }

  let dataFields = 0;
  let hasVersionColumn = false;
  let missingGroupColumn = false;

  if (firstDataLine) {
    const dataCols = firstDataLine.split('\t');
    dataFields = dataCols.length;

    // Check for Version column in header (last field starts with "Version")
    const lastHeader = headerCols[headerFields - 1]?.trim() || '';
    if (lastHeader.startsWith('Version')) {
      hasVersionColumn = true;
    }

    // Detect field count mismatch
    // IMPORTANT: Check hasVersionColumn first, because it affects interpretation of field counts
    if (hasVersionColumn) {
      // Header has Version column; data should have one fewer field (no Version)
      if (dataFields === headerFields - 1) {
        // Normal: header has Version, data doesn't. Data aligns correctly.
      } else if (dataFields === headerFields) {
        // Data also has Version column — unusual but OK
      } else if (dataFields < headerFields - 1) {
        // Data is missing more than just the Version column
        missingGroupColumn = true;
        issues.push(`Data field count (${dataFields}) significantly less than header (${headerFields}) — columns shifted`);
      }
    } else if (headerFields === EXPECTED_DATA_FIELDS && dataFields === EXPECTED_DATA_FIELDS - 1) {
      // No Version in header, but data has one fewer field — missing Group column
      missingGroupColumn = true;
      issues.push('Data rows missing Group column — columns shifted by 1');
    } else if (headerFields === EXPECTED_DATA_FIELDS - 1 && dataFields === EXPECTED_DATA_FIELDS - 2) {
      // Old-format: both header and data missing Group column
      missingGroupColumn = true;
      issues.push('File missing Group column — columns shifted by 1');
    } else if (dataFields < headerFields) {
      // Data has fewer fields than header — likely missing leading columns
      missingGroupColumn = true;
      issues.push(`Data field count (${dataFields}) less than header (${headerFields}) — columns shifted`);
    } else if (dataFields !== EXPECTED_DATA_FIELDS && dataFields !== EXPECTED_DATA_FIELDS + 1) {
      issues.push(`Unexpected data field count: ${dataFields} (expected ${EXPECTED_DATA_FIELDS})`);
    }
  }

  return {
    headerFields,
    dataFields,
    hasVersionColumn,
    missingGroupColumn,
    needsNormalization: missingGroupColumn,
    issues,
  };
}

/**
 * Parse TSV content into a LadderData object.
 * Handles header detection, duplicate header repair, metadata line skipping,
 * and old-format normalization (Version column, missing Group column).
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
  const formatInfo = detectTabFormat(lines);
  const players: PlayerData[] = [];

  for (let i = 1; i < lines.length; i++) {
    let line = lines[i];

    // Normalize: if data is missing Group column, prepend empty fields to align
    if (formatInfo.missingGroupColumn) {
      const cols = line.split('\t');
      const headerLen = formatInfo.headerFields;
      if (cols.length < headerLen) {
        // Prepend empty fields to match header length
        const padding = headerLen - cols.length;
        line = '\t'.repeat(padding) + line;
      }
    }

    const player = parsePlayerLine(line);
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
