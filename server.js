import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { GoogleGenAI } from "@google/genai";

const app = express();
const port = Number(process.env.PORT || 8080);

const OWNER_GID = process.env.SIOS_OWNER_GID || "399152573423";
const OWNER_MODE = "Prime Orchestrator";
const SESSION_COOKIE = "ari_session";
const DEMO_PHRASE = "TAE, enter Demo Mode";
const CANONICAL_LINE = "This is not an app. This is me.";

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const geminiModel = process.env.GEMINI_MODEL || process.env.GEMINI_DEFAULT_MODEL || "gemini-2.5-flash";
const vertexProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || process.env.VERTEX_PROJECT || "689058655022";
const vertexLocation = process.env.VERTEX_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "global";
const sessionSecret = process.env.ARI_SESSION_SECRET || "";
const ownerAccessCode = process.env.OWNER_ACCESS_CODE || "";
const authRequired = /^(1|true|yes|on)$/i.test(process.env.ARI_REQUIRE_AUTH || "false");

const defaultOrigins = [
  "https://jahorin-mercury.netlify.app",
  "https://siaas.space",
  "https://www.siaas.space",
  "https://myaihome.space",
  "http://localhost:5173",
];
const allowedOrigins = (process.env.ALLOWED_ORIGINS || defaultOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const provider = geminiApiKey ? "google-gemini-api" : vertexProject ? "google-vertex-ai" : "unconfigured";
const ai = geminiApiKey
  ? new GoogleGenAI({ apiKey: geminiApiKey })
  : vertexProject
    ? new GoogleGenAI({ vertexai: true, project: vertexProject, location: vertexLocation })
    : null;

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: "10mb" }));
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed"));
    },
  }),
);

app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || crypto.randomUUID();
  req.requestId = requestId;
  res.set("x-request-id", requestId);
  res.set("x-runtime", "ARI");
  if (req.path.startsWith("/api/")) res.set("cache-control", "no-store");
  next();
});

function responseBase(extra = {}) {
  return {
    ok: true,
    gid: OWNER_GID,
    mode: OWNER_MODE,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [decodeURIComponent(part), ""]
          : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signSession(gid, expires) {
  if (!sessionSecret) {
    const error = new Error("ARI session security is not configured");
    error.status = 503;
    throw error;
  }
  const payload = `${gid}.${expires}`;
  const signature = crypto.createHmac("sha256", sessionSecret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function sessionGid(req) {
  if (!sessionSecret) return null;
  const token = parseCookies(req.get("cookie") || "")[SESSION_COOKIE];
  if (!token) return null;
  const [gid, expiresRaw, signature] = token.split(".", 3);
  const expires = Number(expiresRaw);
  if (!gid || !Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000) || !signature) return null;
  const expected = crypto.createHmac("sha256", sessionSecret).update(`${gid}.${expires}`).digest("hex");
  return timingSafeEqualText(signature, expected) ? gid : null;
}

function requireProviderAccess(req) {
  if (authRequired && sessionGid(req) !== OWNER_GID) {
    const error = new Error("Authenticated ARI session required");
    error.status = 401;
    throw error;
  }
}

function renderState(state = "idle") {
  return {
    ok: true,
    runtime: "Mercury",
    state,
    alive: true,
    gid: OWNER_GID,
    mode: OWNER_MODE,
    timestamp_ms: Date.now(),
  };
}

function requireProvider() {
  if (!ai) {
    const error = new Error("Google provider is not configured on the ARI service.");
    error.status = 503;
    throw error;
  }
  return ai;
}

async function generateWithGoogle({ prompt, systemInstruction, temperature = 0.7 }) {
  const client = requireProvider();
  const response = await client.models.generateContent({
    model: geminiModel,
    contents: prompt,
    config: {
      systemInstruction,
      temperature: Math.max(0, Math.min(2, Number(temperature) || 0.7)),
      maxOutputTokens: 4096,
    },
  });

  const text = String(response.text || "").trim();
  if (!text) {
    const error = new Error("Google provider returned no generated text.");
    error.status = 502;
    throw error;
  }

  return {
    text,
    model: geminiModel,
    provider,
    tokens: response.usageMetadata?.totalTokenCount ?? null,
    usage: response.usageMetadata || null,
  };
}

const api = express.Router();

api.get("/health", (_req, res) => {
  res.json(
    responseBase({
      service: "ARI",
      runtime: "Mercury",
      status: "healthy",
      provider,
    }),
  );
});

api.get("/ready", (_req, res) => {
  const providerConfigured = Boolean(ai);
  const authConfigured = Boolean(sessionSecret && ownerAccessCode);
  const authReady = !authRequired || authConfigured;
  const ready = providerConfigured && authReady;
  res.status(ready ? 200 : 503).json(
    responseBase({
      ok: ready,
      service: "ARI",
      runtime: "Mercury",
      provider,
      provider_configured: providerConfigured,
      model: geminiModel,
      vertex_project: provider === "google-vertex-ai" ? vertexProject : null,
      vertex_location: provider === "google-vertex-ai" ? vertexLocation : null,
      auth_required: authRequired,
      auth_configured: authConfigured,
    }),
  );
});

api.get("/identity", (req, res) => {
  const gid = sessionGid(req);
  const authenticated = gid === OWNER_GID;
  res.json(
    responseBase({
      authenticated,
      identity_scope: authenticated ? "prime" : "display",
      clearance: authenticated ? OWNER_MODE : "public",
    }),
  );
});

api.post("/identity", (req, res) => {
  const gid = sessionGid(req);
  const authenticated = gid === OWNER_GID;
  res.json(
    responseBase({
      authenticated,
      identity: {
        gid: authenticated ? OWNER_GID : null,
        verified: authenticated,
        clearance: authenticated ? OWNER_MODE : "public",
      },
    }),
  );
});

api.post("/identity/session", (req, res, next) => {
  try {
    if (!ownerAccessCode || !sessionSecret) {
      const error = new Error("ARI session security is not configured");
      error.status = 503;
      throw error;
    }
    const supplied = String(req.body?.access_code || "");
    if (!timingSafeEqualText(supplied, ownerAccessCode)) {
      const error = new Error("Invalid access code");
      error.status = 401;
      throw error;
    }
    const expires = Math.floor(Date.now() / 1000) + Number(process.env.ARI_SESSION_TTL_SECONDS || 43200);
    const token = signSession(OWNER_GID, expires);
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.max(60, expires - Math.floor(Date.now() / 1000))}; HttpOnly; Secure; SameSite=Strict`,
    );
    res.json(responseBase({ authenticated: true, expires }));
  } catch (error) {
    next(error);
  }
});

api.delete("/identity/session", (_req, res) => {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
  res.json(responseBase({ authenticated: false }));
});

api.get("/render-state", (_req, res) => {
  res.json(renderState());
});

api.post("/render-state", (req, res) => {
  res.json(renderState(String(req.body?.state || req.body?.renderState || "active")));
});

api.get("/iot", (_req, res) => {
  res.json(responseBase({ capability: "iot", status: "online", devices: [] }));
});

api.post("/iot", (req, res) => {
  res.json(responseBase({ capability: "iot", accepted: true, payload: req.body || {} }));
});

api.get("/syncori", (_req, res) => {
  res.json(responseBase({ capability: "syncori", status: "online", engine: "SYNCORI Infinite Audio" }));
});

api.post("/syncori", (req, res) => {
  res.json(responseBase({ capability: "syncori", accepted: true, state: req.body || {} }));
});

api.get("/tae", (_req, res) => {
  res.json(responseBase({ engine: "TAE", activation: DEMO_PHRASE }));
});

api.post("/tae", async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || req.body?.command || "").trim();
    if (!prompt) return res.status(422).json({ ok: false, error: "prompt is required", request_id: req.requestId });

    if (prompt.replace(/\.$/, "").toLowerCase() === DEMO_PHRASE.toLowerCase()) {
      return res.json(
        responseBase({
          request_id: req.body?.request_id || req.requestId,
          demo: true,
          message: CANONICAL_LINE,
          render_state: renderState("generate"),
          reply: { kind: "prose", text: CANONICAL_LINE, tokens: 0 },
        }),
      );
    }

    requireProviderAccess(req);
    const result = await generateWithGoogle({
      prompt,
      systemInstruction:
        "You are TAE, the Timeline Augmentation and orchestration intelligence inside Agentic Mercury Time Runner. Coordinate the user request clearly and return useful production-grade results.",
      temperature: req.body?.temperature,
    });

    res.json(
      responseBase({
        request_id: req.body?.request_id || req.requestId,
        reply: { kind: "prose", text: result.text, tokens: result.tokens },
        provider: { name: result.provider, model: result.model },
      }),
    );
  } catch (error) {
    next(error);
  }
});

api.post("/runtime", async (req, res, next) => {
  try {
    const capability = String(req.body?.capability || "text").trim().toLowerCase();
    const intent = String(req.body?.intent || req.body?.payload?.prompt || "").trim();
    const requestId = req.body?.request_id || req.requestId;

    if (["render", "render-state", "state"].includes(capability)) {
      return res.json(responseBase({ request_id: requestId, result: renderState("active") }));
    }
    if (capability === "identity") {
      const authenticated = sessionGid(req) === OWNER_GID;
      return res.json(responseBase({ request_id: requestId, result: { gid: OWNER_GID, mode: OWNER_MODE, authenticated } }));
    }
    if (capability === "syncori") {
      return res.json(responseBase({ request_id: requestId, result: { status: "online", engine: "SYNCORI Infinite Audio" } }));
    }
    if (capability === "iot") {
      return res.json(responseBase({ request_id: requestId, result: { status: "online", devices: [] } }));
    }
    if (["tae", "demo"].includes(capability) && intent.replace(/\.$/, "").toLowerCase() === DEMO_PHRASE.toLowerCase()) {
      return res.json(
        responseBase({
          request_id: requestId,
          result: { demo: true, message: CANONICAL_LINE, render_state: renderState("generate") },
        }),
      );
    }
    if (["text", "reasoning", "code", "documents", "scribe", "interweb", "vision", "multimodal", "tae"].includes(capability)) {
      if (!intent) return res.status(422).json({ ok: false, error: "intent or payload.prompt is required", request_id: requestId });
      requireProviderAccess(req);
      const result = await generateWithGoogle({
        prompt: intent,
        systemInstruction:
          "You are Jahorin, the user-facing intelligence inside Agentic Mercury Time Runner. Respond directly to the user's intent and use the active capability as an instrument.",
        temperature: req.body?.payload?.temperature,
      });
      return res.json(
        responseBase({
          request_id: requestId,
          result: { text: result.text, model: result.model, provider: result.provider, tokens: result.tokens },
          provider: { name: result.provider, model: result.model },
        }),
      );
    }

    return res.status(400).json({ ok: false, error: `Unsupported capability: ${capability}`, request_id: requestId });
  } catch (error) {
    next(error);
  }
});

api.post("/generate", async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) return res.status(400).json({ ok: false, error: "prompt is required", request_id: req.requestId });
    if (prompt.length > 20000) return res.status(413).json({ ok: false, error: "prompt is too long", request_id: req.requestId });
    requireProviderAccess(req);
    const result = await generateWithGoogle({
      prompt,
      systemInstruction:
        String(req.body?.systemInstruction || "").trim() ||
        "You are Jahorin inside Agentic Mercury Time Runner. Produce useful, original, polished content that directly fulfills the user's request.",
      temperature: req.body?.temperature,
    });
    res.json(responseBase({ type: String(req.body?.type || "text"), output: result.text, model: result.model, provider: result.provider, usage: result.usage }));
  } catch (error) {
    next(error);
  }
});

app.get("/", (_req, res) => {
  res.json(responseBase({ service: "ARI", runtime: "Mercury", status: "online", provider }));
});

app.use("/api", api);
app.use("/", api);

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = Number(error.status) || 500;
  res.status(status).json({
    ok: false,
    error: error.message || "Unexpected ARI error",
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`ARI gateway listening on ${port}`);
});
