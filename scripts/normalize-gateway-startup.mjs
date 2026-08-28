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

let changed = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before
    .replace(/timeout = 20000/g, 'timeout = 120000')
    .replace(/timeout = 30000/g, 'timeout = 120000');
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`normalized startup budget: ${file}`);
  }
}

if (changed < 2) {
  throw new Error(`expected nested gateway startup budgets to normalize; changed=${changed}`);
}
console.log(`normalized ${changed} gateway startup budgets to 120s`);
