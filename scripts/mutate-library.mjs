// Mutation testing for Home's pure logic: changes app/logic.js one operator at a time and runs
// scripts/test-library.mjs against each copy. A mutant the tests still pass is a fault they would miss.
// Mutants that no longer compile are skipped, so syntax errors never count as caught faults.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const source = readFileSync(join(root, 'app/logic.js'), 'utf8');
const lines = source.split('\n');
const OPERATORS = [
  ['===', '!=='], ['!==', '==='], [' >= ', ' > '], [' > ', ' >= '], [' <= ', ' < '], [' < ', ' <= '],
  [' && ', ' || '], [' || ', ' && '], ['+ 1', '- 1'], ['- 1', '+ 1'], ['true', 'false'], ['false', 'true'],
  ['.slice(0, ', '.slice(1, '], ['(!', '(']
];
const THRESHOLD = 0.9; // At least this share of compiling mutants must be caught.

// The code part of a line: no mutations inside comments.
function codePart(line) {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return '';
  const i = line.indexOf(' // ');
  return i >= 0 ? line.slice(0, i) : line;
}

const mutants = [];
lines.forEach((line, n) => {
  const code = codePart(line);
  for (const [from, to] of OPERATORS) {
    for (let at = code.indexOf(from); at >= 0; at = code.indexOf(from, at + 1)) {
      if (/^\w+$/.test(from) && (/\w/.test(code[at - 1] || '') || /\w/.test(code[at + from.length] || ''))) continue; // whole words only
      const mutated = lines.slice();
      mutated[n] = line.slice(0, at) + to + line.slice(at + from.length);
      const text = mutated.join('\n');
      try { new vm.Script(text); } catch { continue; }
      mutants.push({ line: n + 1, from, to, text });
    }
  }
});

const dir = mkdtempSync(join(tmpdir(), 'home-mutants-'));
function run(m, i) {
  const file = join(dir, 'mutant-' + i + '.js');
  writeFileSync(file, m.text);
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--test', join(root, 'scripts/test-library.mjs')], { env: { ...process.env, HOME_LOGIC_FILE: file }, stdio: 'ignore' });
    child.on('exit', code => resolve({ ...m, caught: code !== 0 }));
  });
}
const results = [];
const queue = mutants.map((m, i) => () => run(m, i));
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) results.push(await queue.shift()()); }));
rmSync(dir, { recursive: true, force: true });

const survived = results.filter(r => !r.caught).sort((a, b) => a.line - b.line);
const score = results.length ? (results.length - survived.length) / results.length : 1;
console.log('Mutants: ' + results.length + ', caught: ' + (results.length - survived.length) + ', survived: ' + survived.length + ' (score ' + (score * 100).toFixed(1) + '%)');
for (const s of survived) console.log('  survived line ' + s.line + ': "' + s.from.trim() + '" -> "' + s.to.trim() + '"  ' + lines[s.line - 1].trim().slice(0, 90));
if (score < THRESHOLD) { console.log('FAIL: below the ' + THRESHOLD * 100 + '% threshold'); process.exit(1); }
console.log('PASS');
