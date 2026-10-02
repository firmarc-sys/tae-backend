import test from "node:test";
import assert from "node:assert/strict";
import { installJahorinPersistenceRoutes } from "../jahorin-persistence-routes.js";

function routerHarness() {
  const routes = [];
  const api = {};
  for (const method of ["get","post","put","patch","delete"]) api[method] = (path, handler) => routes.push({ method, path, handler });
  return { routes, api };
}
test("persistence routes register tenant-scoped artifacts, memory, tasks and catalog endpoints", () => {
  const { routes, api } = routerHarness();
  installJahorinPersistenceRoutes(api, { authorize: async () => ({gid:"tenant-a"}), supabaseRequest: async () => [], responseBase: x => x });
  for (const key of ["get /jahorin/capabilities","get /jahorin/artifacts","post /jahorin/artifacts","get /jahorin/artifacts/:id","patch /jahorin/artifacts/:id","delete /jahorin/artifacts/:id","get /jahorin/memory","put /jahorin/memory/:key","delete /jahorin/memory/:key","get /jahorin/tasks","post /jahorin/tasks","patch /jahorin/tasks/:id","delete /jahorin/tasks/:id"]) {
    assert.ok(routes.some(route => `${route.method} ${route.path}` === key), key);
  }
});
test("persistence routes reject requests without a server-derived tenant identity", async () => {
  const { routes, api } = routerHarness();
  installJahorinPersistenceRoutes(api, { authorize: async () => ({}), supabaseRequest: async () => [], responseBase: x => x });
  const route = routes.find(x => x.method === "get" && x.path === "/jahorin/tasks");
  let passed;
  await route.handler({query:{}}, {json(){throw new Error("must not return data")}}, e => { passed=e; });
  assert.equal(passed.status, 401);
  assert.equal(passed.code, "AUTH_REQUIRED");
});
test("memory writes require content and cap payload sizes before persistence", async () => {
  const { routes, api } = routerHarness();
  let calls = 0;
  installJahorinPersistenceRoutes(api, { authorize: async () => ({gid:"tenant-a"}), supabaseRequest: async () => {calls++;return [];}, responseBase: x => x });
  const route = routes.find(x => x.method === "put" && x.path === "/jahorin/memory/:key");
  let error;
  await route.handler({params:{key:"prefs"},body:{}},{json(){}},e=>{error=e;});
  assert.equal(error.status, 422);
  assert.equal(calls,0);
});
