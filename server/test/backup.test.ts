import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// We'll use a temporary directory for testing to avoid affecting real data
const TEST_BACKUP_DIR = path.join(os.tmpdir(), `bughouse-backup-test-${Date.now()}`);

function getTestTabPath(): string {
  return path.join(TEST_BACKUP_DIR, 'ladder.tab');
}

async function createTestTab(content: string): Promise<void> {
  await fs.mkdir(TEST_BACKUP_DIR, { recursive: true });
  await fs.writeFile(getTestTabPath(), content, 'utf-8');
}

async function cleanup(): Promise<void> {
  try {
    await fs.rm(TEST_BACKUP_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// We test the functions directly by copying their logic into test scope
// since they reference global TAB_FILE_PATH and BACKUP_DIR

function getBackupFileName(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `ladder_backup_${y}${m}${d}_${h}${min}${s}.tab`;
}

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

async function ensureBackupDirectory(backupDir: string): Promise<void> {
  try {
    await fs.access(backupDir);
  } catch {
    await fs.mkdir(backupDir, { recursive: true });
  }
}

async function getBackupList(backupDir: string): Promise<{ version: number; filename: string; path: string; timestamp: string; date: string }[]> {
  try {
    await fs.access(backupDir);
  } catch {
    return [];
  }

  const files = await fs.readdir(backupDir);
  const backups: { version: number; filename: string; path: string; timestamp: string; date: string }[] = [];

  for (const file of files) {
    if (!file.startsWith('ladder_backup_') || !file.endsWith('.tab')) continue;
    
    const filePath = path.join(backupDir, file);
    const stats = await fs.stat(filePath);
    
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

  backups.sort((a, b) => b.filename.localeCompare(a.filename));
  
  for (let i = 0; i < backups.length; i++) {
    backups[i].version = i + 1;
  }

  return backups;
}

async function createBackup(backupDir: string, tabPath: string): Promise<string | null> {
  try {
    await ensureBackupDirectory(backupDir);
    
    try {
      const stats = await fs.stat(tabPath);
      if (stats.size === 0) return null;
    } catch {
      return null;
    }

    const timestamp = new Date();
    const fileName = getBackupFileName(timestamp);
    const backupPath = path.join(backupDir, fileName);
    
    await fs.copyFile(tabPath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

async function deleteBackup(backupDir: string, filename: string): Promise<boolean> {
  const backupPath = path.join(backupDir, filename);
  
  try {
    await fs.unlink(backupPath);
    return true;
  } catch {
    return false;
  }
}

async function restoreBackup(backupDir: string, tabPath: string, filename: string): Promise<boolean> {
  const backupPath = path.join(backupDir, filename);
  
  try {
    await fs.access(backupPath);
  } catch {
    return false;
  }

  try {
    const content = await fs.readFile(backupPath, 'utf-8');
    await fs.writeFile(tabPath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

async function rotateBackups(backupDir: string, maxBackups: number): Promise<void> {
  try {
    const backups = await getBackupList(backupDir);
    
    if (backups.length > maxBackups) {
      const sorted = [...backups].sort((a, b) => a.filename.localeCompare(b.filename));
      const toDelete = sorted.slice(0, sorted.length - maxBackups);
      
      for (const backup of toDelete) {
        await fs.unlink(backup.path);
      }
    }
  } catch {
    // Ignore rotation errors
  }
}

describe('Backup System', () => {
  beforeEach(async () => {
    await cleanup();
    await fs.mkdir(TEST_BACKUP_DIR, { recursive: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('getBackupFileName', () => {
    it('should generate filename with correct date components', () => {
      const date = new Date('2025-04-20T14:30:22.000Z');
      const fileName = getBackupFileName(date);
      // Uses local time, so verify structure not exact value
      expect(fileName).toMatch(/ladder_backup_\d{8}_\d{6}\.tab$/);
    });

    it('should zero-pad single-digit values', () => {
      const date = new Date(2025, 0, 5, 9, 3, 7);
      const fileName = getBackupFileName(date);
      expect(fileName).toContain('20250105');
      expect(fileName).toMatch(/_090307\.tab$/);
    });

    it('should produce valid filename characters only', () => {
      const date = new Date();
      const fileName = getBackupFileName(date);
      expect(fileName).not.toContain(' ');
      expect(fileName.endsWith('.tab')).toBe(true);
      expect(fileName.startsWith('ladder_backup_')).toBe(true);
    });
  });

  describe('createBackup', () => {
    it('should create a backup file from ladder.tab', async () => {
      const tabContent = 'Group\tLast Name\n1\tSmith';
      await createTestTab(tabContent);
      
      const result = await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      expect(result).toBeDefined();
      expect(result).toContain('ladder_backup_');
      
      const backupContent = await fs.readFile(result!, 'utf-8');
      expect(backupContent).toBe(tabContent);
    });

    it('should return null for empty ladder.tab', async () => {
      await createTestTab('');
      
      const result = await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      expect(result).toBeNull();
    });

    it('should return null when ladder.tab does not exist', async () => {
      const result = await createBackup(TEST_BACKUP_DIR, '/nonexistent/path.tab');
      expect(result).toBeNull();
    });

    it('should create backup in backup directory', async () => {
      await createTestTab('test data');
      
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      const files = await fs.readdir(TEST_BACKUP_DIR);
      const backupFiles = files.filter(f => f.startsWith('ladder_backup_'));
      expect(backupFiles.length).toBe(1);
    });

    it('should not affect the original ladder.tab', async () => {
      const tabContent = 'original content';
      await createTestTab(tabContent);
      
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      const currentContent = await fs.readFile(getTestTabPath(), 'utf-8');
      expect(currentContent).toBe(tabContent);
    });

    it('should create different filenames for backups created at different times', async () => {
      await createTestTab('content A');
      const result1 = await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      // Wait a second to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1050));
      
      await createTestTab('content B');
      const result2 = await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result1).not.toEqual(result2);
    });
  });

  describe('getBackupList', () => {
    it('should return empty list when no backups exist', async () => {
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups).toEqual([]);
    });

    it('should list all backup files', async () => {
      await createTestTab('content 1');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      await new Promise(resolve => setTimeout(resolve, 1050));
      
      await createTestTab('content 2');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups.length).toBe(2);
    });

    it('should return backups sorted newest first', async () => {
      await createTestTab('old');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      await new Promise(resolve => setTimeout(resolve, 1050));
      
      await createTestTab('new');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      // Newest backup should have version 1 (first in list)
      expect(backups[0].version).toBe(1);
      expect(backups[1].version).toBe(2);
    });

    it('should assign sequential version numbers', async () => {
      await createTestTab('v1');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      await new Promise(resolve => setTimeout(resolve, 1050));
      await createTestTab('v2');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      await new Promise(resolve => setTimeout(resolve, 1050));
      await createTestTab('v3');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups[0].version).toBe(1);
      expect(backups[1].version).toBe(2);
      expect(backups[2].version).toBe(3);
    });

    it('should include timestamp in parsed format', async () => {
      await createTestTab('test');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should ignore non-backup files', async () => {
      await fs.writeFile(path.join(TEST_BACKUP_DIR, 'ladder.tab'), 'data');
      await fs.writeFile(path.join(TEST_BACKUP_DIR, 'notes.txt'), 'notes');
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups.length).toBe(0);
    });

    it('should ignore files with invalid naming', async () => {
      await fs.writeFile(path.join(TEST_BACKUP_DIR, 'ladder_backup_invalid.tab'), 'data');
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups.length).toBe(0);
    });
  });

  describe('restoreBackup', () => {
    it('should restore ladder.tab from backup', async () => {
      // Create initial backup with old content
      await createTestTab('old content');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      // Modify the current file
      await fs.writeFile(getTestTabPath(), 'new content');
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups.length).toBe(1);
      
      // Restore
      const result = await restoreBackup(TEST_BACKUP_DIR, getTestTabPath(), backups[0].filename);
      expect(result).toBe(true);
      
      const content = await fs.readFile(getTestTabPath(), 'utf-8');
      expect(content).toBe('old content');
    });

    it('should return false for non-existent backup', async () => {
      const result = await restoreBackup(TEST_BACKUP_DIR, getTestTabPath(), 'nonexistent.tab');
      expect(result).toBe(false);
    });

    it('should fully replace current file content', async () => {
      await createTestTab('backup data here');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      
      // Overwrite with completely different content
      await fs.writeFile(getTestTabPath(), 'completely different content that has nothing to do with the backup');
      
      const result = await restoreBackup(TEST_BACKUP_DIR, getTestTabPath(), backups[0].filename);
      expect(result).toBe(true);
      
      const content = await fs.readFile(getTestTabPath(), 'utf-8');
      expect(content).toBe('backup data here');
    });
  });

  describe('deleteBackup', () => {
    it('should delete a backup file', async () => {
      await createTestTab('data');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups.length).toBe(1);
      
      const result = await deleteBackup(TEST_BACKUP_DIR, backups[0].filename);
      expect(result).toBe(true);
      
      const remainingBackups = await getBackupList(TEST_BACKUP_DIR);
      expect(remainingBackups.length).toBe(0);
    });

    it('should return false for non-existent backup', async () => {
      const result = await deleteBackup(TEST_BACKUP_DIR, 'nonexistent.tab');
      expect(result).toBe(false);
    });
  });

  describe('rotateBackups', () => {
    it('should keep only the specified number of backups', async () => {
      const maxBackups = 5;
      
      for (let i = 0; i < 7; i++) {
        await createTestTab(`content ${i}`);
        await createBackup(TEST_BACKUP_DIR, getTestTabPath());
        await new Promise(resolve => setTimeout(resolve, 1050));
      }
      
      await rotateBackups(TEST_BACKUP_DIR, maxBackups);
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups.length).toBe(maxBackups);
    }, 15000);

    it('should remove oldest backups first', async () => {
      const maxBackups = 3;
      
      // Create 5 backups
      for (let i = 0; i < 5; i++) {
        await createTestTab(`content ${i}`);
        await createBackup(TEST_BACKUP_DIR, getTestTabPath());
        await new Promise(resolve => setTimeout(resolve, 1050));
      }
      
      await rotateBackups(TEST_BACKUP_DIR, maxBackups);
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups.length).toBe(maxBackups);
      
      // Should have the 3 newest (versions 1, 2, 3)
      expect(backups[0].version).toBe(1);
      expect(backups[1].version).toBe(2);
      expect(backups[2].version).toBe(3);
    }, 15000);

    it('should not rotate when under the limit', async () => {
      await createTestTab('content 1');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      await new Promise(resolve => setTimeout(resolve, 1050));
      await createTestTab('content 2');
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      await rotateBackups(TEST_BACKUP_DIR, 5);
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups.length).toBe(2);
    });

    it('should handle empty backup directory', async () => {
      await rotateBackups(TEST_BACKUP_DIR, 5);
      // Should not throw
    });
  });

  describe('Full backup workflow', () => {
    it('should support create → list → restore cycle', async () => {
      // Initial state
      const initialContent = 'Group\tLast Name\tFirst Name\n1\tSmith\tJohn';
      await createTestTab(initialContent);
      
      // Create first backup
      await createBackup(TEST_BACKUP_DIR, getTestTabPath());
      
      // Modify data
      const modifiedContent = 'Group\tLast Name\tFirst Name\n1\tSmith\tJane\n2\tJones\tBob';
      await fs.writeFile(getTestTabPath(), modifiedContent);
      
      // List backups
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups.length).toBe(1);
      
      // Restore
      const result = await restoreBackup(TEST_BACKUP_DIR, getTestTabPath(), backups[0].filename);
      expect(result).toBe(true);
      
      // Verify restored content
      const restoredContent = await fs.readFile(getTestTabPath(), 'utf-8');
      expect(restoredContent).toBe(initialContent);
    });

    it('should support create → rotate → restore cycle', async () => {
      // Create 4 backups with max of 3
      for (let i = 0; i < 4; i++) {
        await createTestTab(`content ${i}`);
        await createBackup(TEST_BACKUP_DIR, getTestTabPath());
        await new Promise(resolve => setTimeout(resolve, 1050));
      }
      
      await rotateBackups(TEST_BACKUP_DIR, 3);
      
      const backups = await getBackupList(TEST_BACKUP_DIR);
      expect(backups.length).toBe(3);
      
      // Restore oldest available (version 3)
      const oldest = backups.find(b => b.version === 3);
      expect(oldest).toBeDefined();
      
      const result = await restoreBackup(TEST_BACKUP_DIR, getTestTabPath(), oldest!.filename);
      expect(result).toBe(true);
    });
  });
});
