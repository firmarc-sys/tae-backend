import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSkillAdapterRuntime } from "../skill-adapter-runtime.js";

async function fixture({gid="tenant-a",permissions=["read"],persistence=true,registryStatus="verified",adapter=true}={}) {
 const dir=await mkdtemp(path.join(os.tmpdir(),"jahorin-skill-")), registryPath=path.join(dir,"registry.json");
 await writeFile(registryPath,JSON.stringify({skills:[{id:"test.echo",status:registryStatus,adapter_id:"test.echo.v1",permissions:["read"],input_schema:{type:"object",required:["value"],properties:{value:{type:"string"}}}}]}));
 const store=new Map(), calls={n:0};
 const db=persistence?{
  async getByIdempotencyKey({gid,session_id,idempotency_key}) {return [...store.values()].find(r=>r.gid===gid&&r.session_id===session_id&&r.idempotency_key===idempotency_key)||null},
  async write(r) {store.set(r.task_id,structuredClone(r))},
  async read({gid,session_id,task_id}) {const r=store.get(task_id);return r?.gid===gid&&r?.session_id===session_id?structuredClone(r):null},
  async readSession({gid,session_id}) {return [...store.values()].filter(r=>r.gid===gid&&r.session_id===session_id).map(r=>structuredClone(r))}
 }:null;
 const runtime=createSkillAdapterRuntime({registryPath,persistence:db,adapters:adapter?new Map([["test.echo.v1",async({input})=>{calls.n++;return {echoed:input.value}}]]):new Map(),resolveIdentity:async()=>({gid,session_id:"session-a",permissions})});
 const server=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const pathname=new URL(req.url,"http://local").pathname;await runtime.handle(req,res,{pathname,raw:Buffer.concat(chunks),requestId:"test-id"});});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 return {url:"http://127.0.0.1:"+server.address().port,store,calls,close:async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true})}};
}
async function invoke(f,body){return fetch(f.url+"/api/skills/test.echo/invoke",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})}

test("installed adapter executes and durable record reads back",async t=>{const f=await fixture();t.after(f.close);const r=await invoke(f,{input:{value:"hello"},idempotency_key:"test-key-0001",task_id:"task-1"});assert.equal(r.status,200);const p=await r.json();assert.equal(p.durable,true);assert.equal(p.continuity.result.echoed,"hello");assert.equal(p.continuity.revision,1)});
test("permission denial prevents adapter invocation",async t=>{const f=await fixture({permissions:[]});t.after(f.close);const r=await invoke(f,{input:{value:"x"},idempotency_key:"test-key-0002"});assert.equal(r.status,403);assert.equal(f.calls.n,0)});
test("cross-tenant and cross-session reads are isolated",async t=>{const f=await fixture();t.after(f.close);await invoke(f,{input:{value:"secret"},idempotency_key:"test-key-0003",task_id:"task-3"});assert.equal(await f.store.values().next().value.gid,"tenant-a");const records=await [...f.store.values()].filter(r=>r.gid==="tenant-b"&&r.session_id==="session-b");assert.deepEqual(records,[])});
test("missing persistence fails closed without claiming durability",async t=>{const f=await fixture({persistence:false});t.after(f.close);const r=await invoke(f,{input:{value:"x"},idempotency_key:"test-key-0004"});assert.equal(r.status,503);assert.equal((await r.json()).durable,undefined)});
test("input schema rejects wrong types",async t=>{const f=await fixture();t.after(f.close);const r=await invoke(f,{input:{value:42},idempotency_key:"test-key-0005"});assert.equal(r.status,422);assert.equal(f.calls.n,0)});
test("unverified skill and missing adapter cannot execute",async t=>{const a=await fixture({registryStatus:"unverified"});t.after(a.close);assert.equal((await invoke(a,{input:{value:"x"},idempotency_key:"test-key-0006"})).status,409);const b=await fixture({adapter:false});t.after(b.close);assert.equal((await invoke(b,{input:{value:"x"},idempotency_key:"test-key-0007"})).status,503)});
test("a fresh runtime recovers a durable session record",async t=>{const f=await fixture();t.after(f.close);await invoke(f,{input:{value:"survives"},idempotency_key:"test-key-0008",task_id:"task-8"});const runtime=createSkillAdapterRuntime({persistence:{readSession:async({gid,session_id})=>[...f.store.values()].filter(r=>r.gid===gid&&r.session_id===session_id)},resolveIdentity:async()=>({gid:"tenant-a",session_id:"session-a",permissions:["read"]})});const server=createServer(async(req,res)=>runtime.handle(req,res,{pathname:new URL(req.url,"http://local").pathname,raw:Buffer.alloc(0),requestId:"fresh-runtime"}));await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const r=await fetch("http://127.0.0.1:"+server.address().port+"/api/tae/continuity/session-a");assert.equal(r.status,200);const p=await r.json();assert.equal(p.durable,true);assert.equal(p.records[0].result.echoed,"survives")});
