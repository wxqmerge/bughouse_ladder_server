import { readLadderFile } from '../src/services/dataService';
import { generateClubLadderTrophies, debugLine, clubLadderGamesPlayed } from '../../shared/utils/trophyGeneration';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const debugLevel = 3;
  const filePath = path.join(__dirname, '../../src/test/unit/reports/150p_20r_150p_ng0-10.tab');
  const data = await readLadderFile(filePath);
  const players = data.players;
  const minTrophies = Math.ceil(players.length / 3);

  console.log('Min Trophies:', minTrophies);
  console.log('Total players:', players.length);
  console.log('Eligible:', players.filter(p => p.trophyEligible !== false).length);
  console.log('Ineligible:', players.filter(p => p.trophyEligible === false).length);

  const trophies = generateClubLadderTrophies(players, minTrophies);

  const lines: string[] = [];
  lines.push(debugLine('DEBUG', 'TROPHY REPORT', '', '', '', '', '', ''));
  lines.push(debugLine('Players', String(players.length), '', '', '', '', '', ''));
  lines.push(debugLine('Min Trophies', minTrophies + ' (ceil(' + players.length + ' / 3))', '', '', '', '', '', ''));
  lines.push('');

  if (debugLevel >= 1) {
    const sortedByRating = players.filter(p => p.trophyEligible !== false).sort((a, b) => b.nRating - a.nRating);
    lines.push(debugLine('TOP 5 OVERALL', 'BY RATING (eligible only)', '', '', '', '', '', ''));
    for (let i = 0; i < Math.min(5, sortedByRating.length); i++) {
      const p = sortedByRating[i];
      const g = clubLadderGamesPlayed(p);
      lines.push(debugLine(i + 1, p.firstName + ' ' + p.lastName, p.grade, p.nRating, '', '', String(g), ''));
    }
    const ineligibleOverall = players.filter(p => p.trophyEligible === false).sort((a, b) => b.nRating - a.nRating).slice(0, 1);
    if (ineligibleOverall.length > 0) {
      lines.push('');
      lines.push(debugLine('Top Ineligible', '', '', '', '', '', '', ''));
      for (const p of ineligibleOverall) {
        const g = clubLadderGamesPlayed(p);
        lines.push(debugLine(String(p.rank), p.firstName + ' ' + p.lastName, p.grade, p.nRating, '', '', String(g), ''));
      }
    }
    lines.push('');

    const gradeGroups = [...new Set(players.map(p => p.grade).filter(Boolean))].sort((a, b) => parseInt(b) - parseInt(a));
    for (const grade of gradeGroups) {
      const gradePlayers = players.filter(p => p.grade === grade && p.trophyEligible !== false).sort((a, b) => b.nRating - a.nRating);
      if (gradePlayers.length === 0) continue;
      lines.push('');
      lines.push(debugLine('Gr ' + grade, '', '', '', '', '', '', ''));
      for (let i = 0; i < Math.min(5, gradePlayers.length); i++) {
        const p = gradePlayers[i];
        const g = clubLadderGamesPlayed(p);
        lines.push(debugLine(i + 1, p.firstName + ' ' + p.lastName, p.grade, p.nRating, '', '', String(g), ''));
      }
      const ineligibleGrade = players.filter(p => p.grade === grade && p.trophyEligible === false).sort((a, b) => b.nRating - a.nRating).slice(0, 1);
      if (ineligibleGrade.length > 0) {
        lines.push('');
        lines.push(debugLine('Top Ineligible', '', '', '', '', '', '', ''));
        for (const p of ineligibleGrade) {
          const g = clubLadderGamesPlayed(p);
          lines.push(debugLine(String(p.rank), p.firstName + ' ' + p.lastName, p.grade, p.nRating, '', '', String(g), ''));
        }
      }
    }
  }

  lines.push('');
  lines.push('AWARDED TROPHIES');
  lines.push('Rank\tPlayer\tTrophy Type\tMini-Game/Grade\tGr\tRating\tTotal Games\tGames Played');

  let blankRowInserted = false;
  for (const t of trophies) {
    if (!blankRowInserted && t.trophyType === '1st Place' && t.miniGameOrGrade && t.miniGameOrGrade.startsWith('Gr ')) {
      lines.push('');
      blankRowInserted = true;
    }
    lines.push(t.rank + '\t' + t.player + '\t' + t.trophyType + '\t' + t.miniGameOrGrade + '\t' + t.gr + '\t' + t.rating + '\t' + (t.totalGames || 0) + '\t' + t.gamesPlayed);
  }

  const output = lines.join('\n') + '\n';

  const outputDir = path.join(__dirname, '../../src/test/unit/reports');
  const outputPath = path.join(outputDir, '150p_20r_150p_ng0-10_trophies.tab');
  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log('Saved to:', outputPath);
}

main().catch(console.error);
