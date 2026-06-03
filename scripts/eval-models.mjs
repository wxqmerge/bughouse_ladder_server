import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, 'eval-config.json'), 'utf8'));
const taskDir = join(__dirname, config.task_dir);
const outputDir = join(__dirname, config.output_dir);
const projectRoot = config.project_root;
const llamaDir = config.llama_dir || 'D:\\llama.cpp.b9464';
const apiKey = config.apiKey || 'sk-123';
const tempDir = join(projectRoot, 'src', 'temp');

mkdirSync(outputDir, { recursive: true });
mkdirSync(join(outputDir, 'tasks'), { recursive: true });
mkdirSync(tempDir, { recursive: true });

function cleanupTemp() {
  try {
    const files = readdirSync(tempDir);
    for (const file of files) {
      unlinkSync(join(tempDir, file));
    }
  } catch {}
}

function loadTasks() {
  cleanupTemp();
  const tasks = [];
  for (let i = 1; i <= 15; i++) {
    const file = join(taskDir, `task${String(i).padStart(2, '0')}.json`);
    if (existsSync(file)) {
      tasks.push(JSON.parse(readFileSync(file, 'utf8')));
    }
  }
  return tasks;
}

async function waitForServer(port, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

async function getModelName(port) {
  try {
    const res = await fetch(`http://localhost:${port}/v1/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const data = await res.json();
    const model = data.data?.[0];
    if (model) {
      const name = model.id || model.name || 'unknown';
      const base = name.split('/').pop();
      return base.replace(/\.[^.]+$/, '');
    }
  } catch {}
  return `port-${port}`;
}

async function isPortFree(port, timeoutMs = 2000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    await fetch(`http://localhost:${port}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return false; // port is in use
  } catch {
    return true; // port is free
  }
}

async function killStaleProcess(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
    const pids = [...output.matchAll(/(\d+)\s*$/g)].map(m => m[1]);
    for (const pid of pids) {
      console.log(`  Killing stale process ${pid} on port ${port}`);
      try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'pipe' }); } catch {}
    }
    await new Promise(r => setTimeout(r, 2000));
  } catch {}
}

async function startModel(batchFile, port) {
  const batchPath = join(llamaDir, batchFile);
  if (!existsSync(batchPath)) {
    return { proc: null, error: `Batch file not found: ${batchPath}` };
  }

  // Kill any stale process on this port before starting
  const wasInUse = await isPortFree(port, 1000);
  if (!wasInUse) {
    console.log(`  Port ${port} already in use, cleaning up...`);
    await killStaleProcess(port);
  }

  console.log(`  Starting: ${batchFile}`);
  const proc = spawn(batchPath, [], {
    cwd: llamaDir,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (d) => {
    const line = d.toString().trim();
    if (line.includes('llm_load_tensors') || line.includes('model loaded') || line.includes('svr_http')) {
      console.log(`  [server] ${line}`);
    }
  });
  proc.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (line.includes('error') || line.includes('Error')) {
      console.error(`  [stderr] ${line}`);
    }
  });

  // Wait for the spawned process to stay alive (not crash immediately)
  const aliveCheck = new Promise((resolve) => {
    setTimeout(() => resolve(!proc.killed), 3000);
  });
  const alive = await aliveCheck;
  if (!alive) {
    return { proc: null, error: `Batch file exited immediately — server may be invalid` };
  }

  const ready = await waitForServer(port);
  if (!ready) {
    stopModel(proc);
    return { proc: null, error: `Server did not start on port ${port} within timeout` };
  }

  return { proc, error: null };
}

function stopModel(proc) {
  if (!proc || proc.killed) return;
  console.log('  Stopping server...');
  try {
    execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'pipe' });
  } catch {
    // Process may have already exited
  }
  // Force kill after 5 seconds
  setTimeout(() => {
    try {
      if (!proc.killed) {
        execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'pipe' });
      }
    } catch {}
  }, 5000);
}

async function callModel(port, task) {
  const startTime = Date.now();
  const response = await fetch(`http://localhost:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'local',
      messages: [
        { role: 'system', content: task.system },
        { role: 'user', content: task.user },
      ],
      temperature: config.temperature ?? 0,
      max_tokens: config.max_tokens ?? 4096,
      top_p: 0.95,
    }),
    signal: AbortSignal.timeout(config.timeout_ms ?? 120000),
  });

  const data = await response.json();
  const elapsed = Date.now() - startTime;
  const content = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};
  const timings = data.timings || {};

  return {
    content,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    elapsedMs: elapsed,
    promptEvalTimeMs: timings.prompt_ms || 0,
    generationTimeMs: timings.predicted_ms || 0,
    promptEvalTps: timings.prompt_per_second || 0,
    genTps: timings.predicted_per_second || 0,
    draftTokens: timings.draft_n || 0,
    draftAccepted: timings.draft_n_accepted || 0,
  };
}

function extractCode(content) {
  const codeBlockMatch = content.match(/```(?:typescript|tsx|js|jsx)?\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  const trimmed = content.trim();
  if (trimmed.startsWith('```')) {
    const noFence = trimmed.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');
    return noFence.trim();
  }
  return trimmed;
}

function createHarness(task, codeFile) {
  if (!task.expected_exports?.length) return;
  let harness = `import * as code from './${task.id}';\n\n`;
  for (const exp of task.expected_exports) {
    harness += `const _check_${exp}: typeof code.${exp} = code.${exp};\n`;
  }
  writeFileSync(join(tempDir, `${task.id}.harness.ts`), harness);
}

function fixMissingExport(code, expectedExports) {
  if (!expectedExports?.length) return code;
  const missing = expectedExports.filter(exp =>
    !code.includes(`export function ${exp}`) &&
    !code.includes(`export const ${exp}`) &&
    !code.includes(`export default`)
  );
  if (missing.length === 0) return code;
  let fixed = code;
  for (const exp of missing) {
    // Match "function name" at start of line (with optional leading whitespace)
    const fnRegex = new RegExp(`^(\\s*)function\\s+${exp}\\b`, 'm');
    if (fnRegex.test(fixed)) {
      fixed = fixed.replace(fnRegex, '$1export function ' + exp);
      continue;
    }
    // Match "const name =" at start of line
    const constRegex = new RegExp(`^(\\s*)const\\s+${exp}\\s*=`, 'm');
    if (constRegex.test(fixed)) {
      fixed = fixed.replace(constRegex, '$1export const ' + exp + ' =');
    }
  }
  return fixed;
}

function verifyTask(task, code) {
  cleanupTemp();
  const codeFile = join(tempDir, `${task.id}.ts`);
  let effectiveCode = code;

  writeFileSync(codeFile, effectiveCode);
  createHarness(task, codeFile);

  try {
    execSync('npx tsc --noEmit --pretty false', {
      cwd: projectRoot,
      timeout: 30000,
      stdio: 'pipe',
    });
    return { status: 'PASS', output: '' };
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || String(err.message);
    const errors = output.split('\n').filter(line =>
      (line.includes(`${task.id}.ts`) || line.includes(`${task.id}.harness.ts`)) && line.includes('error')
    );
    if (errors.length === 0) {
      return { status: 'PASS', output: '' };
    }

    const hasModuleError = output.includes('TS2306') && output.includes('not a module');
    const hasMissingProp = output.includes('TS2339') && output.includes(`${task.id}.harness.ts`);
    if (hasModuleError || hasMissingProp) {
      const fixed = fixMissingExport(code, task.expected_exports);
      if (fixed !== code) {
        writeFileSync(codeFile, fixed);
        createHarness(task, codeFile);
        try {
          execSync('npx tsc --noEmit --pretty false', {
            cwd: projectRoot,
            timeout: 30000,
            stdio: 'pipe',
          });
          return { status: 'PASS', output: '' };
        } catch (err2) {
          const output2 = err2.stdout?.toString() || err2.stderr?.toString() || String(err2.message);
          const errors2 = output2.split('\n').filter(line =>
            (line.includes(`${task.id}.ts`) || line.includes(`${task.id}.harness.ts`)) && line.includes('error')
          );
          if (errors2.length > 0) {
            return { status: 'TSC_FAIL', output: errors2.join('\n').substring(0, 500) };
          }
          return { status: 'PASS', output: '' };
        }
      }
    }
    return { status: 'TSC_FAIL', output: errors.join('\n').substring(0, 500) };
  } finally {
    cleanupTemp();
  }
}

function runTests(task, code) {
  cleanupTemp();
  const codeFile = join(tempDir, `${task.id}.ts`);
  let effectiveCode = code;

  writeFileSync(codeFile, effectiveCode);
  createHarness(task, codeFile);

  const testFile = join(tempDir, `${task.id}.test.ts`);
  writeFileSync(testFile, task.test_code);

  try {
    const result = execSync(`npx vitest run "src/temp/${task.id}.test.ts"`, {
      cwd: projectRoot,
      timeout: 60000,
      stdio: 'pipe',
    });
    return { passed: true, output: result.toString() };
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || String(err.message);
    const hasModuleError = output.includes('TS2306') && output.includes('not a module');
    if (hasModuleError) {
      const fixed = fixMissingExport(code, task.expected_exports);
      if (fixed !== code) {
        writeFileSync(codeFile, fixed);
        createHarness(task, codeFile);
        writeFileSync(testFile, task.test_code);
        try {
          const result = execSync(`npx vitest run "src/temp/${task.id}.test.ts"`, {
            cwd: projectRoot,
            timeout: 60000,
            stdio: 'pipe',
          });
          return { passed: true, output: result.toString() };
        } catch (err2) {
          return { passed: false, output: err2.stdout?.toString() || err2.stderr?.toString() || String(err2.message) };
        }
      }
    }
    return { passed: false, output };
  } finally {
    cleanupTemp();
  }
}

function verifyTaskFull(task, code) {
  const tscResult = verifyTask(task, code);
  let testResult = { passed: true, output: '' };

  if (task.verification === 'tsc+test' && tscResult.status === 'PASS') {
    testResult = runTests(task, code);
  }

  if (task.verification === 'tsc' || task.verification === 'tsc+test') {
    return {
      status: tscResult.status === 'PASS' ? (testResult.passed ? 'PASS' : 'TEST_FAIL') : 'TSC_FAIL',
      tscOutput: tscResult.output,
      testOutput: testResult.output,
    };
  }

  return {
    status: code.length > 10 ? 'PASS' : 'EMPTY',
    tscOutput: '',
    testOutput: '',
  };
}

function saveTaskOutput(modelName, task, result) {
  const safeName = modelName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outputPath = join(outputDir, 'tasks', `${task.id}_${safeName}.txt`);
  writeFileSync(outputPath, result.content);
}

async function runModel(model) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Model config: ${model.batch} (port ${model.port})`);
  console.log(`${'='.repeat(60)}`);

  const { proc, error } = await startModel(model.batch, model.port);
  if (error || !proc) {
    console.log(`  SKIP: ${error}`);
    return null;
  }

  const modelName = await getModelName(model.port);
  console.log(`  Detected model: ${modelName}`);

  const tasks = loadTasks();
  const results = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalElapsed = 0;
  let totalGenTime = 0;
  let totalDraftTokens = 0;
  let totalDraftAccepted = 0;
  const genTimes = [];
  const draftRates = [];
  let serverCrashed = false;

  try {
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      process.stdout.write(`  ${task.id}: ${task.title}... `);

      try {
        const result = await callModel(model.port, task);
        const code = extractCode(result.content);
        const verification = verifyTaskFull(task, code);

        saveTaskOutput(modelName, task, result);

        totalPromptTokens += result.promptTokens;
        totalCompletionTokens += result.completionTokens;
        totalElapsed += result.elapsedMs;
        totalGenTime += result.generationTimeMs;
        totalDraftTokens += result.draftTokens;
        totalDraftAccepted += result.draftAccepted;
        if (result.genTps > 0) genTimes.push(result.genTps);
        if (result.draftTokens > 0) {
          draftRates.push(result.draftAccepted / result.draftTokens);
        }

        const score = verification.status === 'PASS' ? task.weight : 0;
        console.log(`${verification.status} (${score}/${task.weight}) [${result.elapsedMs}ms]`);

        results.push({
          taskId: task.id,
          title: task.title,
          status: verification.status,
          weight: task.weight,
          score,
          difficulty: task.difficulty,
          category: task.category,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          elapsedMs: result.elapsedMs,
          genTps: result.genTps,
          promptEvalTps: result.promptEvalTps,
          draftTokens: result.draftTokens,
          draftAccepted: result.draftAccepted,
          tscOutput: verification.tscOutput?.substring(0, 200),
          testOutput: verification.testOutput?.substring(0, 200),
        });
      } catch (err) {
        const errMsg = err.message || String(err);
        console.log(`ERROR: ${errMsg.substring(0, 100)}`);
        results.push({
          taskId: task.id,
          title: task.title,
          status: 'ERROR',
          weight: task.weight,
          score: 0,
          difficulty: task.difficulty,
          category: task.category,
          error: errMsg.substring(0, 200),
        });

        // If multiple consecutive errors, server likely crashed
        if (err.message && (err.message.includes('ECONNREFUSED') || err.message.includes('abort') || err.message.includes('timeout'))) {
          serverCrashed = true;
          console.log(`  Server may have crashed, stopping remaining tasks...`);
          break;
        }
      }
    }
  } finally {
    stopModel(proc);
  }

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const maxScore = tasks.reduce((sum, t) => sum + t.weight, 0);
  const passResults = results.filter(r => r.status === 'PASS');
  const passCount = passResults.length;
  const totalPassTime = passResults.reduce((sum, r) => sum + r.elapsedMs, 0);
  const avgGenTps = genTimes.length > 0 ? (genTimes.reduce((a, b) => a + b, 0) / genTimes.length) : 0;
  const avgDraftRate = draftRates.length > 0 ? (draftRates.reduce((a, b) => a + b, 0) / draftRates.length) : 0;

  return {
    model: modelName,
    batch: model.batch,
    port: model.port,
    tasks: results,
    totalScore,
    maxScore,
    passRate: (passCount / tasks.length * 100).toFixed(1),
    passCount,
    totalTasks: tasks.length,
    totalPromptTokens,
    totalCompletionTokens,
    avgResponseTime: Math.round(totalElapsed / (results.length || 1)),
    totalPassTime: totalPassTime,
    avgGenTps: Math.round(avgGenTps * 100) / 100,
    avgDraftRate: Math.round(avgDraftRate * 10000) / 100,
    totalDraftTokens,
    totalDraftAccepted,
    serverCrashed,
    completedTasks: results.length,
  };
}

async function main() {
  console.log('LLM Model Evaluation - Bughouse Chess Ladder');
  console.log(`Tasks: ${loadTasks().length} | Models: ${config.models.length}`);
  console.log(`Max score: ${loadTasks().reduce((s, t) => s + t.weight, 0)}`);
  console.log(`Llama dir: ${llamaDir}`);

  const allResults = [];

  for (const model of config.models) {
    console.log(`\n[${allResults.length + 1}/${config.models.length}] Running model...`);
    const result = await runModel(model);
    if (result) {
      allResults.push(result);
      let status = `Score: ${result.totalScore}/${result.maxScore} (${result.passRate}% pass rate)`;
      if (result.totalPassTime > 0) status += ` [Pass time: ${(result.totalPassTime / 1000).toFixed(1)}s]`;
      if (result.serverCrashed) status += ` [SERVER CRASHED after ${result.completedTasks}/${result.totalTasks} tasks]`;
      if (result.completedTasks < result.totalTasks && !result.serverCrashed) status += ` [INCOMPLETE: ${result.completedTasks}/${result.totalTasks}]`;
      console.log(`  ${status}`);
    }
    // Extra wait to ensure process tree is fully killed
    await new Promise(r => setTimeout(r, 8000));
  }

  writeFileSync(join(outputDir, 'results.json'), JSON.stringify(allResults, null, 2));

  const md = generateMarkdown(allResults);
  writeFileSync(join(outputDir, 'results.md'), md);

  console.log(`\n${'='.repeat(60)}`);
  console.log('Results saved to:');
  console.log(`  ${join(outputDir, 'results.json')}`);
  console.log(`  ${join(outputDir, 'results.md')}`);
  console.log(`${'='.repeat(60)}`);
}

function generateMarkdown(results) {
  const skipped = config.models.length - results.length;
  let md = `# LLM Model Evaluation Results\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Models tested:** ${results.length}/${config.models.length} (${skipped} skipped)\n\n`;

  md += `## Summary\n\n`;
  md += `| Model | Batch | Score | Pass Rate | Pass Time | Gen TPS | Draft Rate | Status | Tasks |\n`;
  md += `|-------|-------|-------|-----------|-----------|---------|------------|--------|-------|\n`;

  const sorted = [...results].sort((a, b) => b.totalScore - a.totalScore || a.totalPassTime - b.totalPassTime);

  for (const r of sorted) {
    const draftPct = r.totalDraftTokens > 0 ? `${(r.totalDraftAccepted / r.totalDraftTokens * 100).toFixed(1)}%` : '-';
    const status = r.serverCrashed ? 'CRASHED' : (r.completedTasks < r.totalTasks ? 'INCOMPLETE' : 'OK');
    const passTimeStr = r.totalPassTime > 0 ? `${(r.totalPassTime / 1000).toFixed(1)}s` : '-';
    md += `| ${r.model} | ${r.batch} | ${r.totalScore}/${r.maxScore} | ${r.passRate}% | ${passTimeStr} | ${r.avgGenTps} | ${draftPct} | ${status} | ${r.completedTasks}/${r.totalTasks} |\n`;
  }

  md += `\n## By Difficulty\n\n`;
  md += `| Model | Easy | Medium | Hard |\n`;
  md += `|-------|------|--------|------|\n`;

  for (const r of sorted) {
    const easy = r.tasks.filter(t => t.difficulty === 'easy').reduce((s, t) => s + t.score, 0);
    const medium = r.tasks.filter(t => t.difficulty === 'medium').reduce((s, t) => s + t.score, 0);
    const hard = r.tasks.filter(t => t.difficulty === 'hard').reduce((s, t) => s + t.score, 0);
    md += `| ${r.model} | ${easy} | ${medium} | ${hard} |\n`;
  }

  md += `\n## Performance by Difficulty\n\n`;
  md += `| Model | Easy TPS | Medium TPS | Hard TPS | Easy Draft | Medium Draft | Hard Draft |\n`;
  md += `|-------|----------|------------|----------|------------|--------------|------------|\n`;

  for (const r of sorted) {
    const easyTasks = r.tasks.filter(t => t.difficulty === 'easy');
    const medTasks = r.tasks.filter(t => t.difficulty === 'medium');
    const hardTasks = r.tasks.filter(t => t.difficulty === 'hard');

    const avgTps = (arr) => {
      const withTps = arr.filter(t => t.genTps > 0);
      if (withTps.length === 0) return '-';
      return (withTps.reduce((s, t) => s + t.genTps, 0) / withTps.length).toFixed(1);
    };
    const avgDraft = (arr) => {
      const withDraft = arr.filter(t => t.draftTokens > 0);
      if (withDraft.length === 0) return '-';
      const rate = withDraft.reduce((s, t) => s + (t.draftAccepted / t.draftTokens), 0) / withDraft.length;
      return (rate * 100).toFixed(1) + '%';
    };

    md += `| ${r.model} | ${avgTps(easyTasks)} | ${avgTps(medTasks)} | ${avgTps(hardTasks)} | ${avgDraft(easyTasks)} | ${avgDraft(medTasks)} | ${avgDraft(hardTasks)} |\n`;
  }

  md += `\n## By Category\n\n`;
  md += `| Model | Parsing | Utility | React | Backend |\n`;
  md += `|-------|---------|---------|-------|---------|\n`;

  for (const r of sorted) {
    const parsing = r.tasks.filter(t => t.category === 'parsing').reduce((s, t) => s + t.score, 0);
    const utility = r.tasks.filter(t => t.category === 'utility').reduce((s, t) => s + t.score, 0);
    const react = r.tasks.filter(t => t.category === 'react').reduce((s, t) => s + t.score, 0);
    const backend = r.tasks.filter(t => t.category === 'backend').reduce((s, t) => s + t.score, 0);
    md += `| ${r.model} | ${parsing} | ${utility} | ${react} | ${backend} |\n`;
  }

  md += `\n## Per-Task Results\n\n`;

  for (const r of sorted) {
    md += `### ${r.model} (${r.totalScore}/${r.maxScore})\n\n`;
    md += `| Task | Title | Status | Score | Gen TPS | Draft | Time |\n`;
    md += `|------|-------|--------|-------|---------|-------|------|\n`;
    for (const t of r.tasks) {
      const draftStr = t.draftTokens > 0 ? `${t.draftAccepted}/${t.draftTokens}` : '-';
      const timeStr = t.status === 'PASS' ? `${t.elapsedMs}ms` : `${t.elapsedMs}ms`;
      md += `| ${t.taskId} | ${t.title} | ${t.status} | ${t.score}/${t.weight} | ${t.genTps || '-'} | ${draftStr} | ${timeStr} |\n`;
    }
    md += `\n`;
  }

  return md;
}

main().catch(err => {
  console.error('Evaluation failed:', err);
  process.exit(1);
});
