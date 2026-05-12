import { readLadderFile } from '../src/services/dataService';
import { generateClubLadderTrophies } from '../../shared/utils/trophyGeneration';
import { buildDebugHeader, buildClubLadderPlayerSection, buildTrophiesSection, buildTrophyReportString } from '../../shared/utils/trophyDebugReport';
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

  const headerLines = buildDebugHeader(players, minTrophies, true);
  const clubPlayerLines = buildClubLadderPlayerSection(players, debugLevel);
  const trophiesSectionLines = buildTrophiesSection(trophies);

  const output = buildTrophyReportString(headerLines, clubPlayerLines, trophiesSectionLines);

  const outputDir = path.join(__dirname, '../../src/test/unit/reports');
  const outputPath = path.join(outputDir, '150p_20r_150p_ng0-10_trophies.tab');
  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log('Saved to:', outputPath);
}

main().catch(console.error);
