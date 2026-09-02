import fs from 'node:fs';

function rewrite(path, transform) {
  if (!fs.existsSync(path)) return false;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(path, after);
    console.log(`model-policy normalized: ${path}`);
    return true;
  }
  return false;
}

rewrite('server.js', (source) => {
  let text = source.replace(
    /const geminiModel = .*?;\nconst provider = VERTEX_PROVIDER;\nconst vertexRouter = new VertexModelRouter\(\{ project: vertexProject, location: vertexLocation \}\);/,
    'const provider = VERTEX_PROVIDER;\nconst vertexRouter = new VertexModelRouter({ project: vertexProject, location: vertexLocation });\nconst primaryOrchestrationModel = vertexRouter.primaryModel("ORCHESTRATION");',
  );
  text = text.replace(/model:\s*geminiModel,/g, 'model: primaryOrchestrationModel,');
  text = text.replace(/withProviderRetry\(\(\) => router\.generateContent\((\{[\s\S]*?\})\)\)/g, 'router.generateContent($1)');

  // Every HTTP inference must carry the API request/correlation id into Vertex observability.
  text = text.replace(
    'async function generateWithGoogle({ prompt, systemInstruction, temperature = 0.7, image = null, groundWithSearch = false, capability = "jahorin" }) {',
    'async function generateWithGoogle({ prompt, systemInstruction, temperature = 0.7, image = null, groundWithSearch = false, capability = "jahorin", requestId = null }) {',
  );
  text = text.replace(
    'const routed = await router.generateContent({ modelClass, contents, config });',
    'const routed = await router.generateContent({ modelClass, contents, config, context: { requestId } });',
  );
  text = text.replace(
    'const result = await generateWithGoogle({\n      prompt,\n      capability: deepSearch ? "interweb" : "tae",',
    'const result = await generateWithGoogle({\n      prompt,\n      requestId: req.body?.request_id || req.requestId,\n      capability: deepSearch ? "interweb" : "tae",',
  );
  text = text.replace(
    'const result = await generateWithGoogle({\n        prompt: providerPrompt,\n        capability,',
    'const result = await generateWithGoogle({\n        prompt: providerPrompt,\n        requestId,\n        capability,',
  );
  text = text.replace(
    'const result = await generateWithGoogle({\n      prompt,\n      capability: String(req.body?.type || "scribe"),',
    'const result = await generateWithGoogle({\n      prompt,\n      requestId: req.requestId,\n      capability: String(req.body?.type || "scribe"),',
  );
  text = text.replace('vertexRouter.generateImage({ prompt })', 'vertexRouter.generateImage({ prompt, context: { requestId: req.requestId } })');
  text = text.replace(
    'vertexRouter.generateVideo({ prompt, aspectRatio: String(req.body?.aspect_ratio || "16:9"), durationSeconds: Number(req.body?.duration_seconds || 8) })',
    'vertexRouter.generateVideo({ prompt, aspectRatio: String(req.body?.aspect_ratio || "16:9"), durationSeconds: Number(req.body?.duration_seconds || 8), context: { requestId: req.requestId } })',
  );
  text = text.replace('vertexRouter.generateAudio({ prompt })', 'vertexRouter.generateAudio({ prompt, context: { requestId: req.requestId } })');
  text = text.replace('vertexRouter.embed({ content })', 'vertexRouter.embed({ content, context: { requestId: req.requestId } })');
  return text;
});

rewrite('vertex-model-router.js', (source) => source.replace(
  /function sanitizeConfigForModel\([\s\S]*?\n}\n\nfunction modelSupports/,
  `function sanitizeConfigForModel(modelSpec, config = {}) {\n  const next = { ...config };\n  if (modelSpec.stripUnsupportedSampling) {\n    for (const key of ["temperature", "topP", "topK", "candidateCount", "frequencyPenalty", "presencePenalty", "thinkingBudget"]) delete next[key];\n  }\n  return next;\n}\n\nfunction modelSupports`,
).replace(/sanitizeConfigForModel\(candidate\.id, config\)/g, 'sanitizeConfigForModel(candidate, config)'));

rewrite('scripts/normalize-gateway-startup.mjs', (source) => {
  let text = source.replace(/\s*'const geminiModel = .*?\\n' \+\n/g, '');
  text = text.replace('const routed = await withProviderRetry(() => router.generateContent({ modelClass, contents, config }));', 'const routed = await router.generateContent({ modelClass, contents, config, context: { requestId } });');
  return text;
});

rewrite('.env.example', (source) => {
  let text = source.replace(/^VERTEX_(?:ORCHESTRATOR|FAST|ECONOMY|VISION|IMAGE|VIDEO|AUDIO|LIVE|EMBEDDING)[A-Z_]*=.*\n/gm, '');
  const marker = 'GOOGLE_GENAI_USE_VERTEXAI=true\n';
  const policy = [
    'VERTEX_SAME_MODEL_RETRIES=2',
    'VERTEX_RETRY_BASE_MS=250',
    'VERTEX_APPROVED_ROUTING_LOCATIONS=global',
    'VERTEX_APPROVE_PREVIEW_REASONING=false',
    'VERTEX_APPROVE_PREVIEW_VIDEO=false',
    'VERTEX_APPROVE_PREVIEW_AUDIO=false',
    'VERTEX_LOG_IDENTITY_REFERENCES=false',
    '',
  ].join('\n');
  if (text.includes(marker) && !text.includes('VERTEX_SAME_MODEL_RETRIES=')) text = text.replace(marker, marker + policy);
  return text;
});

const voice = `import express from "express";\nimport { VertexModelRouter } from "./vertex-model-router.js";\nimport { primaryModelForCapability } from "./vertex-model-registry.js";\n\nexport const THOTH_SYSTEM_VOCABULARY = Object.freeze(["Jahorin","Trismegistus","Thoth","Wepwawet","Ma'at","Hathor","Horus","Anubis","Ptah","Seshat","Shu","Bes","Hapi","Osiris","Isis","Hephaestus","Mercury","TAE","GID","S.I.aaS.","Syncori","NovaLife","Augment","Interweb","Spatial OS","NSOS","HEROS"]);\nfunction voiceError(status, code, message) { const error = new Error(message); error.status = status; error.code = code; return error; }\nexport function thothVoiceReadiness({ project, location = "global" } = {}) { return { thoth_voice_configured: Boolean(project), thoth_live_model: primaryModelForCapability("LIVE"), thoth_record_model: primaryModelForCapability("VOICE_TRANSCRIPTION"), thoth_voice_provider: "google-vertex-ai", thoth_voice_authority: "server", thoth_client_provider_token_enabled: false, thoth_voice_location: location, thoth_voice_primitive: "VOICE>THOTH>LANGUAGE>JAHORIN>INTENTION" }; }\nexport function installThothVoiceRoutes(app, { project, location = "global", authorize }) {\n  const router = new VertexModelRouter({ project, location });\n  app.post("/api/voice/token", async (req, res, next) => { try { await authorize(req); res.status(409).json({ ok:false, code:"VERTEX_SERVER_AUTHORITY", error:"Direct browser-to-model live tokens are disabled. Voice intelligence is server-authoritative through ARI.", provider:"google-vertex-ai", model:primaryModelForCapability("LIVE"), server_endpoint:"/api/voice/transcribe" }); } catch (error) { next(error); } });\n  app.post("/api/voice/transcribe", express.raw({ type:"audio/*", limit:"25mb" }), async (req, res, next) => { try { await authorize(req); const mimeType=String(req.get("content-type")||"application/octet-stream").split(";")[0].trim().toLowerCase(); if(!mimeType.startsWith("audio/")) throw voiceError(415,"THOTH_AUDIO_TYPE","Thoth record requires an audio content type."); if(!Buffer.isBuffer(req.body)||req.body.length===0) throw voiceError(400,"THOTH_AUDIO_EMPTY","No audio recording was supplied."); const instruction="Transcribe this recording verbatim. Preserve names from this vocabulary when acoustically appropriate: " + THOTH_SYSTEM_VOCABULARY.join(", ") + ". Return transcript text only."; const routed=await router.generateContent({ capability:"VOICE_TRANSCRIPTION", contents:[{role:"user",parts:[{text:instruction},{inlineData:{mimeType,data:req.body.toString("base64")}}]}], config:{maxOutputTokens:4096}, requirements:{requiredModalities:["audio"]}, context:{requestId:req.requestId} }); const transcript=String(routed.response?.text||"").trim(); if(!transcript) throw voiceError(502,"THOTH_TRANSCRIPT_EMPTY","Vertex AI returned no transcription."); res.set("cache-control","no-store"); res.json({ok:true,intelligence:"THOTH",mode:"record",provider:routed.provider,model:routed.model,model_lifecycle:routed.lifecycle,fallback_used:routed.fallbackUsed,transcript}); } catch(error){ next(error); } });\n}\n`;
if (fs.existsSync('thoth-voice.js') && fs.readFileSync('thoth-voice.js', 'utf8') !== voice) {
  fs.writeFileSync('thoth-voice.js', voice);
  console.log('model-policy normalized: thoth-voice.js');
}
