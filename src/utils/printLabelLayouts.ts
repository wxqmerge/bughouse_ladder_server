import type { PrintLabelLayout } from '../../shared/types';

const STORAGE_KEY = 'print_label_layouts';

/** Default positions from CSS (20/page) — x%, y%, fontSize pt */
const DEFAULT_FIELDS_20: Record<string, { x: number; y: number; fontSize: number }> = {
  ladderName:  { x: 2.5,  y: 13.8, fontSize: 6 },
  group:       { x: 74.3, y: 34.6, fontSize: 24 },
  rating:      { x: 41.3, y: 13.8, fontSize: 12 },
  rank:        { x: 74.3, y: 3.5,  fontSize: 17 },
  grade:       { x: 2.5,  y: 69.2, fontSize: 13 },
  firstName:   { x: 0.8,  y: 27.7, fontSize: 30 },
  lastName:    { x: 24.8, y: 69.2, fontSize: 12 },
  schoolRoom:  { x: 57.8, y: 69.2, fontSize: 10 },
};

/** 30/page font scaling = sqrt(2/3) ≈ 0.816 */
const FONT_SCALE_30 = 0.816;

const DEFAULT_FIELDS_30: Record<string, { x: number; y: number; fontSize: number }> = Object.fromEntries(
  Object.entries(DEFAULT_FIELDS_20).map(([k, v]) => [k, { ...v, fontSize: +(v.fontSize * FONT_SCALE_30).toFixed(1) }])
) as Record<string, { x: number; y: number; fontSize: number }>;

function buildDefaultLayout(name: string, labelsPerPage: 20 | 30): PrintLabelLayout {
  const src = labelsPerPage === 20 ? DEFAULT_FIELDS_20 : DEFAULT_FIELDS_30;
  return {
    name,
    labelsPerPage,
    fields: Object.fromEntries(
      Object.entries(src).map(([k, v]) => [k, { x: v.x, y: v.y, fontSize: v.fontSize }])
    ),
  };
}

function getDefaultLayouts(): PrintLabelLayout[] {
  return [
    buildDefaultLayout('Standard 20', 20),
    buildDefaultLayout('Standard 30', 30),
  ];
}

export function loadLayouts(): PrintLabelLayout[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return getDefaultLayouts();
}

export function saveLayouts(layouts: PrintLabelLayout[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
}

export function getDefaultLayoutsCopy(): PrintLabelLayout[] {
  return getDefaultLayouts();
}

export function exportLayouts(layouts?: PrintLabelLayout[]): string {
  const data = layouts || loadLayouts();
  return JSON.stringify(data, null, 2);
}

export function importLayouts(json: string): PrintLabelLayout[] | null {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter((l: any) =>
      l && typeof l.name === 'string' &&
      (l.labelsPerPage === 20 || l.labelsPerPage === 30) &&
      typeof l.fields === 'object'
    );
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}
