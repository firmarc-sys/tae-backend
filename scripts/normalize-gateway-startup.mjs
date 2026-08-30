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

const credentialImmediateStart = `gateway.listen(outerPort, "0.0.0.0", () => {
  console.log(\`ARI credential edge listening on \${outerPort}; awaiting UAE governance inner \${innerPort}\`);
});

waitForPort(innerPort)
  .then(() => {
    childReady = true;
    console.log(\`ARI UAE governance inner chain reachable on \${innerPort}\`);
  })
  .catch((error) => {
    childReady = false;
    childExit = { code: null, signal: null, at: new Date().toISOString(), error: error.message };
    console.error(\`ARI credential edge readiness failed: \${error.message}\`);
  });`;

const credentialFullChainStart = `async function startCredentialEdge() {
  console.log(\`ARI credential edge holding Cloud Run startup until the full UAE production chain is ready on \${innerPort}\`);
  try {
    await waitForInnerChainReady();
    childReady = true;
    gateway.listen(outerPort, "0.0.0.0", () => {
      console.log(\`ARI credential edge listening on \${outerPort}; full UAE production chain ready on \${innerPort}\`);
    });
  } catch (error) {
    childReady = false;
    childExit = childExit || { code: null, signal: null, at: new Date().toISOString(), error: error.message };
    console.error(\`ARI credential edge full-chain startup failed: \${error.message}\`);
    if (!child.killed) child.kill("SIGTERM");
    process.exit(1);
  }
}
void startCredentialEdge();`;

const writeChanges = process.env.CI !== 'true' || process.env.NORMALIZE_GATEWAY_WRITE === 'true';
let filesChanged = 0;
let filesWouldChange = 0;
let startupBudgetChanges = 0;
let neonTimeoutChanges = 0;
let readinessMonitorChanges = 0;
let credentialStartupGateChanges = 0;
const verified = [];

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  const before = fs.readFileSync(file, 'utf8');
  const startupMatches = before.match(unsafeStartupBudget) || [];
  const neonMatches = before.match(unsafeNeonBudget) || [];

  let after = before
    .replace(unsafeStartupBudget, 'timeout = 180000')
    .replace(unsafeNeonBudget, 'connectionTimeoutMillis: 30000')
    .replace('ARI_INNER_CHAIN_READY_TIMEOUT_MS || 30000', 'ARI_INNER_CHAIN_READY_TIMEOUT_MS || 180000');

  if (file === 'authorization-gateway.js' && after.includes(authorizationOneShot)) {
    after = after.replace(authorizationOneShot, authorizationMonitor);
    readinessMonitorChanges += 1;
  }

  if (file === 'credential-gateway.js' && after.includes(credentialImmediateStart)) {
    after = after.replace(credentialImmediateStart, credentialFullChainStart);
    credentialStartupGateChanges += 1;
  }

  startupBudgetChanges += startupMatches.length;
  neonTimeoutChanges += neonMatches.length;

  if (after !== before) {
    filesWouldChange += 1;
    if (writeChanges) {
      fs.writeFileSync(file, after);
      filesChanged += 1;
      console.log(`normalized startup/connectivity budget: ${file}`);
    } else {
      console.log(`verified pending Docker normalization: ${file}`);
    }
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
  if (file === 'credential-gateway.js') {
    if (!normalized.includes('async function startCredentialEdge()')) {
      throw new Error('credential edge full-chain startup gate was not installed');
    }
    if (!normalized.includes('ARI_INNER_CHAIN_READY_TIMEOUT_MS || 180000')) {
      throw new Error('credential edge full-chain readiness budget is not 180000ms');
    }
  }
  verified.push(file);
}

if (!verified.length) {
  throw new Error('no ARI gateway source files were available to verify');
}

console.log(`ARI startup normalization verified across ${verified.length} gateway files`);
console.log(`write_changes=${writeChanges}; changed=${filesChanged}; would_change=${filesWouldChange}; startup_budgets=${startupBudgetChanges}; neon_budgets=${neonTimeoutChanges}`);
console.log(`authorization readiness monitor replacements this invocation: ${readinessMonitorChanges}`);
console.log(`credential full-chain startup gate replacements this invocation: ${credentialStartupGateChanges}`);
console.log('self-healing authorization child readiness monitor verified');
console.log('Cloud Run external port is gated on full ARI inner-chain readiness');
