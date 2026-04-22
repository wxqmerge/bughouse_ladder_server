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

export function log(category: string, message: string, ...args: any[]): void {
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

const BACKUP_DIR = process.env.BACKUP_DIR
  || path.join(__dirname, '../../data/backups');

const MAX_BACKUPS = 20;

// Initialize on module load
initializeDefaultLadder().catch(err => 
  log('[SERVER]', 'Failed to initialize default ladder:', err)
);

export interface BackupInfo {
  version: number;
  filename: string;
  path: string;
  timestamp: string;
  date: string;
}

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
    
    // Detect format by header content: new LadderForm format has "Gms" column, old VB6 doesn't
    const isNewFormat = header.includes('Gms');
    
    // Parse player data
    const players: PlayerData[] = [];
    
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const fields = line.split('\t');
      
      // Skip empty rows or footer rows
      if (fields.length < 4 || (!fields[1] && !fields[2])) {
        continue;
      }
      
      let player: PlayerData;
      
      if (isNewFormat) {
        // New LadderForm format:
        // Group(0)|Last Name(1)|First Name(2)|Rating(3)|Rnk(4)|N Rate(5)|Gr(6)|Gms(7)|Attendance(8)|Phone(9)|Info(10)|School(11)|Room(12)|Games...(13+)
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
          nRating: parseInt(fields[5]) || 0,
          grade: fields[6] || '',
          num_games: parseInt(fields[7]) || 0,
          attendance: fields[8] || '',
          phone: fields[9] || '',
          info: fields[10] || '',
          school: fields[11] || '',
          room: fields[12] || '',
          gameResults: gameResults,
        };
      } else {
        // Old VB6 ladder format:
        // Group(0)|Last Name(1)|First Name(2)|Rating(3)|Rnk(4)|N Rate(5)|Gr(6)|blank(7)|X(8)|Phone(9)|Info(10)|School(11)|Room(12)|Games...(13+)
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
          num_games: gameResults.filter(r => r !== null && r !== '').length || 0,
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

    // Assign sequential ranks to any players with rank 0 (missing/empty rank field)
    let nextRank = 1;
    for (const player of players) {
      if (player.rank === 0) {
        player.rank = nextRank;
      } else {
        nextRank = Math.max(nextRank, player.rank + 1);
      }
    }

    return { header, players, rawLines: dataLines };
  } finally {
    releaseLock();
  }
  });
}

export function generateTabContent(ladderData: LadderData): string {
  // Output format matches LadderForm export (new LadderForm format with Gms preserved)
  
  const headerLine = 'Group\tLast Name\tFirst Name\tRating\tRnk\tN Rate\tGr\tGms\tAttendance\tPhone\tInfo\tSchool\tRoom\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12\t13\t14\t15\t16\t17\t18\t19\t20\t21\t22\t23\t24\t25\t26\t27\t28\t29\t30\t31\tVersion 1.21';
  
  const playerLines = ladderData.players.map(player => {
    const baseFields = [
      player.group || '', // Group
      player.lastName || '', // Last Name
      player.firstName || '', // First Name
      player.rating?.toString() || '0', // Rating
      player.rank?.toString() || '0', // Rnk
      player.nRating?.toString() || '0', // N Rate
      player.grade || '', // Gr
      (player.num_games ?? 0).toString(), // Gms - preserved from input
      player.attendance?.toString() || '', // Attendance
      player.phone || '', // Phone
      player.info || '', // Info
      player.school || '', // School
      player.room || '', // Room
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
      
      // Create backup before write
      const backupPath = await createBackup();
      if (backupPath) {
        await rotateBackups();
      }
      
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

// ── Backup System ──────────────────────────────────────────────────

function getBackupFileName(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `ladder_backup_${y}${m}${d}_${h}${min}${s}.tab`;
}

export async function getBackupList(): Promise<BackupInfo[]> {
  try {
    await fs.access(BACKUP_DIR);
  } catch {
    return [];
  }

  const files = await fs.readdir(BACKUP_DIR);
  const backups: BackupInfo[] = [];

  for (const file of files) {
    if (!file.startsWith('ladder_backup_') || !file.endsWith('.tab')) continue;
    
    const filePath = path.join(BACKUP_DIR, file);
    const stats = await fs.stat(filePath);
    
    // Extract date from filename: ladder_backup_YYYYMMDD_HHMMSS.tab
    const match = file.match(/ladder_backup_(\d{8})_(\d{6})\.tab$/);
    if (!match) continue;
    
    const dateStr = match[1];
    const timeStr = match[2];
    const timestamp = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)} ${timeStr.slice(0,2)}:${timeStr.slice(2,4)}:${timeStr.slice(4,6)}`;
    
    backups.push({
      version: 0,
      filename: file,
      path: filePath,
      timestamp,
      date: stats.mtime.toISOString(),
    });
  }

  // Sort by filename (which embeds timestamp) descending - newest first
  backups.sort((a, b) => b.filename.localeCompare(a.filename));
  
  // Assign version numbers (1 = most recent backup that would be created next)
  for (let i = 0; i < backups.length; i++) {
    backups[i].version = i + 1;
  }

  return backups;
}

export async function createBackup(): Promise<string | null> {
  try {
    await ensureBackupDirectory();
    
    // Only backup if ladder.tab exists and has content
    try {
      const stats = await fs.stat(TAB_FILE_PATH);
      if (stats.size === 0) return null;
    } catch {
      return null;
    }

    const timestamp = new Date();
    const fileName = getBackupFileName(timestamp);
    const backupPath = path.join(BACKUP_DIR, fileName);
    
    await fs.copyFile(TAB_FILE_PATH, backupPath);
    log('[SERVER]', `Created backup: ${fileName}`);
    return backupPath;
  } catch (error) {
    log('[SERVER]', `Failed to create backup: ${(error as Error).message}`);
    return null;
  }
}

export async function ensureBackupDirectory(): Promise<void> {
  try {
    await fs.access(BACKUP_DIR);
  } catch {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  }
}

export async function restoreBackup(filename: string): Promise<boolean> {
  const backupPath = path.join(BACKUP_DIR, filename);
  
  try {
    await fs.access(backupPath);
  } catch {
    log('[SERVER]', `Backup not found: ${filename}`);
    return false;
  }

  try {
    const content = await fs.readFile(backupPath, 'utf-8');
    await fs.writeFile(TAB_FILE_PATH, content, 'utf-8');
    log('[SERVER]', `Restored from backup: ${filename}`);
    return true;
  } catch (error) {
    log('[SERVER]', `Failed to restore backup ${filename}: ${(error as Error).message}`);
    return false;
  }
}

export async function deleteBackup(filename: string): Promise<boolean> {
  const backupPath = path.join(BACKUP_DIR, filename);
  
  try {
    await fs.unlink(backupPath);
    log('[SERVER]', `Deleted backup: ${filename}`);
    return true;
  } catch {
    log('[SERVER]', `Failed to delete backup: ${filename}`);
    return false;
  }
}

export async function rotateBackups(): Promise<void> {
  try {
    const backups = await getBackupList();
    
    if (backups.length > MAX_BACKUPS) {
      // Sort ascending (oldest first), delete excess
      const sorted = [...backups].sort((a, b) => a.filename.localeCompare(b.filename));
      const toDelete = sorted.slice(0, sorted.length - MAX_BACKUPS);
      
      for (const backup of toDelete) {
        await fs.unlink(backup.path);
        log('[SERVER]', `Rotated out old backup: ${backup.filename}`);
      }
    }
  } catch (error) {
    log('[SERVER]', `Backup rotation failed: ${(error as Error).message}`);
  }
}

// Create backup before write and rotate after
export async function createPreWriteBackup(): Promise<void> {
  await ensureBackupDirectory();
  const backupPath = await createBackup();
  if (backupPath) {
    await rotateBackups();
  }
}
