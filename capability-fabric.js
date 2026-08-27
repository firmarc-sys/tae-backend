import crypto from "node:crypto";

const SCHEMA_VERSION = 1;

const BASE_CAPABILITIES = Object.freeze([
  {
    id: "system.orchestrate",
    domain: "intelligence",
    description: "Understand a human goal, discover available capabilities, compose them into an execution graph, and delegate work.",
    operations: ["plan", "compose", "delegate", "verify"],
    execution_methods: ["orchestrator"],
    side_effect: false,
    bindings: { system_authority: true },
    manifestation: { form: "object", objects: ["progress", "result"] },
  },
  {
    id: "software.code",
    domain: "software",
    description: "Create, inspect, edit, debug, test, build, package, and deploy software.",
    operations: ["generate", "inspect", "edit", "debug", "test", "build", "package", "deploy"],
    execution_methods: ["provider-route", "device"],
    side_effect: true,
    bindings: { provider_capabilities: ["code"], device_capabilities: ["shell", "local_apps", "remote_compute"] },
    manifestation: { form: "workspace", objects: ["progress", "editor", "result", "confirm"] },
  },
  {
    id: "web.research",
    domain: "web",
    description: "Search, browse, retrieve, compare, verify, and synthesize current web information.",
    operations: ["search", "browse", "retrieve", "compare", "verify", "research", "deep-search"],
    execution_methods: ["provider-route", "connector"],
    side_effect: false,
    bindings: { provider_capabilities: ["interweb", "wepwawet"] },
    manifestation: { form: "workspace", objects: ["progress", "sources", "result"] },
  },
  {
    id: "files.manage",
    domain: "files",
    description: "Read, create, edit, organize, convert, compress, extract, upload, download, and publish files.",
    operations: ["read", "create", "edit", "organize", "convert", "compress", "extract", "upload", "download", "publish"],
    execution_methods: ["device", "connector"],
    side_effect: true,
    bindings: { device_capabilities: ["files", "storage"] },
    manifestation: { form: "workspace", objects: ["upload", "editor", "result", "confirm"] },
  },
  {
    id: "data.analyze",
    domain: "data",
    description: "Query, transform, analyze, visualize, and extract structured information from data.",
    operations: ["query", "transform", "analyze", "visualize", "extract", "compare"],
    execution_methods: ["provider-route", "device", "connector"],
    side_effect: false,
    bindings: { provider_capabilities: ["code", "scribe"], device_capabilities: ["files", "storage", "remote_compute"] },
    manifestation: { form: "workspace", objects: ["upload", "progress", "editor", "result"] },
  },
  {
    id: "media.image",
    domain: "media",
    description: "Generate, edit, inspect, transform, and analyze images and graphics.",
    operations: ["generate", "edit", "analyze", "transform", "upscale"],
    execution_methods: ["provider-route", "device"],
    side_effect: false,
    bindings: { provider_capabilities: ["augment", "optics", "horus"] },
    manifestation: { form: "object", objects: ["upload", "camera", "progress", "result", "editor"] },
  },
  {
    id: "media.video",
    domain: "media",
    description: "Generate, edit, inspect, transform, and play video and animation.",
    operations: ["generate", "edit", "analyze", "transform", "render", "play"],
    execution_methods: ["provider-route", "device"],
    side_effect: false,
    bindings: { provider_capabilities: ["augment", "optics", "horus"] },
    manifestation: { form: "workspace", objects: ["upload", "progress", "player", "editor", "result"] },
  },
  {
    id: "media.audio",
    domain: "media",
    description: "Generate, record, edit, mix, analyze, and play music, voice, and sound.",
    operations: ["generate", "record", "edit", "mix", "analyze", "play"],
    execution_methods: ["provider-route", "device"],
    side_effect: false,
    bindings: { provider_capabilities: ["augment", "syncori", "hathor"], device_capabilities: ["microphone"] },
    manifestation: { form: "workspace", objects: ["upload", "progress", "player", "editor", "result"] },
  },
  {
    id: "device.camera",
    domain: "device",
    description: "Capture visual input from an authorized camera and route it into a task.",
    operations: ["capture", "scan", "stream", "analyze"],
    execution_methods: ["device", "provider-route"],
    side_effect: false,
    bindings: { provider_capabilities: ["optics", "horus"], device_capabilities: ["camera"] },
    manifestation: { form: "immersive", objects: ["camera", "result"] },
  },
  {
    id: "device.control",
    domain: "device",
    description: "Control authorized local applications, IoT devices, LAN resources, and spatial environments.",
    operations: ["inspect", "control", "automate", "synchronize"],
    execution_methods: ["device"],
    side_effect: true,
    bindings: { device_capabilities: ["iot", "local_apps", "lan_access"] },
    manifestation: { form: "object", objects: ["confirm", "progress", "result"] },
  },
  {
    id: "compute.remote",
    domain: "compute",
    description: "Use authorized GPU, shell, workstation, or remote compute resources for a task.",
    operations: ["execute", "calculate", "render", "train", "build"],
    execution_methods: ["device", "provider-route"],
    side_effect: true,
    bindings: { provider_capabilities: ["code"], device_capabilities: ["gpu_compute", "shell", "remote_compute"] },
    manifestation: { form: "object", objects: ["progress", "result", "confirm"] },
  },
  {
    id: "cloud.deploy",
    domain: "cloud",
    description: "Build, deploy, configure, inspect, and verify cloud applications and infrastructure through authorized integrations.",
    operations: ["inspect", "build", "deploy", "configure", "verify", "rollback"],
    execution_methods: ["device", "connector", "provider-route"],
    side_effect: true,
    bindings: { provider_capabilities: ["code"], device_capabilities: ["shell", "remote_compute"] },
    manifestation: { form: "workspace", objects: ["progress", "confirm", "result"] },
  },
  {
    id: "communications.email",
    domain: "communications",
    description: "Read, draft, search, organize, and send email through an authorized connector.",
    operations: ["search", "read", "draft", "send", "organize"],
    execution_methods: ["connector"],
    side_effect: true,
    bindings: { connectors: ["gmail", "email"] },
    manifestation: { form: "workspace", objects: ["editor", "confirm", "result"] },
  },
  {
    id: "communications.calendar",
    domain: "communications",
    description: "Read availability and create, modify, or respond to calendar events through an authorized connector.",
    operations: ["search", "availability", "create", "update", "respond", "delete"],
    execution_methods: ["connector"],
    side_effect: true,
    bindings: { connectors: ["calendar"] },
    manifestation: { form: "workspace", objects: ["confirm", "result"] },
  },
  {
    id: "identity.access",
    domain: "identity",
    description: "Resolve authenticated identity, permissions, device trust, and entitlements before consequential work.",
    operations: ["resolve", "authorize", "entitlements", "device-trust"],
    execution_methods: ["system-authority"],
    side_effect: false,
    bindings: { system_authority: true },
    manifestation: { form: "object", objects: ["prompt", "subscribe", "result"] },
  },
  {
    id: "commerce.subscription",
    domain: "commerce",
    description: "Inspect subscription access and initiate authorized checkout or entitlement changes.",
    operations: ["catalog", "status", "checkout"],
    execution_methods: ["system-authority"],
    side_effect: true,
    bindings: { system_authority: true },
    manifestation: { form: "object", objects: ["subscribe", "confirm", "result"] },
  },
]);

function problem(message, status = 400, code = "INVALID_REQUEST") {
  return Object.assign(new Error(message), { status, code });
}

function text(value, label, { max = 160 } = {}) {
  const result = String(value ?? "").trim();
  if (!result || result.length > max) throw problem(`${label} is invalid`, 400, "VALIDATION_ERROR");
  return result;
}

function stringArray(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
}

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : { ...fallback };
}

function normalizeDescriptor(input, { requireId = true } = {}) {
  const descriptor = objectValue(input);
  const id = requireId ? text(descriptor.id, "id", { max: 120 }) : String(descriptor.id || "").trim();
  const domain = text(descriptor.domain || "dynamic", "domain", { max: 80 });
  const description = text(descriptor.description || id, "description", { max: 600 });
  return {
    id,
    domain,
    description,
    operations: stringArray(descriptor.operations, ["execute"]),
    execution_methods: stringArray(descriptor.execution_methods, ["orchestrator"]),
    side_effect: Boolean(descriptor.side_effect),
    bindings: objectValue(descriptor.bindings),
    manifestation: objectValue(descriptor.manifestation, { form: "object", objects: ["progress", "result"] }),
    metadata: objectValue(descriptor.metadata),
    enabled: descriptor.enabled !== false,
  };
}

export async function ensureCapabilityFabricSchema(db) {
  const client = db();
  await client.query(`
    create table if not exists public.capability_registry (
      id text primary key,
      domain text not null,
      description text not null,
      operations jsonb not null default '[]'::jsonb,
      execution_methods jsonb not null default '[]'::jsonb,
      side_effect boolean not null default false,
      bindings jsonb not null default '{}'::jsonb,
      manifestation jsonb not null default '{}'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      enabled boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists capability_registry_domain_idx on public.capability_registry(domain,enabled,id);

    create table if not exists public.execution_graphs (
      graph_id uuid primary key,
      gid text,
      goal text not null,
      state text not null default 'planned',
      graph jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists execution_graphs_gid_idx on public.execution_graphs(gid,created_at desc);
  `);

  for (const seed of BASE_CAPABILITIES) {
    const item = normalizeDescriptor(seed);
    await client.query(
      `insert into public.capability_registry
        (id,domain,description,operations,execution_methods,side_effect,bindings,manifestation,metadata,enabled)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9::jsonb,true)
       on conflict (id) do update set
         domain=excluded.domain,
         description=excluded.description,
         operations=excluded.operations,
         execution_methods=excluded.execution_methods,
         side_effect=excluded.side_effect,
         bindings=public.capability_registry.bindings || excluded.bindings,
         manifestation=public.capability_registry.manifestation || excluded.manifestation,
         metadata=public.capability_registry.metadata || excluded.metadata,
         updated_at=now()`,
      [item.id, item.domain, item.description, JSON.stringify(item.operations), JSON.stringify(item.execution_methods), item.side_effect, JSON.stringify(item.bindings), JSON.stringify(item.manifestation), JSON.stringify({ seeded: true, schema_version: SCHEMA_VERSION })],
    );
  }
}

export async function registerCapability(db, input) {
  const item = normalizeDescriptor(input);
  const result = await db().query(
    `insert into public.capability_registry
      (id,domain,description,operations,execution_methods,side_effect,bindings,manifestation,metadata,enabled)
     values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10)
     on conflict (id) do update set
       domain=excluded.domain,
       description=excluded.description,
       operations=excluded.operations,
       execution_methods=excluded.execution_methods,
       side_effect=excluded.side_effect,
       bindings=excluded.bindings,
       manifestation=excluded.manifestation,
       metadata=public.capability_registry.metadata || excluded.metadata,
       enabled=excluded.enabled,
       updated_at=now()
     returning *`,
    [item.id, item.domain, item.description, JSON.stringify(item.operations), JSON.stringify(item.execution_methods), item.side_effect, JSON.stringify(item.bindings), JSON.stringify(item.manifestation), JSON.stringify(item.metadata), item.enabled],
  );
  return result.rows[0];
}

function providerMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row.capability_id || "").trim().toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      operation: String(row.operation || "execute"),
      provider: String(row.provider || ""),
      model_alias: String(row.model_alias || ""),
    });
  }
  return map;
}

function descriptorAvailability(row, providers, deviceCapabilities) {
  const bindings = objectValue(row.bindings);
  const providerCapabilities = stringArray(bindings.provider_capabilities).map((value) => value.toLowerCase());
  const requiredDevice = stringArray(bindings.device_capabilities).map((value) => value.toLowerCase());
  const providerMatches = providerCapabilities.flatMap((key) => providers.get(key) || []);
  const deviceMatches = requiredDevice.filter((value) => deviceCapabilities.has(value));
  const systemAuthority = Boolean(bindings.system_authority);
  const connectorNames = stringArray(bindings.connectors);
  const available = systemAuthority || providerMatches.length > 0 || deviceMatches.length > 0;
  return {
    available,
    sources: [
      ...(systemAuthority ? ["system-authority"] : []),
      ...(providerMatches.length ? ["provider-route"] : []),
      ...(deviceMatches.length ? ["device"] : []),
    ],
    provider_routes: providerMatches,
    device_capabilities: deviceMatches,
    connectors_required: connectorNames,
  };
}

export async function getCapabilityCatalog(db, { gid = null } = {}) {
  await ensureCapabilityFabricSchema(db);
  const [registryResult, providerResult, deviceResult] = await Promise.all([
    db().query(`select id,domain,description,operations,execution_methods,side_effect,bindings,manifestation,metadata,enabled,updated_at from public.capability_registry where enabled=true order by domain,id`),
    db().query(`select capability_id,operation,provider,model_alias from public.provider_routes where enabled=true order by capability_id,operation,priority desc,id`),
    gid
      ? db().query(`select distinct g.capability from public.device_grants g join public.jahorin_devices d on d.device_id=g.device_id and d.gid=g.gid where g.gid=$1 and d.trust_state='verified' and d.revoked_at is null`, [String(gid)])
      : Promise.resolve({ rows: [] }),
  ]);

  const providers = providerMap(providerResult.rows);
  const deviceCapabilities = new Set(deviceResult.rows.map((row) => String(row.capability || "").toLowerCase()).filter(Boolean));
  const capabilities = registryResult.rows.map((row) => ({
    id: row.id,
    domain: row.domain,
    description: row.description,
    operations: Array.isArray(row.operations) ? row.operations : [],
    execution_methods: Array.isArray(row.execution_methods) ? row.execution_methods : [],
    side_effect: Boolean(row.side_effect),
    manifestation: objectValue(row.manifestation),
    metadata: objectValue(row.metadata),
    ...descriptorAvailability(row, providers, deviceCapabilities),
  }));

  const boundProviders = new Set(
    registryResult.rows.flatMap((row) => stringArray(objectValue(row.bindings).provider_capabilities).map((value) => value.toLowerCase())),
  );
  for (const [providerCapability, routes] of providers.entries()) {
    if (boundProviders.has(providerCapability)) continue;
    capabilities.push({
      id: `provider.${providerCapability}`,
      domain: "provider",
      description: `Dynamically discovered provider capability: ${providerCapability}.`,
      operations: [...new Set(routes.map((route) => route.operation))],
      execution_methods: ["provider-route"],
      side_effect: false,
      manifestation: { form: "object", objects: ["progress", "result"] },
      metadata: { dynamic: true },
      available: true,
      sources: ["provider-route"],
      provider_routes: routes,
      device_capabilities: [],
      connectors_required: [],
    });
  }

  const boundDevices = new Set(
    registryResult.rows.flatMap((row) => stringArray(objectValue(row.bindings).device_capabilities).map((value) => value.toLowerCase())),
  );
  for (const capability of deviceCapabilities) {
    if (boundDevices.has(capability)) continue;
    capabilities.push({
      id: `device.${capability}`,
      domain: "device",
      description: `Dynamically discovered capability from an authorized user device: ${capability}.`,
      operations: ["execute"],
      execution_methods: ["device"],
      side_effect: true,
      manifestation: { form: "object", objects: ["confirm", "progress", "result"] },
      metadata: { dynamic: true },
      available: true,
      sources: ["device"],
      provider_routes: [],
      device_capabilities: [capability],
      connectors_required: [],
    });
  }

  return {
    schema_version: SCHEMA_VERSION,
    authority: "ARI",
    open_ended: true,
    dynamic_discovery: true,
    gid: gid ? String(gid) : null,
    capabilities,
  };
}

const PLAN_RULES = [
  { re: /\b(logo|image|photo|picture|graphic|illustration|poster|cover art)\b/i, ids: ["media.image"] },
  { re: /\b(video|film|movie|clip|animation|animate)\b/i, ids: ["media.video"] },
  { re: /\b(music|song|audio|sound|voice|beat|mix|master)\b/i, ids: ["media.audio"] },
  { re: /\b(search|research|look up|latest|current|sources|internet|web)\b/i, ids: ["web.research"] },
  { re: /\b(code|software|app|application|website|debug|repository|repo|api|program)\b/i, ids: ["software.code"] },
  { re: /\b(deploy|hosting|cloud|server|container|domain|production)\b/i, ids: ["cloud.deploy"] },
  { re: /\b(file|document|pdf|folder|archive|convert|compress|upload|download)\b/i, ids: ["files.manage"] },
  { re: /\b(data|spreadsheet|csv|database|sql|analy[sz]e|chart|visuali[sz]e)\b/i, ids: ["data.analyze"] },
  { re: /\b(email|inbox|mail|message)\b/i, ids: ["communications.email"] },
  { re: /\b(calendar|meeting|schedule|appointment|availability)\b/i, ids: ["communications.calendar"] },
  { re: /\b(camera|scan|take a picture|take a photo)\b/i, ids: ["device.camera"] },
  { re: /\b(iot|smart home|device control|control my|room|lights|thermostat)\b/i, ids: ["device.control"] },
  { re: /\b(gpu|workstation|compute|shell|terminal|render farm)\b/i, ids: ["compute.remote"] },
  { re: /\b(subscription|plan|upgrade|checkout|billing)\b/i, ids: ["commerce.subscription"] },
];

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function compileExecutionGraph({ goal, catalog, requestedCapabilities = [] }) {
  const cleanGoal = text(goal, "goal", { max: 4000 });
  const byId = new Map((catalog?.capabilities || []).map((capability) => [capability.id, capability]));
  const selected = [];

  for (const id of stringArray(requestedCapabilities)) if (byId.has(id)) selected.push(id);
  if (!selected.length) {
    for (const rule of PLAN_RULES) if (rule.re.test(cleanGoal)) selected.push(...rule.ids.filter((id) => byId.has(id)));
  }

  const resolved = unique(selected);
  const effective = resolved.length ? resolved : ["system.orchestrate"];
  if (resolved.length && !effective.includes("system.orchestrate")) effective.unshift("system.orchestrate");

  const nodes = effective.map((capabilityId, index) => {
    const capability = byId.get(capabilityId) || {
      id: capabilityId,
      operations: ["execute"],
      available: capabilityId === "system.orchestrate",
      side_effect: false,
      manifestation: { form: "object", objects: ["progress", "result"] },
    };
    const operation = capability.operations?.[0] || "execute";
    return {
      node_id: `n${index + 1}`,
      capability_id: capabilityId,
      operation,
      depends_on: index === 0 ? [] : [`n${index}`],
      available: capabilityId === "system.orchestrate" ? true : Boolean(capability.available),
      requires_confirmation: Boolean(capability.side_effect),
      manifestation: capability.manifestation || { form: "object", objects: ["progress", "result"] },
    };
  });

  const unavailable = nodes.filter((node) => !node.available).map((node) => node.capability_id);
  return {
    graph_id: crypto.randomUUID(),
    schema_version: SCHEMA_VERSION,
    goal: cleanGoal,
    dynamic_resolution: !resolved.length || unavailable.length > 0,
    state: unavailable.length ? "needs-capability" : "planned",
    unavailable_capabilities: unavailable,
    nodes,
  };
}

export async function persistExecutionGraph(db, { gid = null, graph }) {
  await ensureCapabilityFabricSchema(db);
  await db().query(
    `insert into public.execution_graphs (graph_id,gid,goal,state,graph)
     values ($1::uuid,$2,$3,$4,$5::jsonb)
     on conflict (graph_id) do update set state=excluded.state,graph=excluded.graph,updated_at=now()`,
    [graph.graph_id, gid ? String(gid) : null, graph.goal, graph.state, JSON.stringify(graph)],
  );
  return graph;
}

export async function getExecutionGraph(db, { gid = null, graphId }) {
  const id = text(graphId, "graph_id", { max: 64 });
  const result = gid
    ? await db().query(`select graph_id::text,gid,goal,state,graph,created_at,updated_at from public.execution_graphs where graph_id=$1::uuid and gid=$2 limit 1`, [id, String(gid)])
    : await db().query(`select graph_id::text,gid,goal,state,graph,created_at,updated_at from public.execution_graphs where graph_id=$1::uuid limit 1`, [id]);
  return result.rows[0] || null;
}
