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

    // Check if first line is header (starts with 'Group') or data
    const firstLine = lines[0];
    const isFirstLineHeader = firstLine.startsWith('Group\tLast Name');
    
    let header: string[] = [];
    let dataLines: string[];
    
    if (isFirstLineHeader) {
      header = firstLine.split('\t');
      dataLines = lines.slice(1);
    } else {
      dataLines = lines;
    }
    
    // Parse player data (kings_cross.tab format):
    // Group|Last Name|First Name|Rating|Rnk|N Rate|Gr|[blank]|X|Phone|Info|School|Room|[31 games]|Version
    const players: PlayerData[] = [];
    
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const fields = line.split('\t');
      
      // Skip empty rows or footer rows (rows with just numbers at the end)
      if (fields.length < 4 || (!fields[1] && !fields[2])) {
        continue;
      }
      
      const group = fields[0] || '';
      const lastName = fields[1] || '';
      const firstName = fields[2] || '';
      const rating = parseInt(fields[3]) || 0;
      const rankFromInput = parseInt(fields[4]) || 0; // Rnk (rank from input)
      // Field 5 is N Rate - seems empty in source
      const grade = fields[6] || '';
      // Field 7 is blank - skip
      // Field 8 is X (games indicator) - convert to number if 'X' present
      const xField = fields[8] || '';
      const numGames = xField === 'X' ? 1 : 0;
      const phone = fields[9] || '';
      const info = fields[10] || '';
      const school = fields[11] || '';
      const room = fields[12] || '';
      
      // Game results start at field 13 (columns 1-31)
      const gameResultsFields = fields.slice(13, 44);
      const gameResults = gameResultsFields.map(field => 
        field === '' || field === '_' ? null : field
      );
      
      players.push({
        rank: rankFromInput, // Preserve rank from input
        group,
        lastName,
        firstName,
        rating,
        nRating: 0, // Not stored in this format
        grade,
        num_games: numGames,
        attendance: '',
        phone,
        info,
        school,
        room,
        gameResults,
      });
    }

    return { header, players, rawLines: dataLines };
  } finally {
    releaseLock();
  }
}

export function generateTabContent(ladderData: LadderData): string {
  // Output format matches kings_cross.tab:
  // Group|Last Name|First Name|Rating|Rnk|N Rate|Gr|[blank]|X|Phone|Info|School|Room|1-31 (games)|Version
  
  const headerLine = 'Group\tLast Name\tFirst Name\tRating\tRnk\tN Rate\tGr\t\tX\tPhone\tInfo\tSchool\tRoom\t' +
    Array.from({ length: 31 }, (_, i) => (i + 1).toString()).join('\t') + '\t1.0.0-server';
  
  const playerLines = ladderData.players.map(player => {
    const baseFields = [
      player.group,
      player.lastName,
      player.firstName,
      player.rating.toString(),
      player.rank.toString(), // Rnk (from input)
      '', // N Rate (empty in source)
      player.grade,
      '', // blank
      player.num_games > 0 ? 'X' : '', // X column
      player.phone,
      player.info,
      player.school,
      player.room,
    ];
    
    // Add game results (ensure exactly 31 fields)
    const gameResults = player.gameResults.slice(0, 31);
    while (gameResults.length < 31) {
      gameResults.push('');
    }
    
    const allFields = [...baseFields, ...gameResults, '']; // Empty version field
    return allFields.join('\t');
  });

  return [headerLine, ...playerLines].join('\n') + '\n';
}

export async function writeLadderFile(ladderData: LadderData): Promise<void> {
  await acquireLock();
  
  try {
    log('[SERVER]', `Writing ${ladderData.players.length} players to ${TAB_FILE_PATH}`);
    const content = generateTabContent(ladderData);
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
    
    // Create empty file (no header, format matches input: rank|group|lastName|firstName|...)
    await fs.writeFile(TAB_FILE_PATH, '', 'utf-8');
    log('[SERVER]', `Created default ladder file at ${TAB_FILE_PATH}`);
  }
}
