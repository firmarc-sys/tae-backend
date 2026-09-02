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
  if (unsafeStartupBudget.test(normalized)) throw new Error(`unsafe nested gateway startup budget remains in ${file}`);
  unsafeStartupBudget.lastIndex = 0;
  if (unsafeNeonBudget.test(normalized)) throw new Error(`unsafe Neon connection timeout remains in ${file}`);
  unsafeNeonBudget.lastIndex = 0;
  if (file === 'authorization-gateway.js' && !normalized.includes('const readinessMonitor = setInterval(refreshInnerReadiness, 1000);')) throw new Error('authorization readiness monitor was not installed');
  if (file === 'credential-gateway.js') {
    if (!normalized.includes('async function startCredentialEdge()')) throw new Error('credential edge full-chain startup gate was not installed');
    if (!normalized.includes('ARI_INNER_CHAIN_READY_TIMEOUT_MS || 180000')) throw new Error('credential edge full-chain readiness budget is not 180000ms');
  }
  verified.push(file);
}

function normalizeVertexServer(source) {
  let text = source;
  text = text.replace('import { GoogleGenAI } from "@google/genai";', 'import { VertexModelRouter, VERTEX_PROVIDER, modelClassForCapability } from "./vertex-model-router.js";');
  text = text.replace(
    /const runtimeGeminiApiKey = [\s\S]*?const vertexLocation = .*?;\n/,
    'const vertexProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || process.env.VERTEX_PROJECT || "project-7e6f2720-0291-4c91-8c3";\n' +
    'const vertexLocation = process.env.GOOGLE_CLOUD_LOCATION || process.env.VERTEX_LOCATION || "global";\n' +
    'const geminiModel = process.env.VERTEX_ORCHESTRATOR_MODEL || "gemini-3.1-pro-preview";\n' +
    'const provider = VERTEX_PROVIDER;\n' +
    'const vertexRouter = new VertexModelRouter({ project: vertexProject, location: vertexLocation });\n',
  );
  text = text.replace(/const provider = geminiApiKey \? "google-gemini-api"[\s\S]*?\n    : null;\n/, '');
  text = text.replace(
    'function requireProvider() {\n  if (!ai) throw httpError(503, "Google provider is not configured on the ARI service.");\n  return ai;\n}',
    'function requireProvider() {\n  if (!vertexRouter) throw httpError(503, "Google Vertex AI is not configured on the ARI service.");\n  return vertexRouter;\n}',
  );
  text = text.replace('const providerConfigured = Boolean(ai);', 'const providerConfigured = Boolean(vertexRouter);');
  text = text.replace('...thothVoiceReadiness(thothGeminiApiKey),', '...thothVoiceReadiness({ project: vertexProject, location: vertexLocation }),');
  text = text.replace('installThothVoiceRoutes(app, { apiKey: thothGeminiApiKey, authorize: requireProviderAccess });', 'installThothVoiceRoutes(app, { project: vertexProject, location: vertexLocation, authorize: requireProviderAccess });');

  const generated = `async function generateWithGoogle({ prompt, systemInstruction, temperature = 0.7, image = null, groundWithSearch = false, capability = "jahorin" }) {
  const router = requireProvider();
  const contents = image ? [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: image.mimeType, data: image.data } }] }] : prompt;
  const deepSearch = groundWithSearch || deepSearchRequested(prompt);
  const config = {
    systemInstruction,
    temperature: Math.max(0, Math.min(2, Number(temperature) || 0.7)),
    maxOutputTokens: 4096,
    ...(deepSearch ? { tools: [{ googleSearch: {} }] } : {}),
  };
  const modelClass = modelClassForCapability(capability, { image: Boolean(image), deepSearch });
  const routed = await withProviderRetry(() => router.generateContent({ modelClass, contents, config }));
  const response = routed.response;
  const text = String(response.text || "").trim();
  if (!text) throw httpError(502, "Google Vertex AI returned no generated text.");
  return {
    text,
    model: routed.model,
    model_class: routed.modelClass,
    model_lifecycle: routed.lifecycle,
    provider: routed.provider,
    location: routed.location,
    fallback_used: routed.fallbackUsed,
    attempted_models: routed.attempted,
    tokens: response.usageMetadata?.totalTokenCount ?? null,
    usage: response.usageMetadata || null,
    media_input: image ? { type: "image", mime_type: image.mimeType, bytes: image.bytes } : null,
    deepsearch: deepSearch ? normalizeGrounding(response) : null,
  };
}

function inferManifest`;
  text = text.replace(/async function generateWithGoogle\([\s\S]*?\n}\n\nfunction inferManifest/, generated);

  text = text.replace('const result = await generateWithGoogle({\n      prompt,\n      systemInstruction:', 'const result = await generateWithGoogle({\n      prompt,\n      capability: deepSearch ? "interweb" : "tae",\n      systemInstruction:');
  text = text.replace('const result = await generateWithGoogle({\n        prompt: providerPrompt,\n        image: inlineImage,', 'const result = await generateWithGoogle({\n        prompt: providerPrompt,\n        capability,\n        image: inlineImage,');
  text = text.replace('const result = await generateWithGoogle({\n      prompt,\n      image: inlineImage,', 'const result = await generateWithGoogle({\n      prompt,\n      capability: String(req.body?.type || "scribe"),\n      image: inlineImage,');
  text = text.replace('provider: { name: result.provider, model: result.model },', 'provider: { name: result.provider, model: result.model, model_class: result.model_class, lifecycle: result.model_lifecycle, location: result.location, fallback_used: result.fallback_used, attempted_models: result.attempted_models },');
  text = text.replace('result: { text: result.text, model: result.model, provider: result.provider, tokens: result.tokens, media_input: result.media_input },', 'result: { text: result.text, model: result.model, model_class: result.model_class, model_lifecycle: result.model_lifecycle, provider: result.provider, location: result.location, fallback_used: result.fallback_used, tokens: result.tokens, media_input: result.media_input },');
  text = text.replace('res.json(responseBase({ type: String(req.body?.type || "text"), orchestration: runtime.orchestration, render_state: runtime.renderState, output: result.text, model: result.model, provider: result.provider, usage: result.usage, media_input: result.media_input }));', 'res.json(responseBase({ type: String(req.body?.type || "text"), orchestration: runtime.orchestration, render_state: runtime.renderState, output: result.text, model: result.model, model_class: result.model_class, model_lifecycle: result.model_lifecycle, provider: result.provider, location: result.location, fallback_used: result.fallback_used, attempted_models: result.attempted_models, usage: result.usage, media_input: result.media_input }));');

  if (!text.includes('api.get("/models"')) {
    const routes = `api.get("/models", (_req, res) => {
  res.json(responseBase({ provider: VERTEX_PROVIDER, provider_boundary: "VERTEX_AI_ONLY", project: vertexProject, location: vertexLocation, models: vertexRouter.manifest() }));
});

api.post("/image", async (req, res, next) => {
  try {
    await requireProviderAccess(req);
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) throw httpError(422, "prompt is required");
    const result = await vertexRouter.generateImage({ prompt });
    res.json(responseBase({ request_id: req.requestId, type: "image", provider: { name: result.provider, model: result.model, lifecycle: result.lifecycle, model_class: result.modelClass, location: result.location }, asset: { mime_type: result.mimeType, data: result.data }, text: result.text }));
  } catch (error) { next(error); }
});

api.post("/video", async (req, res, next) => {
  try {
    await requireProviderAccess(req);
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) throw httpError(422, "prompt is required");
    const result = await vertexRouter.generateVideo({ prompt, aspectRatio: String(req.body?.aspect_ratio || "16:9"), durationSeconds: Number(req.body?.duration_seconds || 8) });
    res.json(responseBase({ request_id: req.requestId, type: "video", provider: { name: result.provider, model: result.model, lifecycle: result.lifecycle, model_class: result.modelClass, location: result.location, fallback_used: result.fallbackUsed, attempted_models: result.attempted }, asset: result.video }));
  } catch (error) { next(error); }
});

api.post("/audio", async (req, res, next) => {
  try {
    await requireProviderAccess(req);
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) throw httpError(422, "prompt is required");
    const result = await vertexRouter.generateAudio({ prompt });
    res.json(responseBase({ request_id: req.requestId, type: "audio", provider: { name: result.provider, model: result.model, lifecycle: result.lifecycle, model_class: result.modelClass, location: result.location, fallback_used: result.fallbackUsed, attempted_models: result.attempted }, asset: { mime_type: result.mimeType, data: result.data }, outputs: result.outputs }));
  } catch (error) { next(error); }
});

api.post("/embeddings", async (req, res, next) => {
  try {
    await requireProviderAccess(req);
    const content = String(req.body?.content || req.body?.text || "").trim();
    if (!content) throw httpError(422, "content is required");
    const result = await vertexRouter.embed({ content });
    res.json(responseBase({ request_id: req.requestId, type: "embedding", provider: { name: result.provider, model: result.model, lifecycle: result.lifecycle, model_class: result.modelClass, location: result.location, fallback_used: result.fallbackUsed, attempted_models: result.attempted }, embeddings: result.embeddings }));
  } catch (error) { next(error); }
});

`;
    text = text.replace('app.get("/", (_req, res) => {', routes + 'app.get("/", (_req, res) => {');
  }

  for (const forbidden of ['google-gemini-api', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_RUNTIME_API_KEY', 'THOTH_GEMINI_API_KEY']) {
    if (text.includes(forbidden)) throw new Error(`forbidden provider path remains in normalized server.js: ${forbidden}`);
  }
  if (!text.includes('new VertexModelRouter')) throw new Error('VertexModelRouter was not installed into normalized server.js');
  return text;
}

function normalizeControlPlane(source) {
  let text = source.replace(
    /const geminiApiKey = .*?\nconst vertexProject = .*?\nconst runtimeProvider = .*?;\n/,
    'const vertexProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || process.env.VERTEX_PROJECT || "project-7e6f2720-0291-4c91-8c3";\nconst runtimeProvider = "google-vertex-ai";\n',
  );
  text = text.replace(/function providerAvailable\(name\) \{[\s\S]*?\n\}/, 'function providerAvailable(name) {\n  return name === "google-vertex-ai" && Boolean(vertexProject);\n}');
  for (const forbidden of ['google-gemini-api', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']) {
    if (text.includes(forbidden)) throw new Error(`forbidden provider path remains in normalized control-plane-gateway.js: ${forbidden}`);
  }
  return text;
}

const voiceSource = `import express from "express";
import { GoogleGenAI } from "@google/genai";

export const THOTH_LIVE_MODEL = process.env.VERTEX_LIVE_MODEL || "gemini-live-2.5-flash-native-audio";
export const THOTH_RECORD_MODEL = process.env.THOTH_TRANSCRIBE_MODEL || "gemini-3.7-flash";
export const THOTH_SYSTEM_VOCABULARY = Object.freeze(["Jahorin","Trismegistus","Thoth","Wepwawet","Ma'at","Hathor","Horus","Anubis","Ptah","Seshat","Shu","Bes","Hapi","Osiris","Isis","Hephaestus","Mercury","TAE","GID","S.I.aaS.","Syncori","NovaLife","Augment","Interweb","Spatial OS","NSOS","HEROS"]);
function voiceError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }
function voiceClient(project, location) { if (!project) throw voiceError(503, "THOTH_VERTEX_NOT_CONFIGURED", "Vertex AI is not configured on ARI."); return new GoogleGenAI({ vertexai: true, project, location: location || "global" }); }
export function thothVoiceReadiness({ project, location = "global" } = {}) { return { thoth_voice_configured: Boolean(project), thoth_live_model: THOTH_LIVE_MODEL, thoth_record_model: THOTH_RECORD_MODEL, thoth_voice_provider: "google-vertex-ai", thoth_voice_authority: "server", thoth_client_provider_token_enabled: false, thoth_voice_location: location, thoth_voice_primitive: "VOICE>THOTH>LANGUAGE>JAHORIN>INTENTION" }; }
export function installThothVoiceRoutes(app, { project, location = "global", authorize }) {
  app.post("/api/voice/token", async (req, res, next) => { try { await authorize(req); res.status(409).json({ ok:false, code:"VERTEX_SERVER_AUTHORITY", error:"Direct browser-to-model live tokens are disabled. Voice intelligence is server-authoritative through ARI.", provider:"google-vertex-ai", model:THOTH_LIVE_MODEL, server_endpoint:"/api/voice/transcribe" }); } catch (error) { next(error); } });
  app.post("/api/voice/transcribe", express.raw({ type:"audio/*", limit:"25mb" }), async (req, res, next) => { try { await authorize(req); const mimeType=String(req.get("content-type")||"application/octet-stream").split(";")[0].trim().toLowerCase(); if(!mimeType.startsWith("audio/")) throw voiceError(415,"THOTH_AUDIO_TYPE","Thoth record requires an audio content type."); if(!Buffer.isBuffer(req.body)||req.body.length===0) throw voiceError(400,"THOTH_AUDIO_EMPTY","No audio recording was supplied."); const client=voiceClient(project,location); const response=await client.models.generateContent({ model:THOTH_RECORD_MODEL, contents:[{role:"user",parts:[{text:\`Transcribe this recording verbatim. Preserve names from this vocabulary when acoustically appropriate: \${THOTH_SYSTEM_VOCABULARY.join(", ")}. Return transcript text only.\`},{inlineData:{mimeType,data:req.body.toString("base64")}}]}], config:{temperature:0,maxOutputTokens:4096} }); const transcript=String(response.text||"").trim(); if(!transcript) throw voiceError(502,"THOTH_TRANSCRIPT_EMPTY","Vertex AI returned no transcription."); res.set("cache-control","no-store"); res.json({ok:true,intelligence:"THOTH",mode:"record",provider:"google-vertex-ai",model:THOTH_RECORD_MODEL,transcript}); } catch(error){ next(error); } });
}
`;

if (fs.existsSync('server.js')) {
  const before = fs.readFileSync('server.js', 'utf8');
  const after = normalizeVertexServer(before);
  if (writeChanges && after !== before) fs.writeFileSync('server.js', after);
  console.log(`Vertex-only server normalization ${writeChanges ? 'applied' : 'verified for image build'}`);
}
if (fs.existsSync('control-plane-gateway.js')) {
  const before = fs.readFileSync('control-plane-gateway.js', 'utf8');
  const after = normalizeControlPlane(before);
  if (writeChanges && after !== before) fs.writeFileSync('control-plane-gateway.js', after);
  console.log(`Vertex-only control-plane normalization ${writeChanges ? 'applied' : 'verified for image build'}`);
}
if (writeChanges) fs.writeFileSync('thoth-voice.js', voiceSource);
if (!fs.existsSync('vertex-model-router.js')) throw new Error('vertex-model-router.js is required for the production image');

if (!verified.length) throw new Error('no ARI gateway source files were available to verify');
console.log(`ARI startup normalization verified across ${verified.length} gateway files`);
console.log(`write_changes=${writeChanges}; changed=${filesChanged}; would_change=${filesWouldChange}; startup_budgets=${startupBudgetChanges}; neon_budgets=${neonTimeoutChanges}`);
console.log(`authorization readiness monitor replacements this invocation: ${readinessMonitorChanges}`);
console.log(`credential full-chain startup gate replacements this invocation: ${credentialStartupGateChanges}`);
console.log('self-healing authorization child readiness monitor verified');
console.log('Cloud Run external port is gated on full ARI inner-chain readiness');
console.log('Vertex AI is the sole generative provider in the production image');
