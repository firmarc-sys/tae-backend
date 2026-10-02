import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import cors from "cors";

const app = express();
const port = Number(process.env.TAE_API_PORT || 8081);
const serviceName = "tae-api";
const allowedOrigins = (process.env.TAE_API_ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
}));
app.use(express.json({ limit: "256kb", strict: true }));
app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || crypto.randomUUID();
  req.requestId = requestId;
  res.set("x-request-id", requestId);
  res.set("cache-control", "no-store");
  next();
});

app.get("/healthz", (_req, res) => res.status(200).json({ ok: true, service: serviceName }));
app.get("/readyz", (_req, res) => {
  // This service remains intentionally unready until identity, tenant repository,
  // audit sink and durable workflow adapters are implemented and configured.
  const configured = process.env.TAE_API_ENABLE_READY === "true"
    && Boolean(process.env.SUPABASE_URL)
    && Boolean(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY);
  if (!configured) return res.status(503).json({ ok: false, service: serviceName, ready: false, requestId: _req.requestId, reason: "adapters_not_configured" });
  return res.status(503).json({ ok: false, service: serviceName, ready: false, requestId: _req.requestId, reason: "identity_tenant_audit_and_workflow_adapters_not_implemented" });
});
app.all("/api/*", (req, res) => res.status(503).json({
  ok: false,
  error: { code: "TAE_API_NOT_IMPLEMENTED", message: "No production API routes are enabled on this service.", requestId: req.requestId, retryable: false },
}));
app.use((error, req, res, _next) => {
  const status = error?.message === "Origin not allowed" ? 403 : 400;
  res.status(status).json({ ok: false, error: { code: status === 403 ? "ORIGIN_DENIED" : "INVALID_REQUEST", message: status === 403 ? "Origin not allowed" : "Invalid request", requestId: req.requestId, retryable: false } });
});

if (process.env.NODE_ENV !== "test") app.listen(port, "0.0.0.0", () => {
  process.stdout.write(JSON.stringify({ level: "info", event: "service_started", service: serviceName, port }) + "\n");
});

export { app };