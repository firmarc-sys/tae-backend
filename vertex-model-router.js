import { GoogleGenAI } from "@google/genai";

export const VERTEX_PROVIDER = "google-vertex-ai";

const env = (name, fallback) => String(process.env[name] || fallback).trim();

export const VERTEX_MODELS = Object.freeze({
  ORCHESTRATOR: Object.freeze([
    { id: env("VERTEX_ORCHESTRATOR_MODEL", "gemini-3.1-pro-preview"), lifecycle: "PREVIEW" },
    { id: env("VERTEX_ORCHESTRATOR_FALLBACK", "gemini-3-flash-preview"), lifecycle: "PREVIEW" },
    { id: env("VERTEX_ORCHESTRATOR_STABLE_FALLBACK", "gemini-3.7-flash"), lifecycle: "GA" },
  ]),
  FAST: Object.freeze([
    { id: env("VERTEX_FAST_MODEL", "gemini-3-flash-preview"), lifecycle: "PREVIEW" },
    { id: env("VERTEX_FAST_FALLBACK", "gemini-3.7-flash"), lifecycle: "GA" },
  ]),
  ECONOMY: Object.freeze([
    { id: env("VERTEX_ECONOMY_MODEL", "gemini-3.1-flash-lite"), lifecycle: "PREVIEW" },
    { id: env("VERTEX_ECONOMY_FALLBACK", "gemini-3.5-flash-lite"), lifecycle: "GA" },
  ]),
  VISION: Object.freeze([
    { id: env("VERTEX_VISION_MODEL", "gemini-3.1-pro-preview"), lifecycle: "PREVIEW" },
    { id: env("VERTEX_VISION_FALLBACK", "gemini-3-flash-preview"), lifecycle: "PREVIEW" },
    { id: env("VERTEX_VISION_STABLE_FALLBACK", "gemini-3.7-flash"), lifecycle: "GA" },
  ]),
  IMAGE: Object.freeze([
    { id: env("VERTEX_IMAGE_MODEL", "gemini-3.1-flash-image"), lifecycle: "PREVIEW" },
  ]),
  VIDEO: Object.freeze([
    { id: env("VERTEX_VIDEO_MODEL", "veo-3.1-lite-generate-001"), lifecycle: "PREVIEW", location: "us-central1" },
    { id: env("VERTEX_VIDEO_FALLBACK", "veo-3.1-fast-generate-001"), lifecycle: "GA", location: "us-central1" },
    { id: env("VERTEX_VIDEO_QUALITY_FALLBACK", "veo-3.1-generate-001"), lifecycle: "GA", location: "us-central1" },
  ]),
  AUDIO: Object.freeze([
    { id: env("VERTEX_AUDIO_MODEL", "lyria-3-pro-preview"), lifecycle: "PREVIEW", location: "global" },
    { id: env("VERTEX_AUDIO_FALLBACK", "lyria-3-clip-preview"), lifecycle: "PREVIEW", location: "global" },
  ]),
  LIVE: Object.freeze([
    { id: env("VERTEX_LIVE_MODEL", "gemini-live-2.5-flash-native-audio"), lifecycle: "GA" },
  ]),
  EMBEDDING: Object.freeze([
    { id: env("VERTEX_EMBEDDING_MODEL", "gemini-embedding-2"), lifecycle: "GA" },
    { id: env("VERTEX_EMBEDDING_FALLBACK", "gemini-embedding-001"), lifecycle: "GA" },
  ]),
});

function uniqueModels(entries = []) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry?.id || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function providerUnavailable(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.error?.status || "");
  const message = String(error?.message || error || "");
  return [400, 403, 404, 412].includes(status)
    || /NOT_FOUND|PERMISSION_DENIED|FAILED_PRECONDITION|model.+(?:unavailable|not found|unsupported)|endpoint.+(?:unavailable|not found)/i.test(`${code} ${message}`);
}

function quotaLimited(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  return status === 429 || /429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(String(error?.message || error || ""));
}

function makeError(message, code, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

export function modelClassForCapability(capability = "", { image = false, deepSearch = false } = {}) {
  if (image) return "VISION";
  const value = String(capability || "").trim().toLowerCase();
  if (["interweb", "wepwawet", "search", "research"].includes(value) || deepSearch) return "FAST";
  if (["code", "ptah", "jahorin", "tae", "orchestrator", "trismegistus"].includes(value)) return "ORCHESTRATOR";
  if (["optics", "horus", "vision"].includes(value)) return "VISION";
  if (["economy", "background", "classification"].includes(value)) return "ECONOMY";
  return "FAST";
}

export class VertexModelRouter {
  constructor({ project, location = "global" } = {}) {
    this.project = String(project || "").trim();
    this.location = String(location || "global").trim() || "global";
    if (!this.project) throw makeError("GOOGLE_CLOUD_PROJECT is required for Vertex AI", "VERTEX_PROJECT_REQUIRED");
    this.clients = new Map();
    this.token = null;
  }

  client(location = this.location) {
    const resolved = String(location || this.location).trim() || this.location;
    if (!this.clients.has(resolved)) {
      this.clients.set(resolved, new GoogleGenAI({ vertexai: true, project: this.project, location: resolved }));
    }
    return this.clients.get(resolved);
  }

  models(modelClass) {
    const key = String(modelClass || "FAST").toUpperCase();
    const entries = VERTEX_MODELS[key];
    if (!entries) throw makeError(`Unknown Vertex model class ${key}`, "VERTEX_MODEL_CLASS_UNKNOWN");
    return uniqueModels(entries);
  }

  async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw makeError(`Cloud Run ADC token request failed with HTTP ${response.status}`, "VERTEX_ADC_UNAVAILABLE");
    const payload = await response.json();
    if (!payload?.access_token) throw makeError("Cloud Run ADC returned no access token", "VERTEX_ADC_EMPTY");
    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 300)) * 1000,
    };
    return this.token.value;
  }

  async generateContent({ modelClass = "FAST", contents, config = {} } = {}) {
    const attempted = [];
    let lastError = null;
    for (const entry of this.models(modelClass)) {
      attempted.push(entry.id);
      try {
        const response = await this.client(entry.location).models.generateContent({ model: entry.id, contents, config });
        return {
          response,
          provider: VERTEX_PROVIDER,
          model: entry.id,
          lifecycle: entry.lifecycle,
          modelClass: String(modelClass).toUpperCase(),
          fallbackUsed: attempted.length > 1,
          attempted,
          location: entry.location || this.location,
        };
      } catch (error) {
        lastError = error;
        if (quotaLimited(error)) throw error;
        if (!providerUnavailable(error)) throw error;
      }
    }
    const error = makeError(`No accessible Google Vertex model remained for ${modelClass}`, "VERTEX_MODELS_UNAVAILABLE", lastError);
    error.attemptedModels = attempted;
    throw error;
  }

  async generateImage({ prompt, systemInstruction = "Generate the requested image faithfully." } = {}) {
    const entry = this.models("IMAGE")[0];
    const response = await this.client(entry.location).models.generateContent({
      model: entry.id,
      contents: String(prompt || "").trim(),
      config: { systemInstruction, responseModalities: ["TEXT", "IMAGE"] },
    });
    const parts = response?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part?.inlineData?.data);
    if (!imagePart?.inlineData?.data) throw makeError("Vertex image model returned no image payload", "VERTEX_IMAGE_EMPTY");
    return {
      provider: VERTEX_PROVIDER,
      model: entry.id,
      lifecycle: entry.lifecycle,
      modelClass: "IMAGE",
      location: entry.location || this.location,
      mimeType: imagePart.inlineData.mimeType || "image/png",
      data: imagePart.inlineData.data,
      text: parts.map((part) => part?.text || "").join("").trim(),
    };
  }

  async generateVideo({ prompt, aspectRatio = "16:9", durationSeconds = 8 } = {}) {
    let lastError = null;
    const attempted = [];
    for (const entry of this.models("VIDEO")) {
      attempted.push(entry.id);
      try {
        const client = this.client(entry.location || "us-central1");
        let operation = await client.models.generateVideos({
          model: entry.id,
          source: { prompt: String(prompt || "").trim() },
          config: {
            numberOfVideos: 1,
            aspectRatio,
            durationSeconds,
            generateAudio: true,
          },
        });
        const deadline = Date.now() + 240000;
        while (!operation.done && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          operation = await client.operations.getVideosOperation({ operation });
        }
        if (!operation.done) throw makeError("Vertex video generation did not complete before the ARI deadline", "VERTEX_VIDEO_TIMEOUT");
        const video = operation.response?.generatedVideos?.[0]?.video || null;
        if (!video?.uri && !video?.videoBytes) throw makeError("Vertex video model returned no video asset", "VERTEX_VIDEO_EMPTY");
        return {
          provider: VERTEX_PROVIDER,
          model: entry.id,
          lifecycle: entry.lifecycle,
          modelClass: "VIDEO",
          location: entry.location || "us-central1",
          fallbackUsed: attempted.length > 1,
          attempted,
          video,
        };
      } catch (error) {
        lastError = error;
        if (quotaLimited(error)) throw error;
        if (!providerUnavailable(error)) throw error;
      }
    }
    const error = makeError("No accessible Google Vertex video model remained", "VERTEX_VIDEO_UNAVAILABLE", lastError);
    error.attemptedModels = attempted;
    throw error;
  }

  async generateAudio({ prompt } = {}) {
    let lastError = null;
    const attempted = [];
    const token = await this.accessToken();
    for (const entry of this.models("AUDIO")) {
      attempted.push(entry.id);
      try {
        const response = await fetch(`https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(this.project)}/locations/global/interactions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            model: entry.id,
            input: [{ type: "text", text: String(prompt || "").trim() }],
          }),
          signal: AbortSignal.timeout(240000),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = makeError(payload?.error?.message || `Vertex Lyria HTTP ${response.status}`, payload?.error?.status || "VERTEX_AUDIO_ERROR");
          error.status = response.status;
          throw error;
        }
        const output = Array.isArray(payload?.outputs) ? payload.outputs.find((item) => item?.type === "audio" && item?.data) : null;
        if (!output?.data) throw makeError("Vertex Lyria returned no audio payload", "VERTEX_AUDIO_EMPTY");
        return {
          provider: VERTEX_PROVIDER,
          model: payload?.model || entry.id,
          lifecycle: entry.lifecycle,
          modelClass: "AUDIO",
          location: "global",
          fallbackUsed: attempted.length > 1,
          attempted,
          mimeType: output.mime_type || "audio/mpeg",
          data: output.data,
          outputs: payload.outputs,
        };
      } catch (error) {
        lastError = error;
        if (quotaLimited(error)) throw error;
        if (!providerUnavailable(error)) throw error;
      }
    }
    const error = makeError("No accessible Google Vertex Lyria model remained", "VERTEX_AUDIO_UNAVAILABLE", lastError);
    error.attemptedModels = attempted;
    throw error;
  }

  async embed({ content } = {}) {
    let lastError = null;
    const attempted = [];
    for (const entry of this.models("EMBEDDING")) {
      attempted.push(entry.id);
      try {
        const response = await this.client(entry.location).models.embedContent({ model: entry.id, contents: String(content || "") });
        return {
          provider: VERTEX_PROVIDER,
          model: entry.id,
          lifecycle: entry.lifecycle,
          modelClass: "EMBEDDING",
          location: entry.location || this.location,
          fallbackUsed: attempted.length > 1,
          attempted,
          embeddings: response.embeddings || [],
        };
      } catch (error) {
        lastError = error;
        if (quotaLimited(error)) throw error;
        if (!providerUnavailable(error)) throw error;
      }
    }
    const error = makeError("No accessible Google Vertex embedding model remained", "VERTEX_EMBEDDING_UNAVAILABLE", lastError);
    error.attemptedModels = attempted;
    throw error;
  }

  manifest() {
    return Object.fromEntries(Object.entries(VERTEX_MODELS).map(([key, values]) => [key, uniqueModels(values)]));
  }
}
