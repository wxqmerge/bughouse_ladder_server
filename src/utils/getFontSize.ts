const FONT_SIZE_MAP: Record<string, string> = {
  "50%": "0.5rem",
  "70%": "0.625rem",
  "100%": "0.875rem",
  "140%": "1.25rem",
  "200%": "1.75rem",
};

const ZOOM_SCALE_MAP: Record<string, number> = {
  "50%": 0.5,
  "70%": 0.7,
  "100%": 1,
  "140%": 1.4,
  "200%": 2,
};

export function getFontSize(zoomLevel: string): string {
  return FONT_SIZE_MAP[zoomLevel] || "0.875rem";
}

export function getZoomScale(zoomLevel: string): number {
  return ZOOM_SCALE_MAP[zoomLevel] || 1;
}

export function getScaledPadding(zoomLevel: string, baseV: number, baseH: number): string {
  const s = getZoomScale(zoomLevel);
  return `${baseV * s}rem ${baseH * s}rem`;
}

export function getScaledGap(zoomLevel: string, base: number): string {
  const s = getZoomScale(zoomLevel);
  return `${base * s}rem`;
}

export function getScaledLineHeight(zoomLevel: string, base: number): string {
  const s = getZoomScale(zoomLevel);
  return String(base * s);
}
