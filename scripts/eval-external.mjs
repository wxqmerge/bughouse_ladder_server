// eval-external.mjs - run the same eval-tasks against an EXTERNAL running server
// (no llama.cpp management). Usage:
//   node eval-external.mjs <label> [baseUrl]
// e.g. node eval-external.mjs nvfp4-baseline  http://10.77.0.10:8096/v1
// Results: eval-results/external-results.json + external-results.md (never touches results.json)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadTasks, extractCode, verifyTaskFull } from './eval-models.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'eval-config.json'), 'utf8'));
const label = process.argv[2];
if (!label) { console.error('usage: node eval-external.mjs <label> [baseUrl]'); process.exit(1); }
const base = (process.argv[3] || 'http://10.77.0.10:8096/v1').replace(/\/$/, '');
const outDir = join(__dirname, config.output_dir);
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'tasks'), { recursive: true });

async function detectModel() {
  try {
    const res = await fetch(`${base}/models`, { headers: { Authorization: 'Bearer sk-123' } });
    const data = await res.json();
    return data.data?.[0]?.id || 'default';
  } catch { return 'default'; }
}

async function callModel(task, model) {
  const t0 = Date.now();
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk-123' },
    body: JSON.stringify({
      model,
      messages: [ { role: 'system', content: task.system }, { role: 'user', content: task.user } ],
      temperature: config.temperature ?? 0,
      max_tokens: config.max_tokens ?? 4096,
      top_p: 0.95,
    }),
    signal: AbortSignal.timeout(config.timeout_ms ?? 120000),
  });
  const data = await res.json();
  const elapsedMs = Date.now() - t0;
  const content = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};
  return { content, elapsedMs, completionTokens: usage.completion_tokens || 0, promptTokens: usage.prompt_tokens || 0 };
}

const model = await detectModel();
const tasks = loadTasks();
const maxScore = tasks.reduce((s, t) => s + t.weight, 0);
console.log(`target=${base}`);
console.log(`model=${model} label=${label} tasks=${tasks.length} maxScore=${maxScore}`);

const results = [];
let crashed = false;
for (const task of tasks) {
  process.stdout.write(`  ${task.id}: ${task.title}... `);
  try {
    const r = await callModel(task, model);
    const code = extractCode(r.content);
    const v = verifyTaskFull(task, code);
    const score = v.status === 'PASS' ? task.weight : 0;
    const tps = r.completionTokens > 0 && r.elapsedMs > 0 ? (r.completionTokens / (r.elapsedMs / 1000)) : 0;
    console.log(`${v.status} (${score}/${task.weight}) [${r.elapsedMs}ms, ${tps.toFixed(1)} tok/s]`);
    writeFileSync(join(outDir, 'tasks', `${task.id}_${label}.txt`), r.content);
    results.push({ taskId: task.id, title: task.title, status: v.status, weight: task.weight, score,
      difficulty: task.difficulty, category: task.category, elapsedMs: r.elapsedMs,
      completionTokens: r.completionTokens, genTps: Math.round(tps * 100) / 100 });
  } catch (err) {
    const msg = err.message || String(err);
    console.log(`ERROR: ${msg.substring(0, 100)}`);
    results.push({ taskId: task.id, title: task.title, status: 'ERROR', weight: task.weight, score: 0,
      difficulty: task.difficulty, category: task.category, error: msg.substring(0, 200) });
    if (/ECONNREFUSED|abort|timeout/i.test(msg)) { crashed = true; console.log('  endpoint may have died, stopping'); break; }
  }
}

const totalScore = results.reduce((s, r) => s + r.score, 0);
const passCount = results.filter(r => r.status === 'PASS').length;
const run = { model, label, base, date: new Date().toISOString().slice(0, 19).replace('T', ' '),
  tasks: results, totalScore, maxScore, passRate: (passCount / tasks.length * 100).toFixed(1), passCount,
  totalTasks: tasks.length, serverDied: crashed, completedTasks: results.length };

const jsonPath = join(outDir, 'external-results.json');
let combined = [];
if (existsSync(jsonPath)) { try { combined = JSON.parse(readFileSync(jsonPath, 'utf8')); } catch {} }
combined.push(run);
writeFileSync(jsonPath, JSON.stringify(combined, null, 2));

let md = `# External eval results (live proxy targets)\n\n`;
md += `| Label | Model | Date | Score | Pass | Pass time | Status |\n`;
md += `|-------|-------|------|-------|------|-----------|--------|\n`;
for (const r of combined) {
  const pt = r.tasks.filter(t => t.status === 'PASS').reduce((s, t) => s + t.elapsedMs, 0);
  md += `| ${r.label} | ${r.model} | ${r.date} | ${r.totalScore}/${r.maxScore} | ${r.passRate}% | ${(pt / 1000).toFixed(1)}s | ${r.serverDied ? 'DIED' : 'OK'} |\n`;
}
writeFileSync(join(outDir, 'external-results.md'), md);
console.log(`\nScore: ${run.totalScore}/${run.maxScore} (${run.passRate}%) -> ${join(outDir, 'external-results.md')}`);
