import fs from 'node:fs';

const files = [
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

let startupBudgetChanges = 0;
let neonTimeoutChanges = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replace(/timeout = 20000/g, 'timeout = 120000')
    .replace(/timeout = 30000/g, 'timeout = 120000')
    .replace(/connectionTimeoutMillis:\s*8000/g, 'connectionTimeoutMillis: 30000');
  if (after !== before) {
    startupBudgetChanges += before.includes('timeout = 20000') || before.includes('timeout = 30000') ? 1 : 0;
    neonTimeoutChanges += before.includes('connectionTimeoutMillis: 8000') ? 1 : 0;
    fs.writeFileSync(file, after);
    console.log(`normalized startup/connectivity budget: ${file}`);
  }
}

if (startupBudgetChanges < 2) {
  throw new Error(`expected nested gateway startup budgets to normalize; changed=${startupBudgetChanges}`);
}
if (neonTimeoutChanges < 1) {
  throw new Error(`expected Neon connection timeout to normalize; changed=${neonTimeoutChanges}`);
}
console.log(`normalized ${startupBudgetChanges} gateway startup budgets to 120s`);
console.log(`normalized ${neonTimeoutChanges} Neon connection budgets to 30s`);
