const DEFAULT_LIMIT = 8;

function cleanText(value, max = 12000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function safeLimit(value, fallback = DEFAULT_LIMIT) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(20, Math.trunc(n))) : fallback;
}

export async function recallJahorinMemory(db, { gid, query = "", limit = DEFAULT_LIMIT } = {}) {
  if (!gid || typeof db !== "function") return [];
  const text = cleanText(query, 2000);
  const take = safeLimit(limit);
  const client = db();

  if (!text) {
    const recent = await client.query(
      `select memory_id,kind,scope,content,metadata,importance,created_at,updated_at
       from public.memory_items
       where gid=$1 and status='active' and (expires_at is null or expires_at>now())
       order by importance desc, updated_at desc
       limit $2`,
      [String(gid), take],
    );
    return recent.rows;
  }

  const result = await client.query(
    `select memory_id,kind,scope,content,metadata,importance,created_at,updated_at,
            ts_rank(search_document, plainto_tsquery('simple',$2)) as rank
     from public.memory_items
     where gid=$1
       and status='active'
       and (expires_at is null or expires_at>now())
       and (
         search_document @@ plainto_tsquery('simple',$2)
         or content ilike ('%' || $2 || '%')
       )
     order by rank desc nulls last, importance desc, updated_at desc
     limit $3`,
    [String(gid), text, take],
  );
  return result.rows;
}

export async function writeJahorinMemory(db, {
  gid,
  kind = "task_summary",
  scope = "persistent",
  content,
  metadata = {},
  importance = 0.5,
  sourceTaskId = null,
  expiresAt = null,
} = {}) {
  if (!gid || typeof db !== "function") throw Object.assign(new Error("Memory persistence requires database context"), { status: 503, code: "MEMORY_DB_REQUIRED" });
  const value = cleanText(content);
  if (!value) throw Object.assign(new Error("Memory content is required"), { status: 400, code: "MEMORY_CONTENT_REQUIRED" });
  const allowedKinds = new Set(["task_summary", "preference", "project", "fact", "working", "explicit"]);
  const normalizedKind = allowedKinds.has(String(kind)) ? String(kind) : "task_summary";
  const normalizedScope = ["session", "project", "persistent"].includes(String(scope)) ? String(scope) : "persistent";
  const score = Math.max(0, Math.min(1, Number(importance) || 0.5));
  const result = await db().query(
    `insert into public.memory_items
      (gid,kind,scope,content,metadata,importance,source_task_id,expires_at)
     values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
     returning memory_id,kind,scope,content,metadata,importance,source_task_id,expires_at,created_at,updated_at`,
    [String(gid), normalizedKind, normalizedScope, value, JSON.stringify(metadata || {}), score, sourceTaskId, expiresAt],
  );
  return result.rows[0] || null;
}

export async function persistMemoryCandidates(db, { gid, taskId = null, candidates = [] } = {}) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  const written = [];
  for (const candidate of candidates.slice(0, 8)) {
    if (!candidate || candidate.persist !== true) continue;
    const provenance = String(candidate.provenance || "").toLowerCase();
    const kind = String(candidate.kind || "task_summary");
    const explicit = provenance === "explicit_user" || kind === "task_summary";
    if (!explicit) continue;
    const row = await writeJahorinMemory(db, {
      gid,
      kind,
      scope: candidate.scope || "persistent",
      content: candidate.content,
      metadata: {
        ...(candidate.metadata && typeof candidate.metadata === "object" ? candidate.metadata : {}),
        provenance: candidate.provenance || "task_summary",
      },
      importance: candidate.importance ?? 0.5,
      sourceTaskId: taskId,
      expiresAt: candidate.expires_at || null,
    });
    if (row) written.push(row);
  }
  return written;
}
