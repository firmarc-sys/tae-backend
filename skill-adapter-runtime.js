import crypto from "node:crypto";
import fs from "node:fs/promises";

export function createSkillAdapterRuntime({ registryPath = process.env.JAHORIN_SKILL_REGISTRY_PATH || "", adapters = new Map(), persistence, resolveIdentity = defaultResolveIdentity, authorize = defaultAuthorize, now = () => new Date().toISOString() } = {}) {
  async function registry() {
    if (!registryPath) throw Object.assign(new Error("Skill registry is not configured"), { status: 503, code: "REGISTRY_UNAVAILABLE" });
    const parsed = JSON.parse(await fs.readFile(registryPath, "utf8"));
    if (!Array.isArray(parsed.skills)) throw Object.assign(new Error("Invalid skill registry contract"), { status: 503, code: "REGISTRY_INVALID" });
    return parsed.skills;
  }
  async function handle(req, res, { pathname, raw, requestId }) {
    const match = pathname.match(/^\/api\/skills\/([a-z0-9][a-z0-9._-]{0,119})\/invoke$/);
    const cm = pathname.match(/^\/api\/tae\/continuity\/([a-zA-Z0-9_-]{1,128})$/);
    if (!match && !cm) return false;
    const send = (status, body) => { const b = Buffer.from(JSON.stringify({ ...body, request_id: requestId })); res.writeHead(status, { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "content-length":String(b.length), "x-request-id":requestId }); res.end(b); };
    let identity;
    try { identity = await resolveIdentity(req); } catch { return send(401,{ok:false,error:"Authenticated tenant identity required",code:"AUTH_REQUIRED"}); }
    if (!identity?.gid || !identity?.session_id || !Array.isArray(identity.permissions)) return send(401,{ok:false,error:"Authenticated tenant identity required",code:"AUTH_REQUIRED"});
    let body = {};
    if (req.method === "POST") { try { body = raw?.length ? JSON.parse(raw.toString("utf8")) : {}; } catch { return send(400,{ok:false,error:"Invalid JSON body",code:"INVALID_JSON"}); } }
    if (match) {
      if (req.method !== "POST") return send(405,{ok:false,error:"POST required",code:"METHOD_NOT_ALLOWED"});
      let skills; try { skills = await registry(); } catch(e) { return send(e.status||503,{ok:false,error:e.message,code:e.code||"REGISTRY_ERROR"}); }
      const skill = skills.find(s => s.id === match[1]);
      if (!skill) return send(404,{ok:false,error:"Skill is not registered",code:"SKILL_NOT_FOUND"});
      if (skill.status !== "verified") return send(409,{ok:false,error:"Skill is not verified for invocation",code:"SKILL_UNVERIFIED"});
      const adapter = adapters.get(skill.adapter_id);
      if (typeof adapter !== "function") return send(503,{ok:false,error:"Registered adapter is not installed",code:"ADAPTER_NOT_INSTALLED"});
      if (!authorize(identity,skill,Array.isArray(skill.permissions)?skill.permissions:[])) return send(403,{ok:false,error:"Skill permission denied",code:"PERMISSION_DENIED"});
      if (!body.input || typeof body.input !== "object" || Array.isArray(body.input)) return send(422,{ok:false,error:"input object is required",code:"INVALID_INPUT"});
      const sessionId = String(body.session_id || identity.session_id);
      if (sessionId !== identity.session_id) return send(403,{ok:false,error:"Session does not belong to authenticated identity",code:"SESSION_SCOPE_MISMATCH"});
      const key = String(body.idempotency_key || "");
      if (!/^[A-Za-z0-9._:-]{8,160}$/.test(key)) return send(422,{ok:false,error:"Valid idempotency_key is required",code:"INVALID_IDEMPOTENCY_KEY"});
      const checked = validateInput(skill,body.input);
      if (checked.error) return send(422,{ok:false,error:checked.error,code:"INVALID_INPUT"});
      if (!persistence || !["write","read","getByIdempotencyKey"].every(k=>typeof persistence[k]==="function")) return send(503,{ok:false,error:"Durable TAE persistence is not configured",code:"PERSISTENCE_UNAVAILABLE"});
      const taskId = String(body.task_id || crypto.randomUUID());
      const revision = Number.isSafeInteger(body.revision)&&body.revision>=0?body.revision:0;
      try {
        const prior = await persistence.getByIdempotencyKey({gid:identity.gid,session_id:sessionId,idempotency_key:key});
        if (prior) return send(200,{ok:true,replay:true,durable:true,continuity:prior});
        const result = await adapter({input:checked.value,identity:{gid:identity.gid,session_id:sessionId},task_id:taskId,signal:AbortSignal.timeout(30000)});
        const record = {schema_version:1,gid:identity.gid,session_id:sessionId,task_id:taskId,skill_id:skill.id,adapter_id:skill.adapter_id,idempotency_key:key,revision:revision+1,status:"completed",created_at:now(),evidence:[{type:"adapter_result",adapter_id:skill.adapter_id,result_hash:crypto.createHash("sha256").update(JSON.stringify(result??null)).digest("hex"),recorded_at:now()}],result:result??null};
        await persistence.write(record);
        const readBack = await persistence.read({gid:identity.gid,session_id:sessionId,task_id:taskId});
        if (!readBack || readBack.gid!==identity.gid || readBack.session_id!==sessionId || readBack.idempotency_key!==key || readBack.revision!==record.revision) return send(503,{ok:false,error:"TAE write/read verification failed",code:"PERSISTENCE_VERIFY_FAILED",durable:false});
        return send(200,{ok:true,durable:true,continuity:readBack});
      } catch(e) { return send(Number(e.status)||503,{ok:false,error:e.message||"Adapter or persistence failure",code:e.code||"EXECUTION_OR_PERSISTENCE_FAILED",durable:false}); }
    }
    if (req.method!=="GET") return send(405,{ok:false,error:"GET required",code:"METHOD_NOT_ALLOWED"});
    if (cm[1]!==identity.session_id) return send(403,{ok:false,error:"Session does not belong to authenticated identity",code:"SESSION_SCOPE_MISMATCH"});
    if (!identity.permissions.includes("tae:read")) return send(403,{ok:false,error:"TAE read permission denied",code:"PERMISSION_DENIED"});
    if (!persistence || typeof persistence.readSession!=="function") return send(503,{ok:false,error:"Durable TAE persistence is not configured",code:"PERSISTENCE_UNAVAILABLE"});
    try { return send(200,{ok:true,durable:true,schema_version:1,records:await persistence.readSession({gid:identity.gid,session_id:identity.session_id})}); }
    catch { return send(503,{ok:false,error:"TAE continuity read failed",code:"PERSISTENCE_READ_FAILED"}); }
  }
  return { matches: p=>p.startsWith("/api/skills/")||p.startsWith("/api/tae/continuity/"), handle };
}
function validateInput(skill,input) {
  const s=skill.input_schema;
  if(!s||s.type!=="object") return {error:"Skill requires an object input_schema"};
  const props=s.properties||{};
  for(const k of Object.keys(input)) if(!(k in props)) return {error:"Unexpected input property: "+k};
  for(const k of s.required||[]) if(!(k in input)) return {error:"Missing required input: "+k};
  for(const [k,v] of Object.entries(input)) {
    const t=props[k]?.type;
    if(t==="string"&&typeof v!=="string") return {error:k+" must be a string"};
    if(t==="boolean"&&typeof v!=="boolean") return {error:k+" must be a boolean"};
    if(t==="number"&&(typeof v!=="number"||!Number.isFinite(v))) return {error:k+" must be finite number"};
    if(t==="integer"&&!Number.isSafeInteger(v)) return {error:k+" must be integer"};
    if(t==="object"&&(!v||typeof v!=="object"||Array.isArray(v))) return {error:k+" must be object"};
    if(t==="array"&&!Array.isArray(v)) return {error:k+" must be array"};
  }
  return {value:input};
}
function defaultAuthorize(identity,skill,required) { return required.every(p=>identity.permissions.includes(p))&&(!skill.gid||skill.gid===identity.gid); }
function defaultResolveIdentity(req) {
  const secret=process.env.ARI_SESSION_SECRET||"";
  const cookie=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("ari_session="));
  if(!secret||!cookie) throw new Error("session unavailable");
  const [gid,expRaw,sig]=decodeURIComponent(cookie.slice("ari_session=".length)).split(".",3), exp=Number(expRaw);
  if(!gid||!Number.isFinite(exp)||exp<=Math.floor(Date.now()/1000)||!sig) throw new Error("invalid session");
  const expected=crypto.createHmac("sha256",secret).update(gid+"."+exp).digest("hex"),a=Buffer.from(sig),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) throw new Error("invalid session signature");
  const sessionId=String(req.headers["x-jahorin-session-id"]||"");
  if(!sessionId) throw new Error("session id required");
  return {gid,session_id:sessionId,permissions:String(process.env.JAHORIN_SKILL_PERMISSIONS||"").split(",").map(x=>x.trim()).filter(Boolean)};
}
