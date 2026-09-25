import crypto from "node:crypto";

const baseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const configured = Boolean(baseUrl && secretKey);

function requireConfig() {
  if (!configured) throw Object.assign(new Error("Supabase server credentials are not configured"), { status: 503 });
}
async function request(path, { method="GET", body, token }={}) {
  requireConfig();
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${token || secretKey}`,
      "content-type": "application/json",
      ...(method === "POST" || method === "PATCH" ? { Prefer: "return=representation" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw:text }; }
  if (!response.ok) throw Object.assign(new Error(data?.message || data?.error || `Supabase request failed (${response.status})`), {status:response.status, data});
  return data;
}
const q = (v) => encodeURIComponent(String(v));
export const neonConfigured = configured;
export const supabaseConfigured = configured;
export async function neonHealth() { if (!configured) return false; try { await request("/rest/v1/gid?select=gid&limit=1"); return true; } catch { return false; } }

export async function resolveAuthenticatedGid(accessToken) {
  requireConfig();
  if (!accessToken) throw Object.assign(new Error("Authenticated Supabase access token required"), {status:401});
  const users = await fetch(baseUrl + "/auth/v1/user", {headers:{apikey:secretKey,Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(10000)});
  if (!users.ok) throw Object.assign(new Error("Invalid or expired Supabase access token"), {status:401});
  const user = await users.json();
  const rows = await request(`/rest/v1/gid?auth_user_id=eq.${q(user.id)}&select=gid&limit=1`);
  if (rows?.[0]?.gid) return String(rows[0].gid);
  const gid = crypto.randomUUID().replace(/-/g,"").slice(0,12);
  await request("/rest/v1/gid",{method:"POST",body:{gid,auth_user_id:user.id}});
  await ensureNeonIdentity({gid,authUserId:user.id,identityScope:"consumer",displayName:user.user_metadata?.display_name || null});
  return gid;
}
export async function ensureNeonIdentity({gid,authUserId=null,identityScope="consumer",displayName=null}) {
  if (!gid) throw Object.assign(new Error("gid is required"),{status:400});
  const existing = await request(`/rest/v1/jahorin_accounts?gid=eq.${q(gid)}&select=account_id,gid,display_name,status&limit=1`);
  if (!existing?.length) {
    await request("/rest/v1/jahorin_accounts",{method:"POST",body:{gid,display_name:displayName,status:"active",metadata:{identity_scope:identityScope}}});
    await request("/rest/v1/subscriptions",{method:"POST",body:{gid,plan:identityScope==="prime"?"owner":"free",status:"active",usage_limit:identityScope==="prime"?0:5000,usage_used:0,rc_balance:0}});
  }
  return getNeonIdentity(gid);
}
export async function getNeonIdentity(gid) {
  const rows=await request(`/rest/v1/jahorin_accounts?gid=eq.${q(gid)}&select=account_id,gid,display_name,status,created_at,updated_at&limit=1`);
  return rows?.[0]||null;
}
export async function resolveRuntimeAuthorization(gid,capability,operation){
  const started=Date.now();
  const sub=(await request(`/rest/v1/subscriptions?gid=eq.${q(gid)}&select=plan,status,usage_limit,usage_used&limit=1`))[0];
  if(!sub) return {gid,capability,operation,allowed:false,reason_code:"IDENTITY_REQUIRED",latency_ms:Date.now()-started};
  if(sub.status!=="active") return {gid,capability,operation,allowed:false,reason_code:"IDENTITY_DISABLED",latency_ms:Date.now()-started};
  const limit=Number(sub.usage_limit||0), used=Number(sub.usage_used||0);
  if(sub.plan!=="owner" && limit>0 && used>=limit) return {gid,capability,operation,allowed:false,reason_code:"USAGE_LIMIT_REACHED",limit,used,latency_ms:Date.now()-started};
  return {gid,capability,operation,allowed:true,reason_code:"AUTHORIZED",user_type:sub.plan==="owner"?"internal":"external",role_id:sub.plan==="owner"?"prime_orchestrator":"subscriber",tier_id:sub.plan,limits:{runtime_requests_day:limit},used,limit,latency_ms:Date.now()-started};
}
export async function recordRuntimeAuthorizationEvent(event={}) { return recordContinuityEvent(event.gid,"runtime_authorization",event); }

export async function recordContinuityEvent(gid,eventType,payload={},objective_id=null,request_id=null){
  const rows=await request("/rest/v1/continuity_events",{method:"POST",body:{gid,event_type:eventType,payload,objective_id,request_id}});
  return rows?.[0]||null;
}
export async function getTwinState(gid){
  const [account,sub,objectives,events]=await Promise.all([
    getNeonIdentity(gid),
    request(`/rest/v1/subscriptions?gid=eq.${q(gid)}&select=plan,status,usage_limit,usage_used,rc_balance&limit=1`),
    request(`/rest/v1/objectives?gid=eq.${q(gid)}&select=objective_id,title,description,status,state,created_at,updated_at&order=updated_at.desc&limit=50`),
    request(`/rest/v1/continuity_events?gid=eq.${q(gid)}&select=event_id,event_type,payload,request_id,created_at&order=created_at.desc&limit=40`),
  ]);
  const s=sub?.[0]||{};
  return {schema:"jahorin-v1",mode:"persistent",learningEnabled:true,confidence:.5,state:{},sources:{},preferences:{},capabilityUsage:{},projects:objectives||[],recentEvents:events||[],account,subscription:s,updatedAt:new Date().toISOString()};
}
export async function mergeTwinState(gid,patch={}){return recordContinuityEvent(gid,"state_patch",patch.state||patch);}
export async function setTwinPermissions(gid,permissions={}){return recordContinuityEvent(gid,"permissions",permissions);}
export async function setTwinPreferences(gid,preferences={}){return recordContinuityEvent(gid,"preferences",preferences);}
export async function incrementCapabilityUsage(gid,capability){
  const rows=await request(`/rest/v1/subscriptions?gid=eq.${q(gid)}&select=usage_used&limit=1`); const used=Number(rows?.[0]?.usage_used||0)+1;
  await request(`/rest/v1/subscriptions?gid=eq.${q(gid)}`,{method:"PATCH",body:{usage_used:used,updated_at:new Date().toISOString()}});
  return {capability,use_count:used};
}
export async function recordPrediction(gid,prediction={},context={}){return recordContinuityEvent(gid,"prediction",{...prediction,context});}
export async function listPredictions(gid,limit=12){const rows=await request(`/rest/v1/continuity_events?gid=eq.${q(gid)}&event_type=eq.prediction&select=event_id,payload,created_at&order=created_at.desc&limit=${Math.min(50,Number(limit)||12)}`);return rows.map(r=>({id:r.event_id,...(r.payload||{}),created_at:r.created_at}));}
export async function resolveLatestPrediction(gid,status){return recordContinuityEvent(gid,"prediction_resolution",{status});}
export async function adjustTwinConfidence(gid,delta){return recordContinuityEvent(gid,"confidence_adjustment",{delta});}
export async function recordTimeline(gid,turn={}){return recordContinuityEvent(gid,"timeline",turn,null,turn.request_id||null);}
export async function getTimeline(gid,limit=40){const rows=await request(`/rest/v1/continuity_events?gid=eq.${q(gid)}&event_type=eq.timeline&select=event_id,payload,request_id,created_at&order=created_at.desc&limit=${Math.min(100,Number(limit)||40)}`);return rows.map(r=>({id:r.event_id,...(r.payload||{}),request_id:r.request_id,created_at:r.created_at}));}
export async function clearTwin(gid){await request(`/rest/v1/objectives?gid=eq.${q(gid)}`,{method:"DELETE"});return true;}
export async function createObjective(gid,{title,description,state={}}){const rows=await request("/rest/v1/objectives",{method:"POST",body:{gid,title,description,state}});return rows?.[0]||null;}
export async function getRuntimeState(gid){return getTwinState(gid);}
export async function getUsage(gid){const rows=await request(`/rest/v1/subscriptions?gid=eq.${q(gid)}&select=plan,status,usage_limit,usage_used,rc_balance&limit=1`);return rows?.[0]||null;}
export async function addLedgerEntry(gid,transaction_type,amount,reference_id=null,metadata={}){const sub=(await request(`/rest/v1/subscriptions?gid=eq.${q(gid)}&select=rc_balance&limit=1`))[0];const balance=Number(sub?.rc_balance||0)+Number(amount);const rows=await request("/rest/v1/retrograde_ledger",{method:"POST",body:{gid,transaction_type,amount:Number(amount),balance_after:balance,reference_id,metadata}});await request(`/rest/v1/subscriptions?gid=eq.${q(gid)}`,{method:"PATCH",body:{rc_balance:balance}});return rows?.[0]||null;}
export async function closeNeon(){}
