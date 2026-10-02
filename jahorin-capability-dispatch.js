/**
 * Jahorin's first-party provider-backed capability dispatcher.
 *
 * This deliberately implements only operations backed by concrete adapters.
 * Capabilities that require a filesystem, sandbox, connector, or device adapter
 * fail closed instead of returning model-generated text as if an action ran.
 */
export function capabilityUnavailable(capability, operation) {
  const error = new Error(`No executable adapter is configured for ${capability}${operation ? `/${operation}` : ""}.`);
  error.status = 503;
  error.code = "CAPABILITY_ADAPTER_UNAVAILABLE";
  error.capability = capability;
  error.operation = operation || null;
  return error;
}

const ALIASES = Object.freeze({
  chat: "system.orchestrate",
  core: "system.orchestrate",
  jahorin: "system.orchestrate",
  "jahorin core": "system.orchestrate",
  general: "system.orchestrate",
  text: "system.orchestrate",
  runtime: "system.orchestrate",
  code: "software.code",
  ptah: "software.code",
  "intent-to-code": "software.code",
  interweb: "web.research",
  wepwawet: "web.research",
  thoth: "documents.scribe",
  scribe: "documents.scribe",
  horus: "media.image",
  optics: "media.image",
  hathor: "media.audio",
  augment: "media.audio",
  image: "media.image",
  video: "media.video",
  audio: "media.audio",
});

function normalizeCapability(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ALIASES[raw] || raw;
}

function cleanText(value, label, max = 20000) {
  const result = String(value ?? "").trim();
  if (!result) {
    const error = new Error(`${label} is required.`);
    error.status = 422;
    error.code = "VALIDATION_ERROR";
    throw error;
  }
  if (result.length > max) {
    const error = new Error(`${label} exceeds the ${max}-character limit.`);
    error.status = 413;
    error.code = "PAYLOAD_TOO_LARGE";
    throw error;
  }
  return result;
}

export async function executeJahorinCapability({
  capability,
  operation = "",
  intent,
  payload = {},
  context = {},
  providers,
  legacyOrchestrate,
}) {
  const id = normalizeCapability(capability);
  const op = String(operation || payload?.operation || "").trim().toLowerCase();
  const prompt = cleanText(intent || payload?.prompt || payload?.command, "intent");
  const requestContext = {
    requestId: context.request_id || context.requestId || payload?.request_id,
    correlationId: context.correlation_id || context.correlationId,
  };

  if (id === "system.orchestrate" || id === "jahorin") {
    if (typeof legacyOrchestrate !== "function") throw capabilityUnavailable(id, op);
    return legacyOrchestrate({ capability: id, intent: prompt, payload, context });
  }

  if (id === "software.code") {
    if (!["", "generate", "explain", "inspect", "refactor", "debug"].includes(op)) {
      throw capabilityUnavailable(id, op);
    }
    const result = await providers.generateText({
      capability: "CODE",
      prompt,
      systemInstruction: "You are Ptah, Jahorin's software engineering assistant. Produce precise, secure, maintainable code. Never claim that code was executed, tested, committed, or deployed unless a real execution adapter supplied evidence. Include assumptions and tests when useful.",
      context: requestContext,
    });
    return { capability: id, operation: op || "generate", execution_kind: "model_generation", ...result };
  }

  if (id === "web.research") {
    if (!providers?.generateText) throw capabilityUnavailable(id, op);
    const result = await providers.generateText({
      capability: "INTERWEB",
      prompt,
      systemInstruction: "You are Wepwawet, Jahorin's research assistant. Use available web grounding. Distinguish sourced facts from inference and include source references returned by the provider. If grounding is unavailable, say so.",
      groundWithSearch: true,
      context: requestContext,
    });
    return { capability: id, operation: op || "research", execution_kind: "grounded_model_research", ...result };
  }

  if (id === "documents.scribe") {
    if (!providers?.generateText || !["", "draft", "summarize", "rewrite", "extract"].includes(op)) {
      throw capabilityUnavailable(id, op);
    }
    const result = await providers.generateText({
      capability: "SCRIBE",
      prompt,
      systemInstruction: "You are Thoth, Jahorin's document and knowledge assistant. Return well-structured content and clearly state that this operation generates content only; persistent file storage must be performed by a separately configured files adapter.",
      context: requestContext,
    });
    return { capability: id, operation: op || "draft", execution_kind: "document_content_generation", persistence: "not_performed", ...result };
  }

  if (id === "media.image") {
    const result = await providers.generateImage({ prompt, context: requestContext });
    return { capability: id, operation: op || "generate", execution_kind: "provider_media_generation", asset: { mime_type: result.mimeType, data: result.data }, provider: result.provider, model: result.model, location: result.location, text: result.text || "" };
  }

  if (id === "media.video") {
    const result = await providers.generateVideo({
      prompt,
      aspectRatio: String(payload.aspect_ratio || "16:9"),
      durationSeconds: Number(payload.duration_seconds || 8),
      context: requestContext,
    });
    return { capability: id, operation: op || "generate", execution_kind: "provider_media_generation", asset: result.video, provider: result.provider, model: result.model, location: result.location };
  }

  if (id === "media.audio") {
    const result = await providers.generateAudio({ prompt, context: requestContext });
    return { capability: id, operation: op || "generate", execution_kind: "provider_media_generation", asset: { mime_type: result.mimeType, data: result.data }, outputs: result.outputs, provider: result.provider, model: result.model, location: result.location };
  }

  // Do not misrepresent plans, model responses, or UI simulations as execution.
  throw capabilityUnavailable(id, op);
}
