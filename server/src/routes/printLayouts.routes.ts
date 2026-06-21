import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireUserKey } from '../middleware/auth.middleware.js';
import { logError } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const DATA_DIR = path.join(__dirname, '../../data');
const LAYOUTS_FILE = path.join(DATA_DIR, 'print_layouts.json');

interface PrintLabelFieldLayout {
  x: number;
  y: number;
  fontSize: number;
}

interface PrintLabelLayout {
  name: string;
  labelsPerPage: 20 | 30;
  fields: Record<string, PrintLabelFieldLayout>;
}

async function readLayouts(): Promise<PrintLabelLayout[]> {
  try {
    const data = await fs.readFile(LAYOUTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeLayouts(layouts: PrintLabelLayout[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LAYOUTS_FILE, JSON.stringify(layouts, null, 2), 'utf-8');
}

// List all layouts
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const layouts = await readLayouts();
    res.json({ success: true, layouts });
  } catch (err) {
    logError('Failed to read print layouts:', String(err));
    res.status(500).json({ success: false, error: { message: 'Failed to read layouts' } });
  }
});

// Create or update layout
router.post('/', requireUserKey, async (req: Request, res: Response): Promise<void> => {
  try {
    const layout: PrintLabelLayout = req.body;
    if (!layout?.name || !layout?.fields || layout.labelsPerPage !== 20 && layout.labelsPerPage !== 30) {
      res.status(400).json({ success: false, error: { message: 'Invalid layout data' } });
      return;
    }

    const layouts = await readLayouts();
    const idx = layouts.findIndex(l => l.name === layout.name && l.labelsPerPage === layout.labelsPerPage);
    if (idx >= 0) {
      layouts[idx] = layout;
    } else {
      layouts.push(layout);
    }
    await writeLayouts(layouts);
    res.json({ success: true, layout });
  } catch (err) {
    logError('Failed to save print layout:', String(err));
    res.status(500).json({ success: false, error: { message: 'Failed to save layout' } });
  }
});

// Delete layout
router.delete('/:name', requireUserKey, async (req: Request, res: Response): Promise<void> => {
  try {
    const layouts = await readLayouts();
    const filtered = layouts.filter(l => l.name !== req.params.name);
    if (filtered.length === layouts.length) {
      res.status(404).json({ success: false, error: { message: 'Layout not found' } });
      return;
    }
    await writeLayouts(filtered);
    res.json({ success: true });
  } catch (err) {
    logError('Failed to delete print layout:', String(err));
    res.status(500).json({ success: false, error: { message: 'Failed to delete layout' } });
  }
});

export { router };
