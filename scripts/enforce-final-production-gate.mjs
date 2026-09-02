import fs from 'node:fs';

function rewrite(path, transform) {
  if (!fs.existsSync(path)) return false;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(path, after);
    console.log(`final-gate normalized: ${path}`);
    return true;
  }
  return false;
}

function installGatewayDeadline(source, legacyTimeout, ordinaryTimeout) {
  let text = source;
  if (!text.includes('function innerRequestTimeout(req)')) {
    text = text.replace(
      'async function innerJson(req, raw = null) {',
      `function innerRequestTimeout(req) {\n  const pathname = new URL(req.url || "/", "http://localhost").pathname;\n  const providerPaths = new Set(["/api/runtime", "/api/tae", "/api/generate", "/api/image", "/api/video", "/api/audio", "/api/embeddings", "/api/voice/transcribe", "/api/maat/substitution-proof"]);\n  return providerPaths.has(pathname) ? 300_000 : ${ordinaryTimeout};\n}\n\nasync function innerJson(req, raw = null) {`,
    );
  }
  text = text.replace(`signal: AbortSignal.timeout(${legacyTimeout}),`, 'signal: AbortSignal.timeout(innerRequestTimeout(req)),');
  return text;
}

rewrite('control-plane-gateway.js', (source) => installGatewayDeadline(source, '60000', '60_000'));
rewrite('neon-runtime-gateway.js', (source) => installGatewayDeadline(source, '45_000', '45_000'));

rewrite('vertex-model-router.js', (source) => {
  let text = source;
  text = text.replace(
    '    const rejected = [];\n    const candidates = [];\n    for (const modelSpec of modelChainForCapability(contract.capability)) {',
    '    const rejected = [];\n    const candidates = [];\n    const disabledModels = new Set(asArray(args?.requirements?.disabledModels).map((value) => String(value || "").trim()).filter(Boolean));\n    for (const modelSpec of modelChainForCapability(contract.capability)) {',
  );
  text = text.replace(
    '      const reasons = location ? modelSupports(modelSpec, contract, location, approved) : ["REGION_POLICY"];\n      if (reasons.length) rejected.push({ model: modelSpec.id, reasons });',
    '      const reasons = location ? modelSupports(modelSpec, contract, location, approved) : ["REGION_POLICY"];\n      if (disabledModels.has(modelSpec.id)) reasons.push("RUNTIME_DISABLED");\n      if (reasons.length) rejected.push({ model: modelSpec.id, reasons });',
  );
  text = text.replace('    const expectedModel = candidates[0].id;', '    const expectedModel = getModelDescriptor(contract.policy.primary_model).id;');
  text = text.replace('          const fallbackUsed = candidateIndex > 0;', '          const fallbackUsed = candidate.id !== expectedModel || candidateIndex > 0;');
  text = text.replace(
    '          const metadata = { requestId: id, ...refs, capability: contract.capability, expectedModel, actualModel: candidate.id, selectedModel: candidate.id, modelLifecycle: candidate.lifecycle, minimumModelClass: contract.minimumModelClass, fallbackUsed, fallbackReason, location: candidate.location, latencyMs: Date.now() - started, success: true, providerErrorCategory: null, usage: sanitizedUsage(response), projectAccessVerified: true, attempted };',
    '          const metadata = { requestId: id, correlationId: String(context.correlationId || id), provider: VERTEX_PROVIDER, ...refs, capability: contract.capability, expectedModel, actualModel: candidate.id, selectedModel: candidate.id, modelLifecycle: candidate.lifecycle, minimumModelClass: contract.minimumModelClass, fallbackUsed, fallbackReason, location: candidate.location, latencyMs: Date.now() - started, success: true, providerErrorCategory: null, usage: sanitizedUsage(response), projectAccessVerified: true, attempted, rejectedModels: rejected };',
  );
  text = text.replace(
    '          return { response, provider: VERTEX_PROVIDER, model: candidate.id, lifecycle: candidate.lifecycle, modelClass: contract.capability, location: candidate.location, fallbackUsed, attempted, metadata };',
    '          return { response, provider: VERTEX_PROVIDER, model: candidate.id, lifecycle: candidate.lifecycle, modelClass: contract.capability, location: candidate.location, fallbackUsed, fallbackReason, attempted, metadata };',
  );
  return text;
});

rewrite('server.js', (source) => {
  let text = source;
  text = text.replace(
    '    attempted_models: routed.attempted,\n    tokens:',
    '    attempted_models: routed.attempted,\n    fallback_reason: routed.metadata?.fallbackReason || null,\n    observability: routed.metadata || null,\n    tokens:',
  );
  text = text.replaceAll(
    'provider: { name: result.provider, model: result.model, model_class: result.model_class, lifecycle: result.model_lifecycle, location: result.location, fallback_used: result.fallback_used, attempted_models: result.attempted_models },',
    'provider: { name: result.provider, model: result.model, model_class: result.model_class, lifecycle: result.model_lifecycle, location: result.location, fallback_used: result.fallback_used, fallback_reason: result.fallback_reason, attempted_models: result.attempted_models },\n        observability: result.observability,',
  );
  text = text.replace(
    'attempted_models: result.attempted_models, usage: result.usage, media_input: result.media_input }));',
    'attempted_models: result.attempted_models, fallback_reason: result.fallback_reason, observability: result.observability, usage: result.usage, media_input: result.media_input }));',
  );
  text = text.replace(
    'result: { text: result.text, model: result.model, model_class: result.model_class, model_lifecycle: result.model_lifecycle, provider: result.provider, location: result.location, fallback_used: result.fallback_used, tokens: result.tokens, media_input: result.media_input },',
    'result: { text: result.text, model: result.model, model_class: result.model_class, model_lifecycle: result.model_lifecycle, provider: result.provider, location: result.location, fallback_used: result.fallback_used, fallback_reason: result.fallback_reason, tokens: result.tokens, media_input: result.media_input },\n          observability: result.observability,',
  );

  if (!text.includes('api.post("/maat/substitution-proof"')) {
    const proofRoute = `api.post("/maat/substitution-proof", async (req, res, next) => {\n  try {\n    const principal = await requireProviderAccess(req);\n    if (principal?.kind !== "owner") throw httpError(403, "Prime Orchestrator authority required for Ma'at substitution proof");\n    const capability = String(req.body?.capability || "GENERAL_REASONING").trim().toUpperCase();\n    const expectedModel = vertexRouter.primaryModel(capability);\n    const routed = await vertexRouter.generateContent({\n      modelClass: capability,\n      contents: "Return exactly: Vertex fallback proof.",\n      config: { maxOutputTokens: 64 },\n      requirements: { disabledModels: [expectedModel] },\n      context: { requestId: req.requestId, correlationId: req.requestId },\n    });\n    if (!routed.fallbackUsed || routed.model === expectedModel) throw httpError(502, "Ma'at substitution proof did not leave the declared primary");\n    res.json(responseBase({\n      request_id: req.requestId,\n      proof_text: String(routed.response?.text || "").trim(),\n      provider: { name: routed.provider, expected_model: expectedModel, model: routed.model, lifecycle: routed.lifecycle, model_class: routed.modelClass, location: routed.location, fallback_used: routed.fallbackUsed, fallback_reason: routed.metadata?.fallbackReason || null, attempted_models: routed.attempted, rejected_models: routed.metadata?.rejectedModels || [] },\n      observability: routed.metadata || null,\n    }));\n  } catch (error) { next(error); }\n});\n\n`;
    text = text.replace('api.post("/image", async (req, res, next) => {', proofRoute + 'api.post("/image", async (req, res, next) => {');
  }

  text = text.replace(
    'res.json(responseBase({ request_id: req.requestId, type: "image", provider: { name: result.provider, model: result.model, lifecycle: result.lifecycle, model_class: result.modelClass, location: result.location }, asset:',
    'res.json(responseBase({ request_id: req.requestId, type: "image", provider: { name: result.provider, model: result.model, lifecycle: result.lifecycle, model_class: result.modelClass, location: result.location, fallback_used: result.fallbackUsed, fallback_reason: result.metadata?.fallbackReason || null, attempted_models: result.attempted }, observability: result.metadata || null, asset:',
  );
  text = text.replace(
    'attempted_models: result.attempted }, asset: result.video',
    'attempted_models: result.attempted, fallback_reason: result.metadata?.fallbackReason || null }, observability: result.metadata || null, asset: result.video',
  );
  text = text.replace(
    'attempted_models: result.attempted }, asset: { mime_type: result.mimeType, data: result.data }, outputs:',
    'attempted_models: result.attempted, fallback_reason: result.metadata?.fallbackReason || null }, observability: result.metadata || null, asset: { mime_type: result.mimeType, data: result.data }, outputs:',
  );
  text = text.replace(
    'attempted_models: result.attempted }, embeddings: result.embeddings',
    'attempted_models: result.attempted, fallback_reason: result.metadata?.fallbackReason || null }, observability: result.metadata || null, embeddings: result.embeddings',
  );
  return text;
});

rewrite('thoth-voice.js', (source) => source.replace(
  'fallback_used:routed.fallbackUsed,transcript',
  'fallback_used:routed.fallbackUsed,fallback_reason:routed.metadata?.fallbackReason||null,observability:routed.metadata||null,transcript',
));

rewrite('scripts/prove-final-production-gate.mjs', (source) => {
  let text = source;
  text = text.replace(
    'function recordCapability(name, result, expectedClass = null) {\n  const meta = providerMeta(result.body);',
    `function observabilityOf(body = {}) { return body?.observability || body?.result?.observability || null; }\nfunction assertObservability(name, body = {}) {\n  const obs = observabilityOf(body);\n  assert(obs && typeof obs === 'object', 'No sanitized Vertex observability envelope for ' + name);\n  for (const key of ['requestId','correlationId','provider','capability','expectedModel','actualModel','modelLifecycle','location','fallbackUsed','fallbackReason','latencyMs','success','providerErrorCategory','usage']) {\n    assert(Object.prototype.hasOwnProperty.call(obs, key), name + ' observability missing ' + key, obs);\n  }\n  assert(obs.provider === 'google-vertex-ai', name + ' observability provider drifted', obs);\n  assert(obs.success === true, name + ' observability did not record success', obs);\n  evidence.observability_events ||= [];\n  evidence.observability_events.push({ request_id: obs.requestId, correlation_id: obs.correlationId, capability: obs.capability, provider: obs.provider, expected_model: obs.expectedModel, actual_model: obs.actualModel, model_lifecycle: obs.modelLifecycle, location: obs.location, fallback_used: obs.fallbackUsed, fallback_reason: obs.fallbackReason, latency_ms: obs.latencyMs, success: obs.success, provider_error_category: obs.providerErrorCategory, usage: obs.usage });\n  return obs;\n}\nfunction recordCapability(name, result, expectedClass = null) {\n  const meta = providerMeta(result.body);\n  const observability = assertObservability(name, result.body);`,
  );
  text = text.replace(
    '    attempted_models: meta.attempted_models,\n  };',
    '    attempted_models: meta.attempted_models,\n    expected_model: observability.expectedModel,\n    fallback_reason: observability.fallbackReason,\n  };',
  );

  if (!text.includes("const substitutionId = requestId('substitution')")) {
    const substitutionProof = `  const substitutionId = requestId('substitution');\n  const substitution = await call('/api/maat/substitution-proof', { method: 'POST', id: substitutionId, json: { capability: 'GENERAL_REASONING' }, timeoutMs: 180000 });\n  assert(substitution.ok, 'Controlled production substitution proof failed', { status: substitution.status, body: safeErrorBody(substitution.body) });\n  const substitutionMeta = providerMeta(substitution.body);\n  const substitutionObs = assertObservability('SUBSTITUTION_PROOF', substitution.body);\n  assert(substitutionMeta.provider === 'google-vertex-ai', 'Substitution escaped Vertex AI', substitutionMeta);\n  assert(substitutionMeta.fallback_used === true, 'Controlled primary unavailability did not select an approved fallback', substitutionMeta);\n  assert(substitution.body?.provider?.expected_model && substitution.body.provider.expected_model !== substitutionMeta.model, 'Substitution did not move away from the declared primary', substitution.body?.provider);\n  assert(/RUNTIME_DISABLED/.test(String(substitution.body?.provider?.fallback_reason || substitutionObs?.fallbackReason || '')), 'Substitution reason was not the controlled runtime-unavailable primary', substitution.body?.provider);\n  assert(String(substitution.body?.proof_text || '').trim(), 'Fallback model returned no real provider result');\n  evidence.substitution_proof = { expected_model: substitution.body.provider.expected_model, actual_model: substitutionMeta.model, provider: substitutionMeta.provider, fallback_used: true, fallback_reason: substitution.body.provider.fallback_reason, attempted_models: substitutionMeta.attempted_models, rejected_models: substitution.body.provider.rejected_models || [] };\n  evidence.checks.production_substitution_proof = true;\n  console.log('PASS deterministic Vertex substitution: ' + substitution.body.provider.expected_model + ' -> ' + substitutionMeta.model);\n\n`;
    text = text.replace("  const twin = await call('/api/twin');", substitutionProof + "  const twin = await call('/api/twin');");
  }

  text = text.replace(
    '  evidence.checks.production_substitution_proof = substitutions.length > 0;',
    '  evidence.checks.production_substitution_proof = evidence.checks.production_substitution_proof === true || substitutions.length > 0;',
  );
  text = text.replace(
    "  evidence.checks.production_verified = true;\n\n  const required = [",
    `  evidence.checks.production_verified = true;\n  const observed = Array.isArray(evidence.observability_events) ? evidence.observability_events : [];\n  const substitutionObserved = observed.some((event) => event.fallback_used === true && /RUNTIME_DISABLED/.test(String(event.fallback_reason || '')));\n  evidence.checks.substitution_observability = observed.length >= successful.length && substitutionObserved;\n  const observabilitySummary = { verified: evidence.checks.substitution_observability === true, correlated_request_count: observed.length, revision: process.env.LIVE_ARI_REVISION || null, fields: ['requestId','correlationId','provider','capability','expectedModel','actualModel','modelLifecycle','location','fallbackUsed','fallbackReason','latencyMs','success','providerErrorCategory','usage'], source: 'sanitized-production-response-envelope' };\n  fs.writeFileSync('/tmp/observability-proof.json', JSON.stringify(observabilitySummary, null, 2) + '\\n');\n\n  const required = [`,
  );
  text = text.replace(
    "    'project_access_verified','fail_closed_verified','tae_continuity_verified','google_first_party_only','vertex_only_policy','production_verified',",
    "    'project_access_verified','fail_closed_verified','tae_continuity_verified','google_first_party_only','vertex_only_policy','production_verified','substitution_observability',",
  );
  return text;
});

for (const [path, required] of [
  ['control-plane-gateway.js', ['innerRequestTimeout(req)', '300_000']],
  ['vertex-model-router.js', ['RUNTIME_DISABLED', 'correlationId', 'expectedModel = getModelDescriptor(contract.policy.primary_model).id']],
  ['server.js', ['api.post("/maat/substitution-proof"', 'observability: routed.metadata']],
  ['scripts/prove-final-production-gate.mjs', ["/api/maat/substitution-proof", '/tmp/observability-proof.json']],
]) {
  const text = fs.readFileSync(path, 'utf8');
  for (const marker of required) if (!text.includes(marker)) throw new Error(`final production gate marker missing in ${path}: ${marker}`);
}

console.log('MA\'AT final production gate enforcement: PASS');
