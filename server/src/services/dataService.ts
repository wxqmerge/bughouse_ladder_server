import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define TAB_FILE_PATH before any function that uses it
const TAB_FILE_PATH = process.env.TAB_FILE_PATH 
  || path.join(__dirname, '../../../data/ladder.tab');

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
  await acquireLock();
  
  try {
    const content = await fs.readFile(TAB_FILE_PATH, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return { header: [], players: [], rawLines: [] };
    }

    // First line is header
    const header = lines[0].split('\t');
    const rawLines = lines.slice(1);
    
    // Parse player data
    const players: PlayerData[] = rawLines.map((line, index) => {
      const fields = line.split('\t');
      
      // Extract game results (last 31 fields)
      const gameResultsFields = fields.slice(-31);
      const gameResults = gameResultsFields.map(field => 
        field === '' || field === '_' ? null : field
      );
      
      return {
        rank: index + 1,
        group: fields[0] || '',
        lastName: fields[1] || '',
        firstName: fields[2] || '',
        rating: parseInt(fields[3]) || 0,
        nRating: parseInt(fields[5]) || 0,
        grade: fields[6] || '',
        num_games: parseInt(fields[7]) || 0,
        attendance: fields[8] || '',
        info: fields[10] || '',
        phone: fields[9] || '',
        school: fields[11] || '',
        room: fields[12] || '',
        gameResults,
      };
    });

    return { header, players, rawLines };
  } finally {
    releaseLock();
  }
}

export async function writeLadderFile(ladderData: LadderData): Promise<void> {
  await acquireLock();
  
  try {
    log('[SERVER]', `Writing ${ladderData.players.length} players to ${TAB_FILE_PATH}`);
    // Reconstruct lines from player data
    const headerLine = ladderData.header.join('\t');
    
    const playerLines = ladderData.players.map(player => {
      const baseFields = [
        player.group,
        player.lastName,
        player.firstName,
        player.rating.toString(),
        '', // ranking (calculated)
        player.nRating.toString(),
        player.grade,
        player.num_games.toString(),
        player.attendance.toString(),
        player.phone,
        player.info,
        player.school,
        player.room,
      ];
      
      // Add game results (ensure exactly 31 fields)
      const gameResults = player.gameResults.slice(0, 31);
      while (gameResults.length < 31) {
        gameResults.push(null);
      }
      
      const allFields = [...baseFields, ...gameResults.map(r => r || '')];
      return allFields.join('\t');
    });

    const content = [headerLine, ...playerLines].join('\n') + '\n';
    await fs.writeFile(TAB_FILE_PATH, content, 'utf-8');
  } finally {
    releaseLock();
  }
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
    
    const defaultHeader = [
      'Group', 'Last Name', 'First Name', 'Rating', 'Ranking',
      'N_Rating', 'Grade', 'Games', 'Attendance', 'Phone',
      'Info', 'School', 'Room'
    ];
    
    // Create header + 31 game result column headers
    const columnHeader = [...defaultHeader, ...Array(31).fill('')].join('\t');
    await fs.writeFile(TAB_FILE_PATH, columnHeader + '\n', 'utf-8');
    log('[SERVER]', `Created default ladder file at ${TAB_FILE_PATH}`);
  }
}
