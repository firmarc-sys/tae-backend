export const VERTEX_PROVIDER = "google-vertex-ai";

export const MODEL_QUALITY_RANK = Object.freeze({
  ECONOMY: 1,
  FAST: 2,
  GENERAL: 3,
  ADVANCED: 4,
  SPECIALIZED: 5,
});

const model = (spec) => Object.freeze({
  provider: VERTEX_PROVIDER,
  enabled: true,
  ...spec,
  inputModalities: Object.freeze([...(spec.inputModalities || [])]),
  outputModalities: Object.freeze([...(spec.outputModalities || [])]),
  features: Object.freeze([...(spec.features || [])]),
  locations: Object.freeze([...(spec.locations || [])]),
});

export const VERTEX_MODEL_CATALOG = Object.freeze({
  GEMINI_3_7_FLASH: model({
    id: "gemini-3.7-flash",
    lifecycle: "GA",
    stripUnsupportedSampling: true,
    qualityClass: "ADVANCED",
    latencyClass: "FAST",
    costClass: "BALANCED",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    features: ["system_instruction", "structured_output", "function_calling", "google_search", "grounding", "code_execution", "count_tokens"],
    locations: ["global", "us", "eu"],
  }),
  GEMINI_3_6_FLASH: model({
    id: "gemini-3.6-flash",
    lifecycle: "GA",
    stripUnsupportedSampling: true,
    qualityClass: "ADVANCED",
    latencyClass: "FAST",
    costClass: "BALANCED",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    features: ["system_instruction", "structured_output", "function_calling", "google_search", "grounding", "code_execution", "count_tokens"],
    locations: ["global", "us", "eu"],
  }),
  GEMINI_3_5_FLASH: model({
    id: "gemini-3.5-flash",
    lifecycle: "GA",
    qualityClass: "GENERAL",
    latencyClass: "FAST",
    costClass: "BALANCED",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    features: ["system_instruction", "structured_output", "function_calling", "google_search", "grounding", "code_execution", "count_tokens"],
    locations: ["global", "us", "eu"],
  }),
  GEMINI_3_5_FLASH_LITE: model({
    id: "gemini-3.5-flash-lite",
    lifecycle: "GA",
    stripUnsupportedSampling: true,
    qualityClass: "FAST",
    latencyClass: "LOW",
    costClass: "ECONOMY",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    features: ["system_instruction", "structured_output", "function_calling", "google_search", "grounding", "code_execution", "count_tokens"],
    locations: ["global", "us", "eu"],
  }),
  GEMINI_3_1_FLASH_LITE: model({
    id: "gemini-3.1-flash-lite",
    lifecycle: "GA",
    qualityClass: "FAST",
    latencyClass: "LOW",
    costClass: "ECONOMY",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    features: ["system_instruction", "structured_output", "function_calling", "google_search", "grounding", "count_tokens"],
    locations: ["global", "us", "eu"],
  }),
  GEMINI_3_1_PRO_PREVIEW: model({
    id: "gemini-3.1-pro-preview",
    lifecycle: "PREVIEW",
    qualityClass: "ADVANCED",
    latencyClass: "QUALITY",
    costClass: "PREMIUM",
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    inputModalities: ["text", "image", "audio", "video"],
    outputModalities: ["text"],
    features: ["system_instruction", "structured_output", "function_calling", "google_search", "grounding", "code_execution", "count_tokens"],
    locations: ["global"],
    previewApprovalKey: "VERTEX_APPROVE_PREVIEW_REASONING",
  }),
  GEMINI_3_1_FLASH_IMAGE: model({
    id: "gemini-3.1-flash-image",
    lifecycle: "GA",
    qualityClass: "SPECIALIZED",
    latencyClass: "FAST",
    costClass: "BALANCED",
    contextWindow: 131_072,
    maxOutputTokens: 32_768,
    inputModalities: ["text", "image", "video"],
    outputModalities: ["text", "image"],
    features: ["system_instruction", "image_generation", "image_editing", "count_tokens"],
    locations: ["global", "us", "eu"],
  }),
  GEMINI_3_PRO_IMAGE: model({
    id: "gemini-3-pro-image",
    lifecycle: "GA",
    qualityClass: "SPECIALIZED",
    latencyClass: "QUALITY",
    costClass: "PREMIUM",
    contextWindow: 65_536,
    maxOutputTokens: 32_768,
    inputModalities: ["text", "image"],
    outputModalities: ["text", "image"],
    features: ["system_instruction", "image_generation", "image_editing"],
    locations: ["global"],
  }),
  GEMINI_3_1_FLASH_LITE_IMAGE: model({
    id: "gemini-3.1-flash-lite-image",
    lifecycle: "GA",
    qualityClass: "SPECIALIZED",
    latencyClass: "LOW",
    costClass: "ECONOMY",
    contextWindow: 65_536,
    maxOutputTokens: 4_096,
    inputModalities: ["text", "image", "video"],
    outputModalities: ["text", "image"],
    features: ["system_instruction", "image_generation", "image_editing", "count_tokens"],
    locations: ["global"],
  }),
  VEO_3_1: model({
    id: "veo-3.1-generate-001",
    lifecycle: "GA",
    qualityClass: "SPECIALIZED",
    latencyClass: "QUALITY",
    costClass: "PREMIUM",
    contextWindow: 0,
    maxOutputTokens: 0,
    inputModalities: ["text", "image", "video"],
    outputModalities: ["video", "audio"],
    features: ["video_generation", "native_audio"],
    locations: ["us-central1"],
  }),
  VEO_3_1_FAST: model({
    id: "veo-3.1-fast-generate-001",
    lifecycle: "GA",
    qualityClass: "SPECIALIZED",
    latencyClass: "FAST",
    costClass: "BALANCED",
    contextWindow: 0,
    maxOutputTokens: 0,
    inputModalities: ["text", "image", "video"],
    outputModalities: ["video", "audio"],
    features: ["video_generation", "native_audio"],
    locations: ["us-central1"],
  }),
  VEO_3_1_LITE_PREVIEW: model({
    id: "veo-3.1-lite-generate-001",
    lifecycle: "PREVIEW",
    qualityClass: "SPECIALIZED",
    latencyClass: "FAST",
    costClass: "ECONOMY",
    contextWindow: 0,
    maxOutputTokens: 0,
    inputModalities: ["text", "image", "video"],
    outputModalities: ["video", "audio"],
    features: ["video_generation", "native_audio"],
    locations: ["us-central1"],
    previewApprovalKey: "VERTEX_APPROVE_PREVIEW_VIDEO",
  }),
  LYRIA_3_PRO_PREVIEW: model({
    id: "lyria-3-pro-preview",
    lifecycle: "PREVIEW",
    qualityClass: "SPECIALIZED",
    latencyClass: "QUALITY",
    costClass: "PREMIUM",
    contextWindow: 0,
    maxOutputTokens: 0,
    inputModalities: ["text"],
    outputModalities: ["audio"],
    features: ["music_generation"],
    locations: ["global"],
    previewApprovalKey: "VERTEX_APPROVE_PREVIEW_AUDIO",
  }),
  LYRIA_3_CLIP_PREVIEW: model({
    id: "lyria-3-clip-preview",
    lifecycle: "PREVIEW",
    qualityClass: "SPECIALIZED",
    latencyClass: "FAST",
    costClass: "BALANCED",
    contextWindow: 0,
    maxOutputTokens: 0,
    inputModalities: ["text"],
    outputModalities: ["audio"],
    features: ["music_generation"],
    locations: ["global"],
    previewApprovalKey: "VERTEX_APPROVE_PREVIEW_AUDIO",
  }),
  GEMINI_LIVE_2_5_FLASH_NATIVE_AUDIO: model({
    id: "gemini-live-2.5-flash-native-audio",
    lifecycle: "GA",
    qualityClass: "SPECIALIZED",
    latencyClass: "REALTIME",
    costClass: "BALANCED",
    contextWindow: 0,
    maxOutputTokens: 0,
    inputModalities: ["text", "audio"],
    outputModalities: ["text", "audio"],
    features: ["live", "native_audio", "function_calling"],
    locations: ["global"],
  }),
  GEMINI_EMBEDDING_2: model({
    id: "gemini-embedding-2",
    lifecycle: "GA",
    qualityClass: "SPECIALIZED",
    latencyClass: "FAST",
    costClass: "BALANCED",
    contextWindow: 0,
    maxOutputTokens: 0,
    inputModalities: ["text"],
    outputModalities: ["embedding"],
    features: ["embedding"],
    locations: ["global", "us", "eu"],
  }),
  GEMINI_EMBEDDING_001: model({
    id: "gemini-embedding-001",
    lifecycle: "GA",
    qualityClass: "SPECIALIZED",
    latencyClass: "FAST",
    costClass: "BALANCED",
    contextWindow: 0,
    maxOutputTokens: 0,
    inputModalities: ["text"],
    outputModalities: ["embedding"],
    features: ["embedding"],
    locations: ["global", "us", "eu"],
  }),
});

const capability = (spec) => Object.freeze({
  provider: VERTEX_PROVIDER,
  enabled: true,
  secondary_model: null,
  tertiary_model: null,
  ...spec,
  required_modalities: Object.freeze([...(spec.required_modalities || ["text"])]),
  required_output_modalities: Object.freeze([...(spec.required_output_modalities || ["text"])]),
  required_features: Object.freeze([...(spec.required_features || [])]),
});

export const VERTEX_CAPABILITY_REGISTRY = Object.freeze({
  ORCHESTRATION: capability({ capability: "ORCHESTRATION", primary_model: "GEMINI_3_7_FLASH", secondary_model: "GEMINI_3_6_FLASH", tertiary_model: "GEMINI_3_1_PRO_PREVIEW", minimum_model_class: "ADVANCED", required_modalities: ["text"], required_features: ["system_instruction", "structured_output", "function_calling"], context_requirement: 131_072, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "GA_PRIMARY", reason_for_selection: "Stable high-quality agentic orchestration with structured control and tool support." }),
  GENERAL_REASONING: capability({ capability: "GENERAL_REASONING", primary_model: "GEMINI_3_7_FLASH", secondary_model: "GEMINI_3_6_FLASH", tertiary_model: "GEMINI_3_5_FLASH", minimum_model_class: "GENERAL", required_modalities: ["text"], required_features: ["system_instruction"], context_requirement: 65_536, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "GA_PRIMARY", reason_for_selection: "Stable general reasoning with a large context window and deterministic GA fallbacks." }),
  FAST_RESPONSE: capability({ capability: "FAST_RESPONSE", primary_model: "GEMINI_3_5_FLASH_LITE", secondary_model: "GEMINI_3_1_FLASH_LITE", tertiary_model: "GEMINI_3_7_FLASH", minimum_model_class: "FAST", required_modalities: ["text"], required_features: ["system_instruction", "structured_output"], context_requirement: 32_768, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "GA_PRIMARY", reason_for_selection: "GA low-latency routing and extraction model with a stable quality-preserving escape path." }),
  CODE: capability({ capability: "CODE", primary_model: "GEMINI_3_7_FLASH", secondary_model: "GEMINI_3_6_FLASH", tertiary_model: "GEMINI_3_1_PRO_PREVIEW", minimum_model_class: "ADVANCED", required_modalities: ["text"], required_features: ["system_instruction", "structured_output", "function_calling", "code_execution"], context_requirement: 131_072, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "GA_PRIMARY", reason_for_selection: "GA model optimized for coding and agentic technical workflows; preview only as explicitly approved tertiary escalation." }),
  SCRIBE: capability({ capability: "SCRIBE", primary_model: "GEMINI_3_7_FLASH", secondary_model: "GEMINI_3_6_FLASH", tertiary_model: "GEMINI_3_5_FLASH", minimum_model_class: "GENERAL", required_modalities: ["text"], required_features: ["system_instruction", "structured_output"], context_requirement: 131_072, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "GA_PRIMARY", reason_for_selection: "Stable long-context drafting, transformation, summarization, and document synthesis." }),
  OPTICS: capability({ capability: "OPTICS", primary_model: "GEMINI_3_7_FLASH", secondary_model: "GEMINI_3_6_FLASH", tertiary_model: "GEMINI_3_1_PRO_PREVIEW", minimum_model_class: "ADVANCED", required_modalities: ["text", "image"], required_features: ["system_instruction", "structured_output"], context_requirement: 65_536, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "GA_PRIMARY", reason_for_selection: "Stable multimodal understanding with image input and advanced reasoning; preview tertiary requires explicit approval." }),
  AUGMENT: capability({ capability: "AUGMENT", primary_model: "GEMINI_3_7_FLASH", secondary_model: "GEMINI_3_6_FLASH", tertiary_model: "GEMINI_3_5_FLASH", minimum_model_class: "ADVANCED", required_modalities: ["text", "image", "audio", "video"], required_features: ["system_instruction", "structured_output"], context_requirement: 65_536, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "GA_PRIMARY", reason_for_selection: "GA multimodal synthesis and transformation while preserving the full augmentation contract." }),
  INTERWEB: capability({ capability: "INTERWEB", primary_model: "GEMINI_3_7_FLASH", secondary_model: "GEMINI_3_6_FLASH", tertiary_model: "GEMINI_3_5_FLASH", minimum_model_class: "GENERAL", required_modalities: ["text"], required_features: ["system_instruction", "structured_output", "google_search", "grounding"], context_requirement: 65_536, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "GA_PRIMARY", reason_for_selection: "Reasoning over retrieval stays separate from retrieval itself while preserving grounded synthesis support." }),
  VOICE_TRANSCRIPTION: capability({ capability: "VOICE_TRANSCRIPTION", primary_model: "GEMINI_3_7_FLASH", secondary_model: "GEMINI_3_6_FLASH", tertiary_model: "GEMINI_3_5_FLASH", minimum_model_class: "GENERAL", required_modalities: ["text", "audio"], required_features: ["system_instruction"], context_requirement: 32_768, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "GA_PRIMARY", reason_for_selection: "Server-authoritative speech transcription stays on stable multimodal Gemini before any preview-specific transcriber is considered." }),
  IMAGE_GENERATION: capability({ capability: "IMAGE_GENERATION", primary_model: "GEMINI_3_1_FLASH_IMAGE", secondary_model: "GEMINI_3_PRO_IMAGE", tertiary_model: "GEMINI_3_1_FLASH_LITE_IMAGE", minimum_model_class: "SPECIALIZED", required_modalities: ["text"], required_output_modalities: ["image"], required_features: ["image_generation"], context_requirement: 32_768, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "GA_PRIMARY", reason_for_selection: "GA Gemini image generation with quality and latency preserving Google first-party fallbacks." }),
  VIDEO_GENERATION: capability({ capability: "VIDEO_GENERATION", primary_model: "VEO_3_1", secondary_model: "VEO_3_1_FAST", tertiary_model: "VEO_3_1_LITE_PREVIEW", minimum_model_class: "SPECIALIZED", required_modalities: ["text"], required_output_modalities: ["video"], required_features: ["video_generation"], context_requirement: 0, region_policy: "EXPLICIT_APPROVED_LOCATION", stability_class: "GA_PRIMARY", reason_for_selection: "GA Veo 3.1 primary; cost-oriented preview Lite is tertiary only when explicitly approved." }),
  AUDIO_GENERATION: capability({ capability: "AUDIO_GENERATION", primary_model: "LYRIA_3_PRO_PREVIEW", secondary_model: "LYRIA_3_CLIP_PREVIEW", minimum_model_class: "SPECIALIZED", required_modalities: ["text"], required_output_modalities: ["audio"], required_features: ["music_generation"], context_requirement: 0, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "PREVIEW_REQUIRED", preview_primary_approval_key: "VERTEX_APPROVE_PREVIEW_AUDIO", reason_for_selection: "Lyria 3 is preview-only; production execution fails closed unless the Master Architect preview approval is explicitly configured." }),
  LIVE: capability({ capability: "LIVE", primary_model: "GEMINI_LIVE_2_5_FLASH_NATIVE_AUDIO", minimum_model_class: "SPECIALIZED", required_modalities: ["text", "audio"], required_output_modalities: ["text", "audio"], required_features: ["live", "native_audio", "function_calling"], context_requirement: 0, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "GA_PRIMARY", reason_for_selection: "GA native-audio live conversation endpoint with function calling support." }),
  EMBEDDING: capability({ capability: "EMBEDDING", primary_model: "GEMINI_EMBEDDING_2", secondary_model: "GEMINI_EMBEDDING_001", minimum_model_class: "SPECIALIZED", required_modalities: ["text"], required_output_modalities: ["embedding"], required_features: ["embedding"], context_requirement: 0, region_policy: "CONFIGURED_LOCATION_ONLY", stability_class: "GA_PRIMARY", reason_for_selection: "Current Google embedding model with a stable Google Vertex fallback." }),
});

export const CAPABILITY_ALIASES = Object.freeze({
  jahorin: "GENERAL_REASONING", trismegistus: "ORCHESTRATION", tae: "ORCHESTRATION", ari: "ORCHESTRATION", orchestrator: "ORCHESTRATION", orchestration: "ORCHESTRATION",
  general_reasoning: "GENERAL_REASONING", conversation: "GENERAL_REASONING", chat: "GENERAL_REASONING",
  fast: "FAST_RESPONSE", fast_response: "FAST_RESPONSE", economy: "FAST_RESPONSE", classification: "FAST_RESPONSE", extraction: "FAST_RESPONSE",
  code: "CODE", ptah: "CODE", scribe: "SCRIBE", thoth: "SCRIBE", optics: "OPTICS", horus: "OPTICS", vision: "OPTICS",
  augment: "AUGMENT", hathor: "AUGMENT", syncori: "AUGMENT", interweb: "INTERWEB", wepwawet: "INTERWEB", search: "INTERWEB", research: "INTERWEB",
  image: "IMAGE_GENERATION", image_generation: "IMAGE_GENERATION", video: "VIDEO_GENERATION", video_generation: "VIDEO_GENERATION",
  audio: "AUDIO_GENERATION", music: "AUDIO_GENERATION", audio_generation: "AUDIO_GENERATION", live: "LIVE", voice: "LIVE", voice_transcription: "VOICE_TRANSCRIPTION", transcribe: "VOICE_TRANSCRIPTION", embedding: "EMBEDDING", embeddings: "EMBEDDING",
});

export function normalizeCapability(value = "GENERAL_REASONING") {
  const raw = String(value || "GENERAL_REASONING").trim();
  const upper = raw.toUpperCase();
  if (Object.hasOwn(VERTEX_CAPABILITY_REGISTRY, upper)) return upper;
  return CAPABILITY_ALIASES[raw.toLowerCase()] || "GENERAL_REASONING";
}

export function getCapabilityPolicy(value) {
  const key = normalizeCapability(value);
  const policy = VERTEX_CAPABILITY_REGISTRY[key];
  if (!policy) throw new Error(`Unknown Vertex capability ${key}`);
  return policy;
}

export function getModelDescriptor(key) {
  const modelSpec = VERTEX_MODEL_CATALOG[String(key || "")];
  if (!modelSpec) throw new Error(`Unknown Vertex model registry key ${key}`);
  return modelSpec;
}

export function primaryModelForCapability(value) {
  return getModelDescriptor(getCapabilityPolicy(value).primary_model).id;
}

export function modelChainForCapability(value) {
  const policy = getCapabilityPolicy(value);
  return [policy.primary_model, policy.secondary_model, policy.tertiary_model].filter(Boolean).map((key) => ({ key, ...getModelDescriptor(key) }));
}
