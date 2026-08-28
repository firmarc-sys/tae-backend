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
const authorizationOneShot = `waitForPort(innerPort)
  .then(() => {
    childReady = true;
    console.log(\`ARI production inner chain ready on \${innerPort}\`);
  })
  .catch((error) => {
    childReady = false;
    rememberChildOutput("readiness", \`production child failed readiness: \${error.message}\`);
  });`;
const authorizationMonitor = `let readinessProbeInFlight = false;
function refreshInnerReadiness() {
  if (readinessProbeInFlight || childExit) return;
  readinessProbeInFlight = true;
  const socket = net.createConnection({ host: "127.0.0.1", port: innerPort });
  socket.once("connect", () => {
    socket.destroy();
    if (!childReady) console.log(\`ARI production inner chain ready on \${innerPort}\`);
    childReady = true;
    readinessProbeInFlight = false;
  });
  socket.once("error", (error) => {
    socket.destroy();
    if (childReady) rememberChildOutput("readiness", \`production child became unreachable: \${error.message}\`);
    childReady = false;
    readinessProbeInFlight = false;
  });
}
refreshInnerReadiness();
const readinessMonitor = setInterval(refreshInnerReadiness, 1000);
readinessMonitor.unref();`;

let filesChanged = 0;
let startupBudgetChanges = 0;
let neonTimeoutChanges = 0;
let readinessMonitorChanges = 0;
const verified = [];

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  const before = fs.readFileSync(file, 'utf8');
  const startupMatches = before.match(unsafeStartupBudget) || [];
  const neonMatches = before.match(unsafeNeonBudget) || [];

  let after = before
    .replace(unsafeStartupBudget, 'timeout = 120000')
    .replace(unsafeNeonBudget, 'connectionTimeoutMillis: 30000');

  if (file === 'authorization-gateway.js' && after.includes(authorizationOneShot)) {
    after = after.replace(authorizationOneShot, authorizationMonitor);
    readinessMonitorChanges += 1;
  }

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
  if (file === 'authorization-gateway.js' && !normalized.includes('const readinessMonitor = setInterval(refreshInnerReadiness, 1000);')) {
    throw new Error('authorization readiness monitor was not installed');
  }
  verified.push(file);
}

if (!verified.length) {
  throw new Error('no ARI gateway source files were available to verify');
}

console.log(`ARI startup normalization verified across ${verified.length} gateway files`);
console.log(`changed ${filesChanged} files; normalized ${startupBudgetChanges} startup budgets to 120s and ${neonTimeoutChanges} Neon connection budgets to 30s`);
console.log(`authorization readiness monitor replacements this invocation: ${readinessMonitorChanges}`);
console.log('self-healing authorization child readiness monitor verified');
