import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log as loggerLog } from '../utils/logger.js';
export { loggerLog as log };

// Server-side PlayerData - kept inline due to NodeNext module resolution constraints
// Canonical definition is in shared/types/index.ts
export interface PlayerData {
  rank: number;
  group: string;
  lastName: string;
  firstName: string;
  rating: number;
  nRating: number;
  trophyEligible: boolean;
  grade: string;
  num_games: number;
  attendance: number;
  info: string;
  phone: string;
  school: string;
  room: string;
  gameResults: (string | null)[];
}

import { withTiming as _withTiming } from '../utils/performance.js';
// Re-export for use in other modules
export { withTiming } from '../utils/performance.js';

// Use local alias for internal use
const withTiming = _withTiming;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server version (read from package.json)
export const serverVersion = JSON.parse(fsSync.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')).version;

// Define TAB_FILE_PATH before any function that uses it
const TAB_FILE_PATH = process.env.TAB_FILE_PATH 
  || path.join(__dirname, '../../data/ladder.tab');

const BACKUP_DIR = process.env.BACKUP_DIR
  || path.join(__dirname, '../../data/backups');

const MAX_BACKUPS = 20;

// Write health tracking
export interface WriteHealth {
  lastWriteTime: string;
  lastWriteSuccess: boolean;
  lastError: string | null;
  lastErrorTime: string | null;
  consecutiveFailures: number;
}

const writeHealth: WriteHealth = {
  lastWriteTime: '',
  lastWriteSuccess: true,
  lastError: null,
  lastErrorTime: null,
  consecutiveFailures: 0,
};

export function getWriteHealth(): WriteHealth {
  return { ...writeHealth };
}

// Initialize on module load
initializeDefaultLadder().catch(err => 
  loggerLog('[SERVER]', 'Failed to initialize default ladder:', err)
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

export async function readLadderFile(filePath?: string): Promise<LadderData> {
  const targetPath = filePath || TAB_FILE_PATH;
  return withTiming('readLadderFile', async () => {
    await acquireLock();
    
    try {
      let content = await fs.readFile(targetPath, 'utf-8');
      let lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return { header: [], players: [], rawLines: [] };
    }

    // First line must be the header - validate Round 1 column
    const firstLine = lines[0];
    const headerCols = firstLine.split('\t');
    if (headerCols[13] && headerCols[13].trim() !== '1') {
      loggerLog('[SERVER]', `Warning: Header Round 1 column contains "${headerCols[13]}" instead of "1". File may be corrupted.`);
    }

    // Detect and repair duplicate header: if line[1] is also a header (has "Round 1" in col 13), skip it
    let dataLines = lines.slice(1);
    let repaired = false;
    if (dataLines.length > 0) {
      const secondLine = dataLines[0];
      const secondLineCols = secondLine.split('\t');
      let isHeader = secondLineCols[13] && secondLineCols[13].trim() === '1';
      
      if (!isHeader && secondLine.includes('Last Name') && secondLine.includes('First Name')) {
        const normCols = secondLine.replace(/\r/g, '').split('\t');
        isHeader = normCols[13] && normCols[13].trim() === '1';
      }
      
      if (isHeader) {
        loggerLog('[SERVER]', `Repairing duplicate header in ${targetPath}`);
        dataLines = dataLines.slice(1);
        lines = [lines[0], ...dataLines];
        repaired = true;
      }
    }
    
    // Write repaired content back to disk
    if (repaired) {
      const repairedContent = lines.join('\n') + '\n';
      await fs.writeFile(targetPath, repairedContent, 'utf-8');
      loggerLog('[SERVER]', `Wrote repaired file: ${targetPath}`);
    }
    
    const players: PlayerData[] = [];
    
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const fields = line.split('\t');
      
      // Skip empty rows or footer rows
      if (fields.length < 4 || (!fields[1] && !fields[2])) {
        continue;
      }
      
      const gameResults: (string | null)[] = [];
      for (let r = 0; r < 31; r++) {
        const value = fields[13 + r]?.trim() || '';
        gameResults.push(value || null);
      }
      
      const ratingStr = String(fields[3] || '').trim();
      const isNegRating = ratingStr.startsWith('-');
      const nRateStr = String(fields[5] || '').trim();
      
      players.push({
        rank: parseInt(fields[4]) || 0,
        group: fields[0] || '',
        lastName: fields[1] || '',
        firstName: fields[2] || '',
        rating: Math.abs(parseInt(ratingStr)) || 0,
        nRating: Math.abs(parseInt(nRateStr)) || 0,
        trophyEligible: !isNegRating,
        grade: fields[6] || '',
        num_games: parseInt(fields[7]) || 0,
        attendance: parseInt(fields[8]) || 0,
        phone: fields[9] || '',
        info: fields[10] || '',
        school: fields[11] || '',
        room: fields[12] || '',
        gameResults,
      });
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

    return { header: [], players, rawLines: dataLines };
  } finally {
    releaseLock();
  }
  });
}

export function generateTabContent(ladderData: LadderData): string {
  // Output format matches LadderForm export (new LadderForm format with Gms preserved)
  
  const headerLine = `Group\tLast Name\tFirst Name\tRating\tRnk\tN Rate\tGr\tGms\tAttendance\tPhone\tInfo\tSchool\tRoom\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12\t13\t14\t15\t16\t17\t18\t19\t20\t21\t22\t23\t24\t25\t26\t27\t28\t29\t30\t31\tVersion ${serverVersion}`;
  
  const playerLines = ladderData.players.map(player => {
    const baseFields = [
      player.group || '', // Group
      player.lastName || '', // Last Name
      player.firstName || '', // First Name
      (player.trophyEligible !== false ? player.rating : '-' + player.rating).toString() || '0', // Rating
      player.rank?.toString() || '0', // Rnk
      (player.trophyEligible !== false ? player.nRating : '-' + player.nRating).toString() || '0', // N Rate
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

export async function writeLadderFile(ladderData: LadderData, filePath?: string): Promise<void> {
  const targetPath = filePath || TAB_FILE_PATH;
  return withTiming('writeLadderFile', async () => {
    await acquireLock();
    
    try {
      loggerLog('[SERVER]', `Writing ${ladderData.players.length} players to ${targetPath}`);
      
      // Create backup before write (skip during tests)
      if (!process.env.VITEST && !filePath) {
        try {
          const backupPath = await createBackup();
          if (backupPath) {
            await rotateBackups();
          }
        } catch (backupErr) {
          loggerLog('[SERVER]', `Backup failed (continuing write): ${(backupErr as Error).message}`);
        }
      }
      
      const content = generateTabContent(ladderData);
      await fs.writeFile(targetPath, content, 'utf-8');
      
      writeHealth.lastWriteTime = new Date().toISOString();
      writeHealth.lastWriteSuccess = true;
      writeHealth.lastError = null;
      writeHealth.lastErrorTime = null;
      writeHealth.consecutiveFailures = 0;
    } catch (err) {
      writeHealth.lastWriteSuccess = false;
      writeHealth.lastError = (err as Error).message;
      writeHealth.lastErrorTime = new Date().toISOString();
      writeHealth.consecutiveFailures++;
      throw err;
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
      loggerLog('[SERVER]', `Copied vb6_ladder.tab to ${TAB_FILE_PATH}`);
    } catch {
      // Create empty file
      await fs.writeFile(TAB_FILE_PATH, '', 'utf-8');
      loggerLog('[SERVER]', `Created default ladder file at ${TAB_FILE_PATH}`);
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
    loggerLog('[SERVER]', `Created backup: ${fileName}`);
    return backupPath;
  } catch (error) {
    loggerLog('[SERVER]', `Failed to create backup: ${(error as Error).message}`);
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
    loggerLog('[SERVER]', `Backup not found: ${filename}`);
    return false;
  }

  try {
    const content = await fs.readFile(backupPath, 'utf-8');
    await fs.writeFile(TAB_FILE_PATH, content, 'utf-8');
    loggerLog('[SERVER]', `Restored from backup: ${filename}`);
    return true;
  } catch (error) {
    loggerLog('[SERVER]', `Failed to restore backup ${filename}: ${(error as Error).message}`);
    return false;
  }
}

export async function deleteBackup(filename: string): Promise<boolean> {
  const backupPath = path.join(BACKUP_DIR, filename);
  
  try {
    await fs.unlink(backupPath);
    loggerLog('[SERVER]', `Deleted backup: ${filename}`);
    return true;
  } catch {
    loggerLog('[SERVER]', `Failed to delete backup: ${filename}`);
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
        loggerLog('[SERVER]', `Rotated out old backup: ${backup.filename}`);
      }
    }
  } catch (error) {
    loggerLog('[SERVER]', `Backup rotation failed: ${(error as Error).message}`);
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
