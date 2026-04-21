import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { withTiming as performanceWithTiming } from '../utils/performance.js';

// Server-side PlayerData - kept inline due to NodeNext module resolution constraints
// Canonical definition is in shared/types/index.ts
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

export interface LadderData {
  header: string[];
  players: PlayerData[];
  rawLines: string[];
}

// File lock mechanism - simple mutex for sequential file access
let fileLock: { locked: boolean; waiters: (() => void)[] } | null = null;

async function acquireLock(): Promise<void> {
  if (!fileLock || !fileLock.locked) {
    fileLock = { locked: true, waiters: [] };
    return; // Lock acquired immediately
  }
  return new Promise((resolve) => {
    fileLock!.waiters.push(resolve);
  });
}

function releaseLock(): void {
  if (fileLock && fileLock.locked) {
    const nextWaiter = fileLock.waiters.shift();
    if (nextWaiter) {
      nextWaiter(); // Wake up next waiter
    } else {
      fileLock.locked = false;
      fileLock = null;
    }
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
    // Old format (VB6 ladder): Group|Last Name|First Name|Rating|Rnk|N Rate|Gr|[blank]|X|Phone|Info|School|Room|[games]|Version
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
        // Old VB6 ladder format
        // Fields: 0=Group, 1=Last, 2=First, 3=Rating, 4=Rnk, 5=NRate, 6=Gr, 7=blank, 8=X, 9=Phone, 10=Info, 11=School, 12=Room
        // Fields 13-43: Game results for rounds 1-31
        const gameResults: (string | null)[] = [];
        for (let r = 0; r < 31; r++) {
          const fieldIndex = 13 + r;
          const value = fields[fieldIndex]?.trim() || '';
          gameResults.push(value || null);
        }
        
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
          gameResults: gameResults,
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
  // Output format matches VB6 ladder headers:
  // Group|Last Name|First Name|Rating|Rnk|N Rate|Gr|[blank]|X|Phone|Info|School|Room|[games]|Version
  
  const headerLine = 'Group\tLast Name\tFirst Name\tRating\tRnk\tN Rate\tGr\t\tX\tPhone\tInfo\tSchool\tRoom\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12\t13\t14\t15\t16\t17\t18\t19\t20\t21\t22\t23\t24\t25\t26\t27\t28\t29\t30\t31\tVersion 1.21';
  
  const playerLines = ladderData.players.map(player => {
    // Base fields in VB6 ladder order
    const baseFields = [
      player.group, // Group
      player.lastName, // Last Name
      player.firstName, // First Name
      player.rating.toString(), // Rating
      player.rank.toString(), // Rnk (PRESERVED from input - NOT recalculated)
      player.nRating.toString(), // N Rate
      player.grade, // Gr
      '', // blank column
      'X', // X column
      player.phone, // Phone
      player.info, // Info
      player.school, // School
      player.room, // Room
    ];
    
    // Add game result columns (1-31)
    const gameResults = player.gameResults || [];
    for (let i = 0; i < 31; i++) {
      baseFields.push(gameResults[i] || '');
    }
    
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
    
    // Try to copy from vb6_ladder.tab if it exists
    const vb6LadderPath = path.join(path.dirname(__dirname), '..', 'vb6_ladder.tab');
    try {
      await fs.access(vb6LadderPath);
      const content = await fs.readFile(vb6LadderPath, 'utf-8');
      await fs.writeFile(TAB_FILE_PATH, content, 'utf-8');
      log('[SERVER]', `Copied vb6_ladder.tab to ${TAB_FILE_PATH}`);
    } catch {
      // Create empty file
      await fs.writeFile(TAB_FILE_PATH, '', 'utf-8');
      log('[SERVER]', `Created default ladder file at ${TAB_FILE_PATH}`);
    }
  }
}
