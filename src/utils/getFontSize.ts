const FONT_SIZE_MAP: Record<string, string> = {
  "50%": "0.5rem",
  "70%": "0.625rem",
  "100%": "0.875rem",
  "140%": "1.25rem",
  "200%": "1.75rem",
};

export function getFontSize(zoomLevel: string): string {
  return FONT_SIZE_MAP[zoomLevel] || "0.875rem";
}
