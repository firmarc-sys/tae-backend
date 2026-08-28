import fs from 'node:fs';

const files = [
  'credential-gateway.js',
  'authorization-gateway.js',
  'production-gateway.js',
  'billing-gateway.js',
  'subscription-entitlement-gateway.js',
  'universal-capability-gateway.js',
  'secure-gateway.js',
  'control-plane-gateway.js',
  'neon-runtime-gateway.js',
  'manifest-runtime-gateway.js',
  'identity-runtime-gateway.js',
];

const unsafeStartupBudget = /timeout\s*=\s*(?:20_?000|30_?000)/g;
const unsafeNeonBudget = /connectionTimeoutMillis:\s*8_?000/g;

let filesChanged = 0;
let startupBudgetChanges = 0;
let neonTimeoutChanges = 0;
const verified = [];

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  const before = fs.readFileSync(file, 'utf8');
  const startupMatches = before.match(unsafeStartupBudget) || [];
  const neonMatches = before.match(unsafeNeonBudget) || [];

  const after = before
    .replace(unsafeStartupBudget, 'timeout = 120000')
    .replace(unsafeNeonBudget, 'connectionTimeoutMillis: 30000');

  startupBudgetChanges += startupMatches.length;
  neonTimeoutChanges += neonMatches.length;

  if (after !== before) {
    fs.writeFileSync(file, after);
    filesChanged += 1;
    console.log(`normalized startup/connectivity budget: ${file}`);
  }

  const normalized = after;
  unsafeStartupBudget.lastIndex = 0;
  unsafeNeonBudget.lastIndex = 0;
  if (unsafeStartupBudget.test(normalized)) {
    throw new Error(`unsafe nested gateway startup budget remains in ${file}`);
  }
  unsafeStartupBudget.lastIndex = 0;
  if (unsafeNeonBudget.test(normalized)) {
    throw new Error(`unsafe Neon connection timeout remains in ${file}`);
  }
  unsafeNeonBudget.lastIndex = 0;
  verified.push(file);
}

if (!verified.length) {
  throw new Error('no ARI gateway source files were available to verify');
}

console.log(`ARI startup normalization verified across ${verified.length} gateway files`);
console.log(`changed ${filesChanged} files; normalized ${startupBudgetChanges} startup budgets to 120s and ${neonTimeoutChanges} Neon connection budgets to 30s`);
