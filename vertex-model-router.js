import { GoogleGenAI } from "@google/genai";
import {
  VERTEX_PROVIDER,
  MODEL_QUALITY_RANK,
  VERTEX_MODEL_CATALOG,
  VERTEX_CAPABILITY_REGISTRY,
  getCapabilityPolicy,
  getModelDescriptor,
  modelChainForCapability,
  normalizeCapability,
} from "./vertex-model-registry.js";

export { VERTEX_PROVIDER, VERTEX_MODEL_CATALOG, VERTEX_CAPABILITY_REGISTRY } from "./vertex-model-registry.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const truthy = (value) => /^(1|true|yes|on)$/i.test(String(value || "").trim());
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

function makeError(message, code, cause = null, metadata = {}) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  Object.assign(error, metadata);
  return error;
}

function errorStatus(error) {
  return Number(error?.status || error?.response?.status || error?.cause?.status || 0);
}

function errorText(error) {
  return `${String(error?.code || error?.error?.status || "")} ${String(error?.message || error || "")}`;
}

function classifyProviderError(error) {
  const status = errorStatus(error);
  const text = errorText(error);
  if (error?.code === "STRUCTURED_OUTPUT_INVALID") return { category: "MALFORMED_OUTPUT", retry: true, substitute: true };
  if (/invalid model id|malformed model|invalid argument|INVALID_ARGUMENT/i.test(text) || status === 400) return { category: "CONFIGURATION", retry: false, substitute: false };
  if (status === 401 || /UNAUTHENTICATED|invalid credential|ADC|authentication/i.test(text)) return { category: "AUTHENTICATION", retry: false, substitute: false };
  if (status === 403 || /PERMISSION_DENIED/i.test(text)) {
    if (/model|publisher|endpoint|allowlist|not enabled|not available to (?:this|the) project|project.+access/i.test(text)) return { category: "PROJECT_ACCESS_DENIED", retry: false, substitute: true };
    return { category: "PERMISSION_CONFIGURATION", retry: false, substitute: false };
  }
  if (status === 404 || /NOT_FOUND|model.+(?:removed|retired|not found)|endpoint.+not found/i.test(text)) return { category: "MODEL_UNAVAILABLE", retry: false, substitute: true };
  if (status === 412 || /FAILED_PRECONDITION|unsupported.+(?:region|location)|not available.+(?:region|location)/i.test(text)) return { category: "REGION_OR_FEATURE_UNAVAILABLE", retry: false, substitute: true };
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit|capacity/i.test(text)) return { category: "QUOTA_OR_CAPACITY", retry: true, substitute: true };
  if ([408, 425, 500, 502, 503, 504].includes(status) || /UNAVAILABLE|DEADLINE_EXCEEDED|temporar/i.test(text)) return { category: "TRANSIENT_PROVIDER_FAILURE", retry: true, substitute: true };
  return { category: "PROVIDER_FAILURE", retry: false, substitute: false };
}

function inferRequiredFeatures(config = {}) {
  const features = new Set();
  const text = JSON.stringify(config?.tools || []);
  if (/functionDeclarations|function_declarations/i.test(text)) features.add("function_calling");
  if (/googleSearch|google_search|retrieval|ground/i.test(text)) {
    features.add("google_search");
    features.add("grounding");
  }
  if (config?.responseSchema || config?.responseJsonSchema || /json/i.test(String(config?.responseMimeType || ""))) features.add("structured_output");
  if (config?.systemInstruction) features.add("system_instruction");
  return [...features];
}

function estimateContextTokens(contents, config = {}, requirements = {}, context = {}) {
  const explicit = Number(requirements.effectiveContextTokens || context.effectiveContextTokens || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.ceil(explicit);
  let chars = 0;
  try { chars = JSON.stringify(contents ?? "").length; } catch { chars = String(contents ?? "").length; }
  const inputEstimate = Math.ceil(chars / 3);
  const additional = Math.max(0, Number(context.additionalContextTokens || 0));
  const output = Math.max(0, Number(config.maxOutputTokens || requirements.outputBudgetTokens || 4096));
  return inputEstimate + additional + output;
}

function sanitizedUsage(response) {
  const usage = response?.usageMetadata || response?.usage || null;
  if (!usage || typeof usage !== "object") return null;
  const safe = {};
  for (const key of ["promptTokenCount", "candidatesTokenCount", "totalTokenCount", "cachedContentTokenCount", "thoughtsTokenCount", "inputTokens", "outputTokens", "totalTokens"]) {
    if (Number.isFinite(Number(usage[key]))) safe[key] = Number(usage[key]);
  }
  return Object.keys(safe).length ? safe : null;
}

function sanitizeConfigForModel(modelId, config = {}) {
  const next = { ...config };
  if (/^gemini-3\.(?:7|6)-flash$/.test(modelId) || modelId === "gemini-3.5-flash-lite") {
    for (const key of ["temperature", "topP", "topK", "candidateCount", "frequencyPenalty", "presencePenalty", "thinkingBudget"]) delete next[key];
  }
  return next;
}

function modelSupports(modelSpec, contract, location, previewApproved) {
  const reasons = [];
  const quality = MODEL_QUALITY_RANK[modelSpec.qualityClass] || 0;
  const floor = MODEL_QUALITY_RANK[contract.minimumModelClass] || 0;
  if (!modelSpec.enabled) reasons.push("MODEL_DISABLED");
  if (quality < floor) reasons.push("QUALITY_FLOOR");
  for (const modality of contract.requiredModalities) if (!modelSpec.inputModalities.includes(modality)) reasons.push(`INPUT_MODALITY:${modality}`);
  for (const modality of contract.requiredOutputModalities) if (!modelSpec.outputModalities.includes(modality)) reasons.push(`OUTPUT_MODALITY:${modality}`);
  for (const feature of contract.requiredFeatures) if (!modelSpec.features.includes(feature)) reasons.push(`FEATURE:${feature}`);
  if (contract.effectiveContextTokens > 0 && modelSpec.contextWindow > 0 && contract.effectiveContextTokens > modelSpec.contextWindow) reasons.push("CONTEXT_LIMIT");
  if (modelSpec.lifecycle === "PREVIEW" && !previewApproved) reasons.push("PREVIEW_NOT_APPROVED");
  if (!modelSpec.locations.includes(location)) reasons.push(`LOCATION:${location}`);
  return reasons;
}

function makeRequestId(context = {}) {
  return String(context.requestId || context.correlationId || globalThis.crypto?.randomUUID?.() || `vertex-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
}

export function modelClassForCapability(capability = "", { image = false, deepSearch = false } = {}) {
  if (image) return "OPTICS";
  if (deepSearch) return "INTERWEB";
  return normalizeCapability(capability || "GENERAL_REASONING");
}

export class VertexModelRouter {
  constructor({ project, location = "global", observe = null } = {}) {
    this.project = String(project || "").trim();
    this.location = String(location || "global").trim() || "global";
    if (!this.project) throw makeError("GOOGLE_CLOUD_PROJECT is required for Vertex AI", "VERTEX_PROJECT_REQUIRED");
    this.clients = new Map();
    this.token = null;
    this.access = new Map();
    this.observe = typeof observe === "function" ? observe : (event) => console.log(JSON.stringify(event));
    this.retryLimit = clamp(process.env.VERTEX_SAME_MODEL_RETRIES ?? 2, 0, 3);
    this.retryBaseMs = clamp(process.env.VERTEX_RETRY_BASE_MS ?? 250, 50, 5000);
    this.approvedRoutingLocations = new Set(String(process.env.VERTEX_APPROVED_ROUTING_LOCATIONS || this.location).split(",").map((value) => value.trim()).filter(Boolean));
    this.approvedRoutingLocations.add(this.location);
  }

  client(location = this.location) {
    const resolved = String(location || this.location).trim() || this.location;
    if (!this.clients.has(resolved)) this.clients.set(resolved, new GoogleGenAI({ vertexai: true, project: this.project, location: resolved }));
    return this.clients.get(resolved);
  }

  policy(capability) { return getCapabilityPolicy(capability); }
  primaryModel(capability) { return getModelDescriptor(this.policy(capability).primary_model).id; }
  models(capability) { return modelChainForCapability(capability); }

  resolveContract(capability, { contents = "", config = {}, requirements = {}, context = {} } = {}) {
    const normalized = normalizeCapability(capability);
    const policy = this.policy(normalized);
    if (!policy.enabled) throw makeError(`Vertex capability ${normalized} is disabled`, "VERTEX_CAPABILITY_DISABLED");
    const requiredModalities = new Set([...policy.required_modalities, ...asArray(requirements.requiredModalities).map(String)]);
    const requiredOutputModalities = new Set([...policy.required_output_modalities, ...asArray(requirements.requiredOutputModalities).map(String)]);
    const requiredFeatures = new Set([...policy.required_features, ...asArray(requirements.requiredFeatures).map(String), ...inferRequiredFeatures(config)]);
    return {
      capability: normalized,
      provider: VERTEX_PROVIDER,
      minimumModelClass: String(requirements.minimumModelClass || policy.minimum_model_class),
      requiredModalities: [...requiredModalities],
      requiredOutputModalities: [...requiredOutputModalities],
      requiredFeatures: [...requiredFeatures],
      effectiveContextTokens: Math.max(estimateContextTokens(contents, config, requirements, context), Number(requirements.requiredContextTokens || 0)),
      regionPolicy: policy.region_policy,
      stabilityClass: policy.stability_class,
      reasonForSelection: policy.reason_for_selection,
      policy,
    };
  }

  previewApproved(modelSpec, contract) {
    if (modelSpec.lifecycle !== "PREVIEW") return true;
    const key = modelSpec.previewApprovalKey || contract.policy.preview_primary_approval_key;
    return Boolean(key && truthy(process.env[key]));
  }

  resolveLocation(modelSpec, contract) {
    if (modelSpec.locations.includes(this.location)) return this.location;
    if (contract.regionPolicy !== "EXPLICIT_APPROVED_LOCATION") return null;
    return modelSpec.locations.find((location) => this.approvedRoutingLocations.has(location)) || null;
  }

  candidatePlan(capability, args = {}) {
    const contract = this.resolveContract(capability, args);
    const rejected = [];
    const candidates = [];
    for (const modelSpec of modelChainForCapability(contract.capability)) {
      const location = this.resolveLocation(modelSpec, contract);
      const approved = this.previewApproved(modelSpec, contract);
      const reasons = location ? modelSupports(modelSpec, contract, location, approved) : ["REGION_POLICY"];
      if (reasons.length) rejected.push({ model: modelSpec.id, reasons });
      else candidates.push({ ...modelSpec, location });
    }
    if (!candidates.length) throw makeError(`No approved Vertex model satisfies ${contract.capability}`, "VERTEX_CAPABILITY_UNAVAILABLE", null, { capability: contract.capability, rejectedModels: rejected });
    return { contract, candidates, rejected };
  }

  async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60000) return this.token.value;
    const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw makeError(`Cloud Run ADC token request failed with HTTP ${response.status}`, "VERTEX_ADC_UNAVAILABLE");
    const payload = await response.json();
    if (!payload?.access_token) throw makeError("Cloud Run ADC returned no access token", "VERTEX_ADC_EMPTY");
    this.token = { value: payload.access_token, expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 300)) * 1000 };
    return this.token.value;
  }

  identityRefs(context = {}) {
    if (!truthy(process.env.VERTEX_LOG_IDENTITY_REFERENCES)) return { gid: null, sessionId: null };
    return { gid: context.gid ? String(context.gid) : null, sessionId: context.sessionId ? String(context.sessionId) : null };
  }

  record(event) {
    try { this.observe({ timestamp: new Date().toISOString(), provider: VERTEX_PROVIDER, ...event }); } catch { }
  }

  async execute({ capability, contents = "", config = {}, requirements = {}, context = {}, validateOutput = null, invoke }) {
    const started = Date.now();
    const id = makeRequestId(context);
    const { contract, candidates, rejected } = this.candidatePlan(capability, { contents, config, requirements, context });
    const expectedModel = candidates[0].id;
    const attempted = [];
    const substitutionReasons = rejected.map((item) => `${item.model}:${item.reasons.join("+")}`);
    let lastError = null;
    const refs = this.identityRefs(context);

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      for (let retry = 0; retry <= this.retryLimit; retry += 1) {
        attempted.push({ model: candidate.id, attempt: retry + 1, location: candidate.location });
        try {
          const modelConfig = sanitizeConfigForModel(candidate.id, config);
          const response = await invoke(candidate, modelConfig);
          if (validateOutput && !await validateOutput(response)) throw makeError("Vertex model output failed the required response contract", "STRUCTURED_OUTPUT_INVALID");
          this.access.set(`${candidate.id}@${candidate.location}`, { project: this.project, location: candidate.location, verifiedAt: new Date().toISOString(), status: "ACCESS_CONFIRMED" });
          const fallbackUsed = candidateIndex > 0;
          const fallbackReason = fallbackUsed ? substitutionReasons[substitutionReasons.length - 1] || "APPROVED_PRIMARY_FAILURE" : null;
          const metadata = { requestId: id, ...refs, capability: contract.capability, expectedModel, actualModel: candidate.id, selectedModel: candidate.id, modelLifecycle: candidate.lifecycle, minimumModelClass: contract.minimumModelClass, fallbackUsed, fallbackReason, location: candidate.location, latencyMs: Date.now() - started, success: true, providerErrorCategory: null, usage: sanitizedUsage(response), projectAccessVerified: true, attempted };
          this.record({ event: fallbackUsed ? "VERTEX_MODEL_SUBSTITUTION" : "VERTEX_INFERENCE", status: "SUCCESS", ...metadata });
          return { response, provider: VERTEX_PROVIDER, model: candidate.id, lifecycle: candidate.lifecycle, modelClass: contract.capability, location: candidate.location, fallbackUsed, attempted, metadata };
        } catch (error) {
          lastError = error;
          const failure = classifyProviderError(error);
          this.access.set(`${candidate.id}@${candidate.location}`, { project: this.project, location: candidate.location, verifiedAt: new Date().toISOString(), status: failure.category });
          if (failure.retry && retry < this.retryLimit) {
            const delay = Math.min(5000, this.retryBaseMs * (2 ** retry));
            this.record({ event: "VERTEX_MODEL_RETRY", status: "RETRYING", requestId: id, ...refs, capability: contract.capability, expectedModel, actualModel: candidate.id, location: candidate.location, providerErrorCategory: failure.category, retryAttempt: retry + 1, retryDelayMs: delay });
            await sleep(delay);
            continue;
          }
          if (failure.substitute && candidateIndex < candidates.length - 1) {
            substitutionReasons.push(`${candidate.id}:${failure.category}`);
            this.record({ event: "VERTEX_MODEL_SUBSTITUTION_PENDING", status: "FALLBACK_ROUTING", requestId: id, ...refs, capability: contract.capability, expectedModel, actualModel: candidate.id, substitutionReason: failure.category, location: candidate.location, result: "TRY_NEXT_APPROVED_VERTEX_MODEL" });
            break;
          }
          const terminal = makeError(`Vertex execution failed for ${contract.capability}: ${failure.category}`, ["CONFIGURATION", "AUTHENTICATION", "PERMISSION_CONFIGURATION"].includes(failure.category) ? "VERTEX_CONFIGURATION_ERROR" : "VERTEX_CAPABILITY_FAILURE", error, { capability: contract.capability, providerErrorCategory: failure.category, attemptedModels: attempted });
          this.record({ event: "VERTEX_INFERENCE", status: "FAILURE", requestId: id, ...refs, capability: contract.capability, expectedModel, actualModel: candidate.id, fallbackUsed: candidateIndex > 0, fallbackReason: substitutionReasons.at(-1) || null, location: candidate.location, latencyMs: Date.now() - started, providerErrorCategory: failure.category, success: false });
          throw terminal;
        }
      }
    }

    const terminal = makeError(`No approved Vertex model completed ${contract.capability}`, "VERTEX_CAPABILITY_FAILURE", lastError, { capability: contract.capability, attemptedModels: attempted, fallbackReasons: substitutionReasons });
    this.record({ event: "VERTEX_INFERENCE", status: "FAILURE", requestId: id, ...refs, capability: contract.capability, expectedModel, actualModel: null, fallbackUsed: attempted.length > 0, fallbackReason: substitutionReasons.at(-1) || null, latencyMs: Date.now() - started, providerErrorCategory: classifyProviderError(lastError).category, success: false });
    throw terminal;
  }

  async generateContent({ modelClass = "GENERAL_REASONING", capability = null, contents, config = {}, requirements = {}, context = {}, validateOutput = null } = {}) {
    const resolvedCapability = capability || modelClass || "GENERAL_REASONING";
    return this.execute({ capability: resolvedCapability, contents, config, requirements, context, validateOutput, invoke: (candidate, modelConfig) => this.client(candidate.location).models.generateContent({ model: candidate.id, contents, config: modelConfig }) });
  }

  async generateImage({ prompt, systemInstruction = "Generate the requested image faithfully.", context = {}, requirements = {} } = {}) {
    const result = await this.execute({
      capability: "IMAGE_GENERATION", contents: String(prompt || ""), config: { systemInstruction, responseModalities: ["TEXT", "IMAGE"] }, requirements, context,
      validateOutput: (response) => Boolean((response?.candidates?.[0]?.content?.parts || []).some((part) => part?.inlineData?.data)),
      invoke: (candidate, modelConfig) => this.client(candidate.location).models.generateContent({ model: candidate.id, contents: String(prompt || "").trim(), config: modelConfig }),
    });
    const parts = result.response?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part?.inlineData?.data);
    return { ...result, mimeType: imagePart.inlineData.mimeType || "image/png", data: imagePart.inlineData.data, text: parts.map((part) => part?.text || "").join("").trim() };
  }

  async generateVideo({ prompt, aspectRatio = "16:9", durationSeconds = 8, context = {}, requirements = {} } = {}) {
    const result = await this.execute({
      capability: "VIDEO_GENERATION", contents: String(prompt || ""), requirements, context,
      invoke: async (candidate) => {
        const client = this.client(candidate.location);
        let operation = await client.models.generateVideos({ model: candidate.id, source: { prompt: String(prompt || "").trim() }, config: { numberOfVideos: 1, aspectRatio, durationSeconds, generateAudio: true } });
        const deadline = Date.now() + 240000;
        while (!operation.done && Date.now() < deadline) { await sleep(4000); operation = await client.operations.getVideosOperation({ operation }); }
        if (!operation.done) throw makeError("Vertex video generation did not complete before the ARI deadline", "VERTEX_VIDEO_TIMEOUT", null, { status: 504 });
        const video = operation.response?.generatedVideos?.[0]?.video || null;
        if (!video?.uri && !video?.videoBytes) throw makeError("Vertex video model returned no video asset", "STRUCTURED_OUTPUT_INVALID");
        return operation;
      },
    });
    const video = result.response?.response?.generatedVideos?.[0]?.video || null;
    return { ...result, video };
  }

  async generateAudio({ prompt, context = {}, requirements = {} } = {}) {
    let token = null;
    const result = await this.execute({
      capability: "AUDIO_GENERATION", contents: String(prompt || ""), requirements, context,
      invoke: async (candidate) => {
        token ||= await this.accessToken();
        const response = await fetch(`https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(this.project)}/locations/${encodeURIComponent(candidate.location)}/interactions`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ model: candidate.id, input: [{ type: "text", text: String(prompt || "").trim() }] }), signal: AbortSignal.timeout(240000),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { const error = makeError(payload?.error?.message || `Vertex Lyria HTTP ${response.status}`, payload?.error?.status || "VERTEX_AUDIO_ERROR"); error.status = response.status; throw error; }
        const output = Array.isArray(payload?.outputs) ? payload.outputs.find((item) => item?.type === "audio" && item?.data) : null;
        if (!output?.data) throw makeError("Vertex Lyria returned no audio payload", "STRUCTURED_OUTPUT_INVALID");
        return payload;
      },
    });
    const output = Array.isArray(result.response?.outputs) ? result.response.outputs.find((item) => item?.type === "audio" && item?.data) : null;
    return { ...result, mimeType: output?.mime_type || "audio/mpeg", data: output?.data, outputs: result.response?.outputs || [] };
  }

  async embed({ content, context = {}, requirements = {} } = {}) {
    const result = await this.execute({ capability: "EMBEDDING", contents: String(content || ""), requirements, context, invoke: (candidate) => this.client(candidate.location).models.embedContent({ model: candidate.id, contents: String(content || "") }) });
    return { ...result, embeddings: result.response?.embeddings || [] };
  }

  manifest() {
    return {
      provider: VERTEX_PROVIDER,
      configuredLocation: this.location,
      approvedRoutingLocations: [...this.approvedRoutingLocations],
      capabilities: Object.fromEntries(Object.entries(VERTEX_CAPABILITY_REGISTRY).map(([key, policy]) => [key, { ...policy, models: modelChainForCapability(key).map((entry) => ({ id: entry.id, lifecycle: entry.lifecycle, qualityClass: entry.qualityClass, locations: entry.locations })) }])),
    };
  }

  accessReport() { return Object.fromEntries(this.access.entries()); }
}
