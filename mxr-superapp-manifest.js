export const MXR_SUPERAPP_VERSION = '2026.10.07';

export const FOUR_RUNTIMES = Object.freeze({
  thoth: {
    id: 'thoth',
    role: 'knowledge_context',
    responsibilities: ['memory', 'knowledge', 'semantic-retrieval', 'provenance', 'document-intelligence'],
  },
  jahorin: {
    id: 'jahorin',
    role: 'agency_execution',
    responsibilities: ['capability-execution', 'browser', 'computer-use', 'device-control', 'integrations', 'artifacts'],
  },
  trismegistus: {
    id: 'trismegistus',
    role: 'governance_truth',
    responsibilities: ['policy', 'risk', 'approval', 'evidence', 'verification', 'audit'],
  },
  mercury: {
    id: 'mercury',
    role: 'orchestration_manifestation',
    responsibilities: ['intent-routing', 'task-state', 'realtime-state', 'mxr-scene', 'viewport-transitions'],
  },
});

export const CAPABILITY_WORLDS = Object.freeze([
  { id: 'interweb', runtime: 'jahorin', route: '/api/runtime', capability: 'interweb' },
  { id: 'thoth', runtime: 'thoth', route: '/api/tae', capability: 'scribe' },
  { id: 'ptah', runtime: 'jahorin', route: '/api/runtime', capability: 'code' },
  { id: 'horus', runtime: 'jahorin', route: '/api/runtime', capability: 'optics' },
  { id: 'hathor', runtime: 'jahorin', route: '/api/runtime', capability: 'syncori' },
  { id: 'nova-life', runtime: 'jahorin', route: '/api/runtime', capability: 'nova-life' },
]);

export const LIVE_AUTHORITIES = Object.freeze({
  ari: process.env.ARI_PUBLIC_URL || 'https://ari-689058655022.us-west1.run.app',
  mercury: process.env.MERCURY_RUNTIME_URL || 'https://agentic-mercury-runtime-689058655022.us-west1.run.app',
  frontend: process.env.CANONICAL_FRONTEND_URL || process.env.FRONTEND_URL || '',
});

export function superAppManifest() {
  return {
    product: 'Jahorin MXR Super App',
    version: MXR_SUPERAPP_VERSION,
    canonical_backend: 'firmarc-sys/tae-backend',
    canonical_frontend: 'firmarc-sys/JAHORIN-GA-PRODUCTION-RELEASE',
    persistence: 'neon-postgres',
    runtimes: FOUR_RUNTIMES,
    worlds: CAPABILITY_WORLDS,
    authorities: LIVE_AUTHORITIES,
    execution_truth: ['planned', 'authorized', 'queued', 'attempted', 'running', 'waiting', 'blocked', 'completed', 'verified', 'failed', 'cancelled', 'rolled_back'],
  };
}
