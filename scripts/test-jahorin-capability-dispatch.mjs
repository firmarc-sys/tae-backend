import test from "node:test";
import assert from "node:assert/strict";
import { executeJahorinCapability } from "../jahorin-capability-dispatch.js";

function providers(overrides = {}) {
  return {
    generateText: async (input) => ({ text: "provider-backed text", provider: "fake-test-provider", model: "fake-model", input }),
    generateImage: async () => ({ mimeType: "image/png", data: "dGVzdA==", provider: "fake-test-provider", model: "fake-image-model" }),
    generateVideo: async () => ({ video: { uri: "gs://test/video.mp4" }, provider: "fake-test-provider", model: "fake-video-model" }),
    generateAudio: async () => ({ mimeType: "audio/mpeg", data: "dGVzdA==", outputs: [], provider: "fake-test-provider", model: "fake-audio-model" }),
    ...overrides,
  };
}

test("Ptah uses the CODE model route and labels output as generation, not execution", async () => {
  let received;
  const result = await executeJahorinCapability({
    capability: "Ptah",
    operation: "generate",
    intent: "Write a safe hello-world function",
    providers: providers({ generateText: async (input) => { received = input; return { text: "function hello() {}", model: "fake" }; } }),
  });
  assert.equal(received.capability, "CODE");
  assert.match(received.systemInstruction, /Never claim that code was executed/);
  assert.equal(result.execution_kind, "model_generation");
  assert.equal(result.text, "function hello() {}");
});

test("Wepwawet requests grounded research", async () => {
  let received;
  await executeJahorinCapability({
    capability: "Interweb",
    intent: "Research current public documentation",
    providers: providers({ generateText: async (input) => { received = input; return { text: "summary" }; } }),
  });
  assert.equal(received.capability, "INTERWEB");
  assert.equal(received.groundWithSearch, true);
});

test("media capability calls its concrete provider adapter", async () => {
  const result = await executeJahorinCapability({
    capability: "media.image",
    intent: "Generate a test image",
    providers: providers(),
  });
  assert.equal(result.execution_kind, "provider_media_generation");
  assert.equal(result.asset.mime_type, "image/png");
  assert.equal(result.asset.data, "dGVzdA==");
});

test("document generation explicitly does not claim persistent storage", async () => {
  const result = await executeJahorinCapability({
    capability: "Thoth",
    intent: "Draft a project brief",
    providers: providers(),
  });
  assert.equal(result.persistence, "not_performed");
  assert.equal(result.execution_kind, "document_content_generation");
});

test("file, shell, device, email, calendar and deployment actions fail closed without adapters", async () => {
  for (const capability of ["files.manage", "compute.remote", "device.control", "communications.email", "communications.calendar", "cloud.deploy"]) {
    await assert.rejects(
      executeJahorinCapability({ capability, operation: "execute", intent: "Do the requested action", providers: providers() }),
      (error) => error.code === "CAPABILITY_ADAPTER_UNAVAILABLE" && error.status === 503,
      capability,
    );
  }
});

test("code test/build/deploy operations do not masquerade as generation", async () => {
  await assert.rejects(
    executeJahorinCapability({ capability: "software.code", operation: "test", intent: "Run the tests", providers: providers() }),
    (error) => error.code === "CAPABILITY_ADAPTER_UNAVAILABLE",
  );
});

test("Jahorin orchestration remains routed through the existing runtime", async () => {
  const result = await executeJahorinCapability({
    capability: "system.orchestrate",
    intent: "Coordinate a task",
    providers: providers(),
    legacyOrchestrate: async ({ intent }) => ({ accepted_by: "legacy-runtime", intent }),
  });
  assert.equal(result.accepted_by, "legacy-runtime");
});
