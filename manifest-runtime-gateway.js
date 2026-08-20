import "dotenv/config";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createAutonomyRuntime } from "./autonomy-runtime.js";

const port = Number(process.env.PORT || 8080);
const innerPort = Number(process.env.ARI_IDENTITY_PORT || 8081);
const corePort = Number(process.env.ARI_CORE_PORT || 8082);
const freeAccess = !/^(0|false|no|off)$/i.test(process.env.JAHORIN_FREE_ACCESS || "true");
const limit = Math.max(10, Number(process.env.FREE_RUNTIME_REQUESTS_PER_HOUR || 120));
const usage = new Map();

const child = spawn(process.execPath,["identity-runtime-gateway.js"],{env:{...process.env,PORT:String(innerPort),ARI_INNER_PORT:String(corePort),ARI_REQUIRE_AUTH:freeAccess?"false":(process.env.ARI_REQUIRE_AUTH||"true")},stdio:"inherit"});
child.on("exit",code=>process.exit(code||1));

const autonomy = createAutonomyRuntime({ innerPort });
const rid=req=>String(req.headers["x-request-id"]||crypto.randomUUID());
function json(res,status,body,id){const data=Buffer.from(JSON.stringify(body));res.writeHead(status,{"content-type":"application/json; charset=utf-8","content-length":String(data.length),"cache-control":"no-store","x-runtime":"ARI",...(id?{"x-request-id":id}:{})});res.end(data)}
function read(req,cap=12*1024*1024){return new Promise((resolve,reject)=>{const a=[];let n=0;req.on("data",c=>{n+=c.length;if(n>cap){reject(Object.assign(new Error("request body too large"),{status:413}));req.destroy();return}a.push(c)});req.on("end",()=>resolve(Buffer.concat(a)));req.on("error",reject)})}
function allowed(req){if(!freeAccess)return true;const key=String(req.headers["x-forwarded-for"]||req.socket.remoteAddress||"unknown").split(",")[0].trim(),hour=Math.floor(Date.now()/3600000),b=usage.get(key);if(!b||b.hour!==hour){usage.set(key,{hour,count:1});return true}b.count++;return b.count<=limit}

function classify(intent){const t=intent.toLowerCase(),has=(...w)=>w.some(x=>t.includes(x));
 if(has("camera","photo","picture","image","video","film","scan","visual"))return {machine:"horus",capability:has("edit","generate","veo","nano banana")?"editor":has("analy","identify")?"analyze":"see",runtime:"vision",steps:["Open Horus","Activate visual intelligence","Persist resulting media"]};
 if(has("music","song","beat","dj","audio","sound","loop","drum","sample","mix"))return {machine:"hathor",capability:has("mix")?"mix":has("sample")?"sample":has("drum","beat")?"drums":has("key","piano","chord")?"keys":"loop",runtime:"syncori",steps:["Open Hathor","Manifest the playable instrument","Persist the session"]};
 if(has("search","research","google","internet","web","website","browse","look up"))return {machine:"wepwawet",capability:has("browse","open website")?"traverse":"search",runtime:"interweb",steps:["Open Wepwawet","Search or traverse","Bring findings back into context"]};
 if(has("write","note","document","journal","letter","essay","explain","summar","remember","scribe"))return {machine:"thoth",capability:has("explain")?"explain":"scribe",runtime:has("explain")?"reasoning":"scribe",steps:["Open Thoth","Capture the thought","Persist the artifact"]};
 if(has("build","make an app","make a website","create a website","code","software","program","startup","business","company","launch","project","automate"))return {machine:"ptah",capability:"plan",runtime:"code",steps:["Open Ptah Plan","Clarify the outcome","Research dependencies when needed","Forge implementation","Persist progress"]};
 return {machine:"thoth",capability:"convo",runtime:"text",steps:["Continue the conversation","Resolve the next action","Manifest a specialized machine when clear"]};
}

function fallback(r){return r.machine==="ptah"?"I understand what you want to make. I’m opening Ptah in Plan mode so we can turn it into a concrete path, and I’ll keep the context with us as we move.":r.machine==="wepwawet"?"I understand. I’m opening Wepwawet so I can find the paths and information that matter, and I’ll keep the useful findings with us.":r.machine==="hathor"?"I hear the musical intention. I’m turning the device into Hathor’s instrument so you can begin creating immediately.":r.machine==="horus"?"I understand the visual intention. I’m opening Horus so the camera and visual intelligence can become the instrument.":"I understand. I’m opening Thoth so we can give this thought a persistent form and decide what should happen next."}

async function innerRuntime(intent,r,req){try{const response=await fetch(`http://127.0.0.1:${innerPort}/api/runtime`,{method:"POST",headers:{"content-type":"application/json",...(req.headers.authorization?{authorization:req.headers.authorization}:{}),...(req.headers.cookie?{cookie:req.headers.cookie}:{})},body:JSON.stringify({intent:`The user said: ${intent}. Respond as Jahorin in two concise conversational sentences: what you understand and what you will do first.`,capability:"reasoning",module:"mercury",payload:{mode:"intent_acknowledgement"},context:{selected_machine:r.machine,selected_capability:r.capability},request_id:crypto.randomUUID()}),signal:AbortSignal.timeout(18000)});if(!response.ok)return null;const p=await response.json();return p?.result?.text||p?.output||p?.reply?.text||null}catch{return null}}

function err(status,p,id,cap="runtime"){const m=String(p?.error||p?.message||p?.detail||`HTTP ${status}`),code=status===401?"authentication_required":status===429?"resource_limit":status===503?"dependency_unavailable":status>=500?"internal_execution_error":"request_failed";return {ok:false,request_id:id,capability:cap,status:"error",code,error:m==="500"?"ARI could not complete the capability. Use request_id to identify the failing dependency.":m,next_action:status===429?"Wait briefly and retry.":status>=500?"Retry safely; if it persists inspect this request_id in Cloud Run logs.":"Correct the request and retry."}}

async function manifest(req,res,b,id){const intent=String(b?.intent||b?.payload?.prompt||b?.payload?.intent||"").trim();if(!intent)return json(res,422,err(422,{error:"Tell Jahorin what you want to do."},id,"orchestration"),id);const r=classify(intent),speech=(await innerRuntime(intent,r,req))||fallback(r);return json(res,200,{ok:true,request_id:id,capability:"orchestration",action:"manifest_intent",status:"ready",result:{intent,speech_text:speech,route:{machine:r.machine,capability:r.capability,runtime_capability:r.runtime},maat:{verified:true,requires_confirmation:false},tae:{now:r.steps[0],next:r.steps[1]||null,later:r.steps.slice(2),blockers:[]},hephaestus:{forge_required:r.machine==="ptah"},novalife:{persist_context:true,project_intent:intent}}},id)}

function proxy(req,res,raw,id){const u=http.request({hostname:"127.0.0.1",port:innerPort,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${innerPort}`,"content-length":String(raw.length),"x-request-id":id}},r=>{const a=[];r.on("data",c=>a.push(c));r.on("end",()=>{const d=Buffer.concat(a),status=r.statusCode||502,type=String(r.headers["content-type"]||"");if(type.includes("json")){let p;try{p=JSON.parse(d.toString("utf8"))}catch{}if(status>=500||(p?.ok===false&&String(p?.error||"").trim()==="500"))return json(res,status>=500?status:500,err(status>=500?status:500,p,id,p?.capability||"runtime"),id)}res.writeHead(status,r.headers);res.end(d)})});u.on("error",e=>json(res,503,err(503,{error:`ARI gateway unavailable: ${e.message}`},id),id));u.end(raw)}

async function handle(req,res){
  const id=rid(req),url=new URL(req.url||"/","http://localhost"),runtime=req.method==="POST"&&(url.pathname==="/api/runtime"||url.pathname==="/runtime"),autonomyRoute=autonomy.matches(url.pathname);
  if(!url.pathname.startsWith("/api/")&&url.pathname!=="/runtime"&&!autonomyRoute){const u=http.request({hostname:"127.0.0.1",port:innerPort,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${innerPort}`}},r=>{res.writeHead(r.statusCode||502,r.headers);r.pipe(res)});u.on("error",e=>json(res,503,err(503,{error:e.message},id),id));req.pipe(u);return}
  let raw;try{raw=await read(req)}catch(e){return json(res,e.status||400,err(e.status||400,{error:e.message},id),id)}
  if(autonomyRoute)return autonomy.handle(req,res,{pathname:url.pathname,raw,requestId:id});
  if(runtime){if(!allowed(req))return json(res,429,err(429,{error:"Free runtime request limit reached for this hour."},id),id);let b={};try{b=raw.length?JSON.parse(raw.toString("utf8")): {}}catch{return json(res,400,err(400,{error:"Invalid JSON body."},id),id)}const c=String(b?.capability||"").trim().toLowerCase(),auto=b?.context?.auto_route===true||b?.payload?.auto_route===true;if(!c||auto||["intent","orchestration","orchestrate","trismegistus","jahorin"].includes(c))return manifest(req,res,b,id)}
  return proxy(req,res,raw,id)
}

const gateway=http.createServer((req,res)=>void handle(req,res).catch(e=>json(res,Number(e.status)||500,err(Number(e.status)||500,{error:e.message||"Unexpected runtime failure"},rid(req)),rid(req))));
function waitForPort(port, { timeout = 20000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", (error) => {
        socket.destroy();
        if (Date.now() >= deadline) reject(error);
        else setTimeout(attempt, interval);
      });
    };
    attempt();
  });
}

waitForPort(innerPort)
  .then(() => {
    gateway.listen(port,"0.0.0.0",()=>console.log(`Jahorin manifest gateway ${port}; free_access=${freeAccess}; hourly_limit=${limit}; autonomy=${process.env.ARI_AUTONOMY_ENABLED||"true"}`));
  })
  .catch((error) => {
    console.error(`ARI child runtime failed readiness: ${error.message}`);
    if (!child.killed) child.kill("SIGTERM");
    process.exit(1);
  });
function stop(){gateway.close(()=>{if(!child.killed)child.kill("SIGTERM");process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()}
process.on("SIGTERM",stop);process.on("SIGINT",stop);
