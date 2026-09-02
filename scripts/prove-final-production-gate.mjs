import fs from 'node:fs';
import zlib from 'node:zlib';

const ARI = String(process.env.ARI || 'https://ari-689058655022.us-west1.run.app').replace(/\/$/, '');
const EXPECTED_PROJECT = String(process.env.EXPECTED_PROJECT || 'project-7e6f2720-0291-4c91-8c3');
const EXPECTED_LOCATION = String(process.env.EXPECTED_LOCATION || 'global');
const EVIDENCE_PATH = process.env.FINAL_GATE_EVIDENCE || 'FINAL_PRODUCTION_GATE_EVIDENCE.json';
const OWNER_GID = '399152573423';
const runStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let cookie = '';

const evidence = {
  schema: 'jahorin-final-production-gate/v1',
  endpoint: ARI,
  verified_at: new Date().toISOString(),
  production_project: EXPECTED_PROJECT,
  configured_location: EXPECTED_LOCATION,
  checks: {},
  deployment: {},
  capabilities: {},
  request_ids: [],
  fail_closed: [],
  notes: [],
};

function fail(message, detail = null) {
  const error = new Error(message);
  if (detail !== null) error.detail = detail;
  throw error;
}
function assert(condition, message, detail = null) { if (!condition) fail(message, detail); }
function textOf(body) {
  return String(body?.reply?.text || body?.result?.text || body?.output || body?.text || body?.transcript || '').trim();
}
function requestId(label) {
  const id = `maat-final-${label}-${runStamp}`;
  evidence.request_ids.push(id);
  return id;
}
function safeErrorBody(body) {
  return { ok: body?.ok ?? null, code: body?.code || null, error: String(body?.error || '').slice(0, 240) || null };
}
function providerMeta(body = {}) {
  const p = body?.provider;
  const result = body?.result || {};
  const provider = typeof p === 'string' ? p : String(p?.name || result?.provider || body?.provider_name || '');
  const model = String((typeof p === 'object' ? p?.model : '') || result?.model || body?.model || '');
  const lifecycle = String((typeof p === 'object' ? p?.lifecycle : '') || result?.model_lifecycle || body?.model_lifecycle || '');
  const location = String((typeof p === 'object' ? p?.location : '') || result?.location || body?.location || '');
  const fallbackUsed = Boolean((typeof p === 'object' ? p?.fallback_used : undefined) ?? result?.fallback_used ?? body?.fallback_used ?? false);
  const attempted = (typeof p === 'object' ? p?.attempted_models : null) || body?.attempted_models || [];
  return { provider, model, lifecycle, location, fallback_used: fallbackUsed, attempted_models: Array.isArray(attempted) ? attempted : [] };
}
async function call(path, { method = 'GET', json = undefined, raw = undefined, contentType = undefined, id = undefined, useCookie = true, timeoutMs = 120000 } = {}) {
  const headers = { accept: 'application/json' };
  if (useCookie && cookie) headers.cookie = cookie;
  if (id) headers['x-request-id'] = id;
  let body;
  if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (raw !== undefined) {
    headers['content-type'] = contentType || 'application/octet-stream';
    body = raw;
  }
  const response = await fetch(`${ARI}${path}`, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';', 1)[0];
  const contentTypeHeader = response.headers.get('content-type') || '';
  const parsed = contentTypeHeader.includes('json') ? await response.json().catch(() => ({})) : { raw: await response.text() };
  return { status: response.status, ok: response.ok, body: parsed, headers: response.headers };
}
function recordCapability(name, result, expectedClass = null) {
  const meta = providerMeta(result.body);
  assert(result.ok, `${name} production request failed`, { status: result.status, body: safeErrorBody(result.body) });
  assert(meta.provider === 'google-vertex-ai', `${name} returned a non-Vertex provider`, meta);
  assert(meta.model, `${name} returned no actual model`, meta);
  if (expectedClass) {
    const reportedClass = String(result.body?.provider?.model_class || result.body?.model_class || result.body?.result?.model_class || '').toUpperCase();
    assert(!reportedClass || reportedClass === expectedClass, `${name} model class mismatch`, { expectedClass, reportedClass, meta });
  }
  evidence.capabilities[name] = {
    status: 'PASS',
    expected_class: expectedClass,
    actual_model: meta.model,
    lifecycle: meta.lifecycle || null,
    location: meta.location || null,
    provider: meta.provider,
    fallback_used: meta.fallback_used,
    attempted_models: meta.attempted_models,
  };
  console.log(`PASS ${name}: ${meta.model}${meta.fallback_used ? ' (fallback)' : ''}`);
  return meta;
}

// Minimal valid 64x64 RGB PNG generated without external image libraries.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function redPngBase64() {
  const width = 64; const height = 64;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3); row[0] = 0;
    for (let x = 0; x < width; x += 1) { const i = 1 + x * 3; row[i] = 220; row[i + 1] = 30; row[i + 2] = 30; }
    rows.push(row);
  }
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
  return png.toString('base64');
}

async function main() {
  // Readiness must identify the actual Vertex boundary, not merely say provider_configured=true.
  const ready = await call('/api/ready', { useCookie: false, timeoutMs: 30000 });
  assert(ready.status === 200 && ready.body?.ok === true, 'ARI readiness failed', safeErrorBody(ready.body));
  assert(String(ready.body?.provider || '') === 'google-vertex-ai', 'ARI readiness is not Vertex-only', { provider: ready.body?.provider });
  assert(ready.body?.provider_configured === true, 'ARI provider is not configured');
  assert(String(ready.body?.vertex_project || '') === EXPECTED_PROJECT, 'ARI runtime project mismatch', { expected: EXPECTED_PROJECT, actual: ready.body?.vertex_project });
  assert(String(ready.body?.vertex_location || '') === EXPECTED_LOCATION, 'ARI runtime location mismatch', { expected: EXPECTED_LOCATION, actual: ready.body?.vertex_location });
  evidence.checks.vertex_only_runtime = true;
  evidence.deployment.runtime_ready_model = ready.body?.model || null;
  console.log(`PASS readiness: Vertex AI / ${ready.body?.model || 'model-unreported'}`);

  const auth = await call('/api/identity/authorize', { method: 'POST', json: { gid: OWNER_GID }, useCookie: false, timeoutMs: 30000 });
  assert(auth.status === 200, 'Prime Orchestrator authorization failed', safeErrorBody(auth.body));
  assert(cookie, 'Prime Orchestrator authorization did not issue a session cookie');
  const identity = await call('/api/identity');
  assert(identity.status === 200 && String(identity.body?.gid || identity.body?.identity?.gid || '') === OWNER_GID, 'GID continuity failed after authorization');
  evidence.checks.gid_continuity_verified = true;
  console.log('PASS GID continuity');

  const models = await call('/api/models');
  assert(models.ok, 'Model manifest endpoint failed', safeErrorBody(models.body));
  assert(String(models.body?.provider || '') === 'google-vertex-ai', 'Model manifest provider drifted');
  assert(String(models.body?.provider_boundary || '') === 'VERTEX_AI_ONLY', 'Model manifest is not Vertex-only');
  const manifest = models.body?.models || {};
  assert(manifest?.capabilities && typeof manifest.capabilities === 'object', 'Authoritative capability model manifest missing');
  evidence.model_manifest = manifest;
  evidence.checks.authoritative_model_registry = true;
  console.log(`PASS authoritative model manifest: ${Object.keys(manifest.capabilities).length} capabilities`);

  const providers = await call('/api/control/providers');
  assert(providers.ok && Array.isArray(providers.body?.providers), 'Provider control registry unavailable', safeErrorBody(providers.body));
  const enabledProviders = providers.body.providers.filter((row) => row?.enabled === true);
  const nonVertex = enabledProviders.filter((row) => row?.provider !== 'google-vertex-ai');
  assert(nonVertex.length === 0, 'Enabled non-Vertex provider routes remain in production', nonVertex.map((row) => ({ capability: row.capability_id, operation: row.operation, provider: row.provider })));
  evidence.provider_routes = { enabled: enabledProviders.length, non_vertex_enabled: 0 };
  evidence.checks.non_vertex_ai_providers_zero = true;
  console.log(`PASS provider registry purity: ${enabledProviders.length} enabled Vertex routes, 0 non-Vertex`);

  // TAE: actual user-facing orchestration + provider execution + Neon persistence.
  const taeId = requestId('tae');
  const taePrompt = `Jahorin final production proof ${runStamp}. Confirm TAE execution in one concise sentence.`;
  const tae = await call('/api/tae', { method: 'POST', id: taeId, json: { prompt: taePrompt, request_id: taeId, source_surface: 'maat-final-gate', capability: 'tae' }, timeoutMs: 180000 });
  assert(textOf(tae.body), 'TAE returned no provider-backed text');
  const taeMeta = recordCapability('ORCHESTRATION', tae, 'ORCHESTRATION');
  assert(tae.body?.tae_persistence === 'neon' && tae.body?.tae_command?.id, 'TAE result was not persisted to Neon', { persistence: tae.body?.tae_persistence, command: tae.body?.tae_command?.id || null });
  evidence.tae_command_id = tae.body.tae_command.id;
  evidence.checks.tae_write = true;

  // A fresh HTTP request (no in-process model/session state) must recover the persisted TAE command from Neon.
  const persisted = await call('/api/control/tae', { timeoutMs: 30000 });
  assert(persisted.ok && Array.isArray(persisted.body?.commands), 'TAE persistence readback failed', safeErrorBody(persisted.body));
  const recovered = persisted.body.commands.find((item) => String(item?.id) === String(tae.body.tae_command.id) || String(item?.command_text || '') === taePrompt);
  assert(recovered && recovered.execution_state === 'completed', 'TAE command did not survive reload/readback', { command_id: tae.body.tae_command.id });
  evidence.checks.tae_reload_restore = true;
  console.log('PASS TAE write -> fresh request -> Neon restore');

  const reasoningId = requestId('jahorin');
  const reasoning = await call('/api/generate', { method: 'POST', id: reasoningId, json: { type: 'jahorin', prompt: 'Explain in two sentences why deterministic capability routing is useful in a production agentic system.' }, timeoutMs: 180000 });
  assert(textOf(reasoning.body), 'Jahorin reasoning returned no text');
  recordCapability('GENERAL_REASONING', reasoning, 'GENERAL_REASONING');

  const fastId = requestId('fast');
  const fast = await call('/api/generate', { method: 'POST', id: fastId, json: { type: 'classification', prompt: 'Classify this intent with one word: Find current Google Cloud documentation.' }, timeoutMs: 180000 });
  assert(textOf(fast.body), 'Fast response returned no text');
  recordCapability('FAST_RESPONSE', fast, 'FAST_RESPONSE');

  const codeId = requestId('code');
  const code = await call('/api/generate', { method: 'POST', id: codeId, json: { type: 'code', prompt: 'Return a JavaScript function named add that adds two numbers, with no explanation.' }, timeoutMs: 180000 });
  assert(textOf(code.body), 'Code generation returned no text');
  recordCapability('CODE', code, 'CODE');

  const scribeId = requestId('scribe');
  const scribe = await call('/api/generate', { method: 'POST', id: scribeId, json: { type: 'scribe', prompt: 'Draft one polished sentence announcing that a production verification completed.' }, timeoutMs: 180000 });
  assert(textOf(scribe.body), 'Scribe returned no text');
  recordCapability('SCRIBE', scribe, 'SCRIBE');

  const augmentId = requestId('augment');
  const augment = await call('/api/generate', { method: 'POST', id: augmentId, json: { type: 'augment', prompt: 'Transform this phrase into one vivid but concise sentence: system state became visible.' }, timeoutMs: 180000 });
  assert(textOf(augment.body), 'Augment returned no text');
  recordCapability('AUGMENT', augment, 'AUGMENT');

  const interwebId = requestId('interweb');
  const interweb = await call('/api/tae', { method: 'POST', id: interwebId, json: { prompt: 'Use Google Search grounding to identify the official Google Cloud service that hosts Gemini models for enterprise AI. Answer in one sentence.', mode: 'deepsearch', request_id: interwebId, source_surface: 'maat-final-gate' }, timeoutMs: 180000 });
  assert(textOf(interweb.body), 'Interweb returned no text');
  recordCapability('INTERWEB', interweb, 'INTERWEB');
  assert(interweb.body?.deepsearch && Array.isArray(interweb.body?.deepsearch?.sources), 'Interweb did not return grounding metadata');
  evidence.capabilities.INTERWEB.grounding_sources = interweb.body.deepsearch.sources.length;

  const opticsId = requestId('optics');
  const optics = await call('/api/runtime', { method: 'POST', id: opticsId, json: { capability: 'optics', intent: 'Identify the dominant color in the supplied image in one short sentence.', request_id: opticsId, payload: { image: { mime_type: 'image/png', data: redPngBase64() } } }, timeoutMs: 180000 });
  assert(textOf(optics.body), 'Optics returned no multimodal result');
  recordCapability('OPTICS', optics, 'OPTICS');
  assert(optics.body?.result?.media_input?.type === 'image', 'Optics did not report real image input');

  const imageId = requestId('image');
  const image = await call('/api/image', { method: 'POST', id: imageId, json: { prompt: 'Create a simple abstract silver circle centered on a black background.' }, timeoutMs: 240000 });
  recordCapability('IMAGE_GENERATION', image, 'IMAGE_GENERATION');
  assert(String(image.body?.asset?.data || '').length > 100, 'Image generation returned no real image bytes');
  evidence.capabilities.IMAGE_GENERATION.asset_bytes_base64 = String(image.body.asset.data).length;

  const embeddingId = requestId('embedding');
  const embedding = await call('/api/embeddings', { method: 'POST', id: embeddingId, json: { content: 'Jahorin Trismegistus final production gate' }, timeoutMs: 180000 });
  recordCapability('EMBEDDING', embedding, 'EMBEDDING');
  assert(Array.isArray(embedding.body?.embeddings) && embedding.body.embeddings.length > 0, 'Embedding endpoint returned no embeddings');

  const voiceToken = await call('/api/voice/token', { method: 'POST', id: requestId('voice-authority'), json: {} });
  assert(voiceToken.status === 409 && voiceToken.body?.code === 'VERTEX_SERVER_AUTHORITY', 'Browser model-token boundary is not fail-closed', safeErrorBody(voiceToken.body));
  assert(voiceToken.body?.provider === 'google-vertex-ai', 'Voice authority did not identify Vertex AI');
  evidence.checks.client_provider_calls_zero = true;
  evidence.capabilities.LIVE = { status: 'SERVER_AUTHORITY_ONLY', model: voiceToken.body?.model || null, direct_browser_tokens: false };
  console.log('PASS client provider calls: 0 (server-authoritative voice)');

  const voicePath = process.env.VOICE_WAV || '';
  if (voicePath && fs.existsSync(voicePath)) {
    const voiceId = requestId('voice-transcription');
    const wav = fs.readFileSync(voicePath);
    const voice = await call('/api/voice/transcribe', { method: 'POST', id: voiceId, raw: wav, contentType: 'audio/wav', timeoutMs: 180000 });
    assert(textOf(voice.body), 'Voice transcription returned no transcript');
    recordCapability('VOICE_TRANSCRIPTION', voice, 'VOICE_TRANSCRIPTION');
  } else {
    evidence.capabilities.VOICE_TRANSCRIPTION = { status: 'NOT_EXECUTED', reason: 'VOICE_WAV test fixture absent' };
  }

  // Region and preview policy are production contracts, not excuses to silently move geography or enable previews.
  const videoPolicy = manifest.capabilities?.VIDEO_GENERATION || null;
  const approvedLocations = Array.isArray(manifest.approvedRoutingLocations) ? manifest.approvedRoutingLocations : [];
  const videoLocations = Array.isArray(videoPolicy?.models?.[0]?.locations) ? videoPolicy.models[0].locations : [];
  const videoEnabledHere = videoLocations.some((loc) => approvedLocations.includes(loc));
  if (videoEnabledHere) {
    const videoId = requestId('video');
    const video = await call('/api/video', { method: 'POST', id: videoId, json: { prompt: 'A silver sphere rotating slowly on a black background.', duration_seconds: 8, aspect_ratio: '16:9' }, timeoutMs: 360000 });
    recordCapability('VIDEO_GENERATION', video, 'VIDEO_GENERATION');
    assert(video.body?.asset, 'Video generation returned no real asset');
  } else {
    const videoFailId = requestId('video-region-failclosed');
    const video = await call('/api/video', { method: 'POST', id: videoFailId, json: { prompt: 'Region fail-closed verification.' }, timeoutMs: 60000 });
    assert(!video.ok, 'Video silently crossed the approved production geography');
    assert(/VERTEX_CAPABILITY_UNAVAILABLE|VERTEX_CAPABILITY_FAILURE/.test(String(video.body?.code || '')) || /No approved Vertex model|Vertex execution failed/i.test(String(video.body?.error || '')), 'Video region failure was not an explicit Vertex capability failure', safeErrorBody(video.body));
    assert(!providerMeta(video.body).provider || providerMeta(video.body).provider === 'google-vertex-ai', 'Video fail-closed response exposed another provider');
    evidence.capabilities.VIDEO_GENERATION = { status: 'NOT_ENABLED_BY_REGION_POLICY', approved_locations: approvedLocations, model_locations: videoLocations };
    evidence.fail_closed.push({ capability: 'VIDEO_GENERATION', reason: 'REGION_POLICY', code: video.body?.code || null });
    evidence.checks.region_fail_closed = true;
    console.log('PASS video region policy fails closed');
  }

  const audioId = requestId('audio-policy');
  const audio = await call('/api/audio', { method: 'POST', id: audioId, json: { prompt: 'A brief calm instrumental tone for production verification.' }, timeoutMs: 300000 });
  if (audio.ok) {
    recordCapability('AUDIO_GENERATION', audio, 'AUDIO_GENERATION');
    assert(String(audio.body?.asset?.data || '').length > 100, 'Audio generation returned no real audio bytes');
  } else {
    assert(/VERTEX_CAPABILITY_UNAVAILABLE|VERTEX_CAPABILITY_FAILURE/.test(String(audio.body?.code || '')) || /No approved Vertex model|Vertex execution failed/i.test(String(audio.body?.error || '')), 'Audio preview policy failure was not explicit', safeErrorBody(audio.body));
    assert(!providerMeta(audio.body).provider || providerMeta(audio.body).provider === 'google-vertex-ai', 'Audio fail-closed response exposed another provider');
    evidence.capabilities.AUDIO_GENERATION = { status: 'NOT_ENABLED_PREVIEW_NOT_APPROVED', failure: safeErrorBody(audio.body) };
    evidence.fail_closed.push({ capability: 'AUDIO_GENERATION', reason: 'PREVIEW_NOT_APPROVED', code: audio.body?.code || null });
    evidence.checks.preview_fail_closed = true;
    console.log('PASS preview-only audio fails closed without approval');
  }

  const twin = await call('/api/twin');
  assert(twin.ok && twin.body?.persistence === 'neon' && twin.body?.cloud_sync === true, 'Twin/Neon continuity is not live');
  evidence.checks.neon_persistence = true;

  const successful = Object.values(evidence.capabilities).filter((item) => item?.status === 'PASS');
  const substitutions = successful.filter((item) => item?.fallback_used === true);
  evidence.substitutions = substitutions.map((item) => ({ actual_model: item.actual_model, attempted_models: item.attempted_models }));
  evidence.checks.production_model_execution_verified = successful.length >= 8;
  evidence.checks.project_access_verified = successful.every((item) => item.provider === 'google-vertex-ai' && Boolean(item.actual_model));
  evidence.checks.production_substitution_proof = substitutions.length > 0;
  evidence.checks.fail_closed_verified = evidence.fail_closed.length > 0;
  evidence.checks.tae_continuity_verified = evidence.checks.tae_write === true && evidence.checks.tae_reload_restore === true;
  evidence.checks.google_first_party_only = true;
  evidence.checks.vertex_only_policy = true;
  evidence.checks.production_verified = true;

  const required = [
    'vertex_only_runtime','gid_continuity_verified','authoritative_model_registry','non_vertex_ai_providers_zero',
    'tae_write','tae_reload_restore','client_provider_calls_zero','neon_persistence','production_model_execution_verified',
    'project_access_verified','fail_closed_verified','tae_continuity_verified','google_first_party_only','vertex_only_policy','production_verified',
  ];
  evidence.failed_checks = required.filter((key) => evidence.checks[key] !== true);
  evidence.final_production_acceptance = evidence.failed_checks.length === 0 && evidence.checks.production_substitution_proof === true ? 'PASS' : 'INCOMPLETE';
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`Evidence: ${EVIDENCE_PATH}`);
  if (!evidence.checks.production_substitution_proof) console.error('INCOMPLETE production substitution proof: no real live request required a fallback in this run.');
  if (evidence.failed_checks.length) console.error(`FAILED checks: ${evidence.failed_checks.join(', ')}`);
  if (evidence.final_production_acceptance !== 'PASS') process.exitCode = 2;
  else console.log('FINAL_PRODUCTION_ACCEPTANCE: PASS');
}

main().catch((error) => {
  evidence.fatal_error = { message: error.message, detail: error.detail || null };
  evidence.final_production_acceptance = 'FAIL';
  try { fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n'); } catch {}
  console.error(`FINAL GATE FAILED: ${error.message}`);
  if (error.detail) console.error(JSON.stringify(error.detail));
  process.exitCode = 1;
});
