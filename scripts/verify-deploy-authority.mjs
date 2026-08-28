import fs from 'node:fs';
import path from 'node:path';

const workflowDir = path.resolve('.github/workflows');
const canonical = 'deploy-ari-cloud-run-v2.yml';
const mutationPatterns = [
  /\bgcloud\s+run\s+deploy\b/,
  /\bgcloud\s+run\s+services\s+update\b/,
  /\bgcloud\s+run\s+services\s+update-traffic\b/,
];

const files = fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/i.test(name));
const mutators = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(workflowDir, file), 'utf8');
  if (mutationPatterns.some((pattern) => pattern.test(text))) mutators.push(file);
}

if (mutators.length !== 1 || mutators[0] !== canonical) {
  throw new Error(`ARI Cloud Run mutation authority drift: expected only ${canonical}; found ${mutators.join(', ') || 'none'}`);
}

const canonicalText = fs.readFileSync(path.join(workflowDir, canonical), 'utf8');
if (!canonicalText.includes('--args=credential-gateway.js')) {
  throw new Error('Canonical ARI deploy no longer pins credential-gateway.js as the public edge');
}
if (canonicalText.includes('--args=authorization-gateway.js')) {
  throw new Error('Canonical ARI deploy must never promote authorization-gateway.js directly');
}

console.log(`MA'AT deploy authority: PASS (${canonical})`);
