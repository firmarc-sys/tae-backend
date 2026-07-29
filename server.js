import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();
const port = Number(process.env.PORT || 10000);
const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
const googleModel = process.env.GOOGLE_MODEL || "gemini-2.5-flash";
const ownerGid = process.env.SIOS_OWNER_GID || "399152573423";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed"));
    },
  }),
);

function responseBase(extra = {}) {
  return {
    ok: true,
    gid: ownerGid,
    mode: "Prime Orchestrator",
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

async function generateWithGemini({ prompt, systemInstruction, temperature = 0.8 }) {
  if (!googleApiKey) {
    const error = new Error("GOOGLE_API_KEY is not configured on the backend deployment.");
    error.status = 503;
    throw error;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(googleModel)}:generateContent?key=${encodeURIComponent(googleApiKey)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: Math.max(0, Math.min(2, Number(temperature) || 0.8)),
      maxOutputTokens: 4096,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Google AI request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part?.text || "")
    .join("")
    .trim();

  if (!text) {
    const error = new Error("Google AI returned no generated text.");
    error.status = 502;
    throw error;
  }

  return { text, model: googleModel, usage: data.usageMetadata || null };
}

app.get("/", (_req, res) => {
  res.json(responseBase({ service: "TAE Backend", status: "online" }));
});

app.get("/health", (_req, res) => {
  res.json(responseBase({
    service: "TAE Backend",
    status: "healthy",
    googleConfigured: Boolean(googleApiKey),
    model: googleModel,
  }));
});

app.post("/api/generate", async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) return res.status(400).json({ ok: false, error: "prompt is required" });
    if (prompt.length > 20000) return res.status(413).json({ ok: false, error: "prompt is too long" });

    const result = await generateWithGemini({
      prompt,
      systemInstruction:
        String(req.body?.systemInstruction || "").trim() ||
        "You are TAE, the creative planning and generation intelligence inside Agentic OS. Produce useful, original, polished content that directly fulfills the user's request.",
      temperature: req.body?.temperature,
    });

    res.json(responseBase({
      type: String(req.body?.type || "text"),
      output: result.text,
      model: result.model,
      usage: result.usage,
    }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/tae", async (req, res, next) => {
  try {
    const command = String(req.body?.command || req.body?.prompt || "").trim();
    if (!command) return res.status(400).json({ ok: false, error: "command is required" });

    if (command.toLowerCase() === "tae, enter demo mode") {
      return res.json(responseBase({
        intent: "enter_demo_mode",
        message: "This is not an app. This is me.",
        renderState: "generate",
        uiInstruction: "full_ui_render",
      }));
    }

    const result = await generateWithGemini({
      prompt: command,
      systemInstruction:
        "You are TAE, the planning and orchestration agent for Agentic OS. Respond with a direct, helpful answer and produce creative content when requested.",
      temperature: req.body?.temperature,
    });

    res.json(responseBase({
      intent: "creative_generation",
      message: result.text,
      output: result.text,
      model: result.model,
      renderState: "active",
    }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/render-state", (req, res) => {
  res.json(responseBase({ renderState: req.body?.renderState || "active" }));
});

app.post("/api/identity", (req, res) => {
  res.json(responseBase({ identity: { gid: req.body?.gid || ownerGid, verified: true } }));
});

app.post("/api/iot", (_req, res) => {
  res.json(responseBase({ devices: [], status: "available" }));
});

app.post("/api/syncori", (req, res) => {
  res.json(responseBase({ status: "ready", request: req.body || {} }));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(Number(error.status) || 500).json({
    ok: false,
    error: error.message || "Unexpected backend error",
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`TAE backend listening on ${port}`);
});
