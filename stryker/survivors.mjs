// Lists the mutants that survived (or weren't covered) in a Stryker JSON report, one line each:
//   node stryker/survivors.mjs reports/mutation/shared.json
import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let total = 0;
for (const [file, result] of Object.entries(report.files)) {
  const lines = result.source.split('\n');
  for (const mutant of result.mutants) {
    if (mutant.status !== 'Survived' && mutant.status !== 'NoCoverage') continue;
    total += 1;
    const { line, column } = mutant.location.start;
    const original = (lines[line - 1] ?? '').trim().slice(0, 90);
    process.stdout.write(`${mutant.status === 'NoCoverage' ? 'NOCOV' : 'SURV '} ${file}:${line}:${column} ${mutant.mutatorName} → ${JSON.stringify(mutant.replacement ?? '').slice(0, 60)} | ${original}\n`);
  }
}
process.stdout.write(`${total} surviving or uncovered mutants\n`);
