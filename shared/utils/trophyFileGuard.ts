const TrophyIndicators = [
  'DEBUG',
  'TROPHY REPORT',
  'Trophy Report',
  'Players\t',
  'Max Trophies',
  'Mode\t',
  'Mini-games played',
  'Award 2nd place',
  'Award grade 1st',
  'MINI-GAME PLAYERS',
  'AWARDED TROPHIES',
];

export function isTrophyReport(content: string): boolean {
  const firstLine = content.split('\n')[0]?.trim() || '';
  return TrophyIndicators.some(indicator => firstLine.startsWith(indicator));
}

export function isValidLadderHeader(content: string): boolean {
  const firstLine = content.split('\n')[0]?.trim() || '';
  return firstLine.startsWith('Group');
}
