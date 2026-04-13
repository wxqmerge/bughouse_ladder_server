import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { withTiming as performanceWithTiming } from '../utils/performance.js';

// Timestamp utility
function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

function log(category: string, message: string, ...args: any[]): void {
  console.log(`[${getTimestamp()}] ${category}`, message, ...args);
}

import { withTiming as _withTiming } from '../utils/performance.js';
// Re-export for use in other modules
export { withTiming } from '../utils/performance.js';

// Use local alias for internal use
const withTiming = _withTiming;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define TAB_FILE_PATH before any function that uses it
const TAB_FILE_PATH = process.env.TAB_FILE_PATH 
  || path.join(__dirname, '../../data/ladder.tab');

// Initialize on module load
initializeDefaultLadder().catch(err => 
  log('[SERVER]', 'Failed to initialize default ladder:', err)
);

export interface PlayerData {
  rank: number;
  group: string;
  lastName: string;
  firstName: string;
  rating: number;
  nRating: number;
  grade: string;
  num_games: number;
  attendance: number | string;
  info: string;
  phone: string;
  school: string;
  room: string;
  gameResults: (string | null)[];
}

export interface LadderData {
  header: string[];
  players: PlayerData[];
  rawLines: string[];
}

// File lock mechanism
let fileLock: { locked: boolean; release: () => void } | null = null;

async function acquireLock(): Promise<void> {
  if (!fileLock || !fileLock.locked) {
    return new Promise((resolve) => {
      fileLock = {
        locked: true,
        release: resolve,
      };
    });
  }
}

function releaseLock(): void {
  if (fileLock && fileLock.locked) {
    fileLock.locked = false;
    fileLock.release();
    fileLock = null;
  }
}

export async function readLadderFile(): Promise<LadderData> {
  return withTiming('readLadderFile', async () => {
    await acquireLock();
    
    try {
      const content = await fs.readFile(TAB_FILE_PATH, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return { header: [], players: [], rawLines: [] };
    }

    // Check if first line is header (starts with 'Rnk' or 'Group') or data
    const firstLine = lines[0];
    const isFirstLineHeader = firstLine.startsWith('Rnk\tGroup') || firstLine.startsWith('Group\tLast Name');
    
    let header: string[] = [];
    let dataLines: string[];
    
    if (isFirstLineHeader) {
      header = firstLine.split('\t');
      dataLines = lines.slice(1);
    } else {
      dataLines = lines;
    }
    
    // Parse player data - supports both formats:
    // New format (LadderForm): Rnk|Group|Last Name|First Name|Prev Rating|New Rating|Gr|Gms|Attendance|Phone|Info
    // Old format (kings_cross): Group|Last Name|First Name|Rating|Rnk|N Rate|Gr|[blank]|X|Phone|Info|School|Room|[games]|Version
    const players: PlayerData[] = [];
    
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const fields = line.split('\t');
      
      // Skip empty rows or footer rows
      if (fields.length < 4 || (!fields[1] && !fields[2])) {
        continue;
      }
      
      // Detect format by checking first field
      const isNewFormat = !isNaN(parseInt(fields[0])); // First field is a number (rank)
      
      let player: PlayerData;
      
      if (isNewFormat) {
        // New LadderForm format
        player = {
          rank: parseInt(fields[0]) || 0,
          group: fields[1] || '',
          lastName: fields[2] || '',
          firstName: fields[3] || '',
          rating: parseInt(fields[4]) || 0, // Previous Rating
          nRating: parseInt(fields[5]) || 0, // New Rating
          grade: fields[6] || '', // Gr
          num_games: parseInt(fields[7]) || 0, // Gms
          attendance: fields[8] || '', // Attendance
          phone: fields[9] || '', // Phone
          info: fields[10] || '', // Info
          school: '',
          room: '',
          gameResults: [],
        };
      } else {
        // Old kings_cross format
        player = {
          rank: parseInt(fields[4]) || 0,
          group: fields[0] || '',
          lastName: fields[1] || '',
          firstName: fields[2] || '',
          rating: parseInt(fields[3]) || 0,
          nRating: 0,
          grade: fields[6] || '',
          num_games: (fields[8] === 'X') ? 1 : 0,
          attendance: '',
          phone: fields[9] || '',
          info: fields[10] || '',
          school: fields[11] || '',
          room: fields[12] || '',
          gameResults: [],
        };
      }
      
      players.push(player);
    }

    return { header, players, rawLines: dataLines };
  } finally {
    releaseLock();
  }
  });
}

export function generateTabContent(ladderData: LadderData): string {
  // Output format matches LadderForm headers:
  // Rnk|Group|Last Name|First Name|Previous Rating|New Rating|Gr|Gms|Attendance|Phone|Info
  
  const headerLine = 'Rnk\tGroup\tLast Name\tFirst Name\tPrevious Rating\tNew Rating\tGr\tGms\tAttendance\tPhone\tInfo';
  
  const playerLines = ladderData.players.map(player => {
    const baseFields = [
      player.rank.toString(), // Rnk
      player.group, // Group
      player.lastName, // Last Name
      player.firstName, // First Name
      player.rating.toString(), // Previous Rating
      player.nRating.toString(), // New Rating
      player.grade, // Gr
      player.num_games.toString(), // Gms
      player.attendance.toString(), // Attendance
      player.phone, // Phone
      player.info, // Info
    ];
    
    return baseFields.join('\t');
  });

  return [headerLine, ...playerLines].join('\n') + '\n';
}

export async function writeLadderFile(ladderData: LadderData): Promise<void> {
  return withTiming('writeLadderFile', async () => {
    await acquireLock();
    
    try {
      log('[SERVER]', `Writing ${ladderData.players.length} players to ${TAB_FILE_PATH}`);
      const content = generateTabContent(ladderData);
      await fs.writeFile(TAB_FILE_PATH, content, 'utf-8');
    } finally {
      releaseLock();
    }
  });
}

// Ensure data directory exists
export async function ensureDataDirectory(): Promise<void> {
  const dataDir = path.dirname(TAB_FILE_PATH);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Create default ladder file if it doesn't exist
export async function initializeDefaultLadder(): Promise<void> {
  try {
    await fs.access(TAB_FILE_PATH);
  } catch {
    await ensureDataDirectory();
    
    // Create empty file (no header, format matches input: rank|group|lastName|firstName|...)
    await fs.writeFile(TAB_FILE_PATH, '', 'utf-8');
    log('[SERVER]', `Created default ladder file at ${TAB_FILE_PATH}`);
  }
}
