import test from "node:test";
import assert from "node:assert/strict";
import { installJahorinRuntimeRoutes } from "../jahorin-runtime.js";

function setup({ authorize = async () => ({ gid: "gid-user-1" }), rows = [] } = {}) {
  const routes = new Map();
  const calls = [];
  const api = {
    get(path, handler) { routes.set(`GET ${path}`, handler); },
    post(path, handler) { routes.set(`POST ${path}`, handler); },
  };
  installJahorinRuntimeRoutes(api, {
    authorize,
    supabaseRequest: async (path, options) => {
      calls.push({ path, options });
      return rows;
    },
    execute: async () => ({}),
    responseBase: (extra = {}) => ({ ok: true, ...extra }),
  });
  return { routes, calls };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("execution list is scoped to the authenticated GID and bounds the limit", async () => {
  const { routes, calls } = setup({ rows: [{ id: "exec-1", gid: "gid-user-1", state: "completed" }] });
  const res = response();
  let forwardedError;
  await routes.get("GET /runtime/executions")(
    { query: { limit: "999", state: "completed" } },
    res,
    (error) => { forwardedError = error; },
  );

  assert.equal(forwardedError, undefined);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.executions[0].gid, "gid-user-1");
  assert.equal(res.payload.pagination.limit, 100);
  assert.match(calls[0].path, /gid=eq.gid-user-1/);
  assert.match(calls[0].path, /state=eq.completed/);
  assert.match(calls[0].path, /limit=100/);
});

test("execution list rejects unknown states", async () => {
  const { routes, calls } = setup();
  const res = response();
  let forwardedError;
  await routes.get("GET /runtime/executions")(
    { query: { state: "pretend-success" } },
    res,
    (error) => { forwardedError = error; },
  );

  assert.equal(forwardedError?.status, 400);
  assert.equal(forwardedError?.code, "INVALID_EXECUTION_STATE");
  assert.equal(calls.length, 0);
});

test("execution list rejects unauthenticated principals", async () => {
  const { routes, calls } = setup({ authorize: async () => ({ kind: "public" }) });
  const res = response();
  let forwardedError;
  await routes.get("GET /runtime/executions")(
    { query: {} },
    res,
    (error) => { forwardedError = error; },
  );

  assert.equal(forwardedError?.status, 401);
  assert.equal(forwardedError?.code, "AUTH_REQUIRED");
  assert.equal(calls.length, 0);
});
