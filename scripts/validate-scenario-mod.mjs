import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createJiti } from 'jiti';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: npm run mod:validate -- <mod.json> [more-mods.json]');
  process.exitCode = 2;
} else {
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const validatorPath = new URL('../src/modules/scenarioMods/validator.ts', import.meta.url).pathname;
  const analyzerPath = new URL('../src/modules/scenarioMods/analyzer.ts', import.meta.url).pathname;
  const { validateScenarioMod } = await jiti.import(validatorPath);
  const { analyzeScenarioMod } = await jiti.import(analyzerPath);
  let failed = false;

  for (const file of files) {
    const absolutePath = resolve(file);
    try {
      const input = JSON.parse(await readFile(absolutePath, 'utf8'));
      const result = validateScenarioMod(input);
      if (result.valid) {
        const analysis = analyzeScenarioMod(result.value);
        const entityCount = [
          ...(result.value.world.continents || []),
          ...(result.value.canon?.factions || []),
          ...(result.value.canon?.locations || []),
          ...(result.value.canon?.characters || []),
          ...(result.value.content?.skills || []),
          ...(result.value.content?.techniques || []),
          ...(result.value.content?.items || []),
          ...(result.value.scenario.chapters || []),
          ...(result.value.scenario.events || []),
        ].length;
        const warningCount = analysis.issues.filter(issue => issue.severity === 'warning').length;
        if (analysis.valid) {
          console.log(`PASS ${file} (${result.value.manifest.id}, ${entityCount} entities${warningCount ? `, ${warningCount} warnings` : ''})`);
        } else {
          failed = true;
          console.error(`FAIL ${file}`);
        }
        analysis.issues.forEach(issue => {
          const message = `  ${issue.severity.toUpperCase()} ${issue.path} [${issue.code}]: ${issue.message}`;
          if (issue.severity === 'error') console.error(message);
          else console.warn(message);
        });
      } else {
        failed = true;
        console.error(`FAIL ${file}`);
        result.issues.forEach(issue => console.error(`  ${issue.path} [${issue.code}]: ${issue.message}`));
      }
    } catch (error) {
      failed = true;
      console.error(`FAIL ${file}`);
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failed) process.exitCode = 1;
}
