import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Context } from '../lib/core.mjs';
import { handlers } from '../lib/javascript.mjs';
import { validate } from '../lib/contracts.mjs';

// This program is authored here. Only these known fixture bytes are executed;
// recovery itself does not execute the input or authorize arbitrary artifacts.
const original = `const fs = require('node:fs');
const path = require('node:path');
const [operation, left, right] = process.argv.slice(2);
if (!['add', 'divide', 'write'].includes(operation)) {
  process.stderr.write('unknown operation\\n'); process.exitCode = 64;
} else if (![left, right].every(x => /^-?\\d+$/.test(x ?? ''))) {
  process.stderr.write('integer operands required\\n'); process.exitCode = 65;
} else {
  const a = Number(left), b = Number(right);
  if (operation === 'divide' && b === 0) {
    process.stderr.write('division by zero\\n'); process.exitCode = 2;
  } else {
    const result = operation === 'divide' ? a / b : a + b;
    const text = JSON.stringify({operation, left:a, right:b, result}) + '\\n';
    if (operation === 'write') fs.writeFileSync(path.join(process.cwd(), 'result.json'), text);
    process.stdout.write(text);
  }
}
`;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function executeOwned(program, argv, cwd) {
  const env = { PATH:path.dirname(process.execPath) };
  for (const name of ['SystemRoot', 'WINDIR']) if (process.env[name]) env[name] = process.env[name];
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [program, ...argv], { cwd, env, shell:false, windowsHide:true, stdio:['ignore','pipe','pipe'] });
    const chunks = { stdout:[], stderr:[] }; let bytes = 0, failure;
    const stop = error => { failure ??= error; child.kill(); };
    const timer = setTimeout(() => stop(new Error('owned program exceeded thirty seconds')), 30000);
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 65536) stop(new Error('owned program exceeded capture limit'));
      else chunks[stream].push(chunk);
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else resolve({ code, signal, stdout:Buffer.concat(chunks.stdout).toString('utf8'), stderr:Buffer.concat(chunks.stderr).toString('utf8') });
    });
  });
  const entries = await fs.readdir(cwd);
  result.effects = await Promise.all(entries.sort().map(async name => ({ name, bytes:(await fs.readFile(path.join(cwd, name))).toString('base64') })));
  return result;
}

test('owned embedded-source recovery preserves CLI results and file effects with a mutation negative control', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reclaimer-owned-rebuild-'));
  t.after(async () => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('reclaimer-owned-rebuild-'));
    await fs.rm(resolved, { recursive:true, force:true });
  });
  const originalPath = path.join(root, 'owned-original.cjs'), bundlePath = path.join(root, 'owned-bundle.cjs');
  const sourceMap = { version:3, sources:['owned-original.cjs'], sourcesContent:[original], names:[], mappings:'' };
  const bundle = `// Owned bundled representation.\n${original}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(sourceMap)).toString('base64')}\n`;
  await fs.writeFile(originalPath, original); await fs.writeFile(bundlePath, bundle);
  const ctx = new Context(); ctx.handlers = handlers;
  const args = { path:bundlePath, output_directory:path.join(root, 'recovered') };
  assert.equal(validate('recover_javascript_sources', 'input', args).valid, true);
  const evidence = await ctx.call('recover_javascript_sources', args);
  assert.equal(validate('recover_javascript_sources', 'output', evidence).valid, true);
  assert.equal(evidence.normalized_result.runtime_equivalence, 'unknown');
  const expectedDigest = sha(original);
  const recovered = evidence.normalized_result.modules.filter(m => m.artifact.sha256 === expectedDigest);
  assert.equal(recovered.length, 1);
  assert.equal(await fs.readFile(recovered[0].artifact.path, 'utf8'), original);
  for (const module of evidence.normalized_result.modules) assert.equal(sha(await fs.readFile(module.artifact.path)), module.artifact.sha256);
  const cases = [
    { args:['add','8','5'], code:0, stdout:'{"operation":"add","left":8,"right":5,"result":13}\n' },
    { args:['add','-8','3'], code:0, stdout:'{"operation":"add","left":-8,"right":3,"result":-5}\n' },
    { args:['divide','9','2'], code:0, stdout:'{"operation":"divide","left":9,"right":2,"result":4.5}\n' },
    { args:['divide','9','0'], code:2, stderr:'division by zero\n' },
    { args:['add','bad','2'], code:65, stderr:'integer operands required\n' },
    { args:['other'], code:64, stderr:'unknown operation\n' },
    { args:['write','7','-2'], code:0, stdout:'{"operation":"write","left":7,"right":-2,"result":5}\n', effect:true },
  ];
  for (let index = 0; index < cases.length; index++) {
    const scenario = cases[index], beforeDir = path.join(root, `before-${index}`), afterDir = path.join(root, `after-${index}`);
    await fs.mkdir(beforeDir); await fs.mkdir(afterDir);
    const before = await executeOwned(originalPath, scenario.args, beforeDir);
    const after = await executeOwned(recovered[0].artifact.path, scenario.args, afterDir);
    assert.deepEqual(after, before, `owned scenario ${index}`);
    assert.equal(before.code, scenario.code); assert.equal(before.signal, null);
    assert.equal(before.stdout, scenario.stdout ?? ''); assert.equal(before.stderr, scenario.stderr ?? '');
    assert.deepEqual(before.effects, scenario.effect ? [{ name:'result.json', bytes:Buffer.from(scenario.stdout).toString('base64') }] : []);
  }
  const changed = original.replace(': a + b;', ': a - b;'); assert.notEqual(changed, original);
  const mutationPath = path.join(root, 'owned-mutated.cjs'); await fs.writeFile(mutationPath, changed);
  const controlDir = path.join(root, 'negative-control'); await fs.mkdir(controlDir);
  const control = await executeOwned(mutationPath, cases[0].args, controlDir);
  assert.equal(control.code, 0); assert.notEqual(control.stdout, cases[0].stdout);
  assert.equal(control.stdout, '{"operation":"add","left":8,"right":5,"result":3}\n');
  assert.equal(sha(await fs.readFile(bundlePath)), sha(bundle));
  assert.equal(sha(await fs.readFile(originalPath)), expectedDigest);
  assert.equal(evidence.normalized_result.runtime_equivalence, 'unknown');
});
