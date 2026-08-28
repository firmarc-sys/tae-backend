import 'dotenv/config';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { getVedicProfile, saveVedicProfile, validateVedicProfile } from './vedic-profile.js';

const outerPort=Number(process.env.PORT||8080);
const innerPort=Number(process.env.VEDIC_GATEWAY_INNER_PORT||8095);
const sessionSecret=process.env.ARI_SESSION_SECRET || (process.env.JWT_SECRET && process.env.JWT_SECRET!=='CHANGE-ME-IN-PROD'?process.env.JWT_SECRET:'');
const connectionString=process.env.NEON_DATABASE_URL||process.env.DATABASE_URL||'';
const pool=connectionString?new Pool({connectionString,max:4,idleTimeoutMillis:30000,connectionTimeoutMillis:8000}):null;
const allowedOrigins=new Set((process.env.PRODUCTION_ALLOWED_ORIGINS||['https://jahorin.space','https://www.jahorin.space','https://jahorin-ga.vercel.app','https://siaas.space','https://www.siaas.space','http://localhost:5173'].join(',')).split(',').map(x=>x.trim()).filter(Boolean));
const child=spawn(process.execPath,['authorization-gateway.js'],{env:{...process.env,PORT:String(innerPort)},stdio:'inherit'});
child.on('exit',(code,signal)=>{console.error(`ARI authorization gateway exited code=${code} signal=${signal||''}`);process.exit(code||1)});

function parseCookies(header=''){return Object.fromEntries(String(header).split(';').map(x=>x.trim()).filter(Boolean).map(part=>{const i=part.indexOf('=');return i<0?[decodeURIComponent(part),'']:[decodeURIComponent(part.slice(0,i)),decodeURIComponent(part.slice(i+1))]}))}
function safe(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function sessionGid(req){if(!sessionSecret)return null;const token=parseCookies(req.headers.cookie||'').ari_session;if(!token)return null;const [gid,expRaw,sig]=token.split('.',3),exp=Number(expRaw);if(!gid||!sig||!Number.isFinite(exp)||exp<=Math.floor(Date.now()/1000))return null;const expected=crypto.createHmac('sha256',sessionSecret).update(`${gid}.${exp}`).digest('hex');return safe(sig,expected)?gid:null}
function originFor(req){const o=String(req.headers.origin||'').trim();if(!o)return null;return allowedOrigins.has(o)?o:false}
function headers(req){const o=originFor(req);return {'content-type':'application/json; charset=utf-8','cache-control':'no-store','strict-transport-security':'max-age=31536000; includeSubDomains','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',...(o?{'access-control-allow-origin':o,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type,x-request-id,x-csrf-token,authorization','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','vary':'Origin'}:{})}}
function json(req,res,status,body){const data=Buffer.from(JSON.stringify({...body,request_id:body?.request_id||String(req.headers['x-request-id']||crypto.randomUUID())}));res.writeHead(status,{...headers(req),'content-length':String(data.length)});res.end(data)}
async function body(req,limit=1024*1024){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>limit)throw Object.assign(new Error('request body too large'),{status:413});chunks.push(c)}if(!chunks.length)return {};try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw Object.assign(new Error('invalid JSON'),{status:400})}}
function db(){if(!pool)throw Object.assign(new Error('Neon profile authority is not configured'),{status:503});return pool}
function proxy(req,res){const up=http.request({hostname:'127.0.0.1',port:innerPort,path:req.url,method:req.method,headers:{...req.headers,host:`127.0.0.1:${innerPort}`}},u=>{res.writeHead(u.statusCode||502,u.headers);u.pipe(res)});up.on('error',e=>json(req,res,503,{ok:false,error:`ARI inner gateway unavailable: ${e.message}`}));req.pipe(up)}

const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url||'/','http://localhost').pathname;
  if(req.method==='OPTIONS')return json(req,res,204,{});
  if(originFor(req)===false)return json(req,res,403,{ok:false,error:'Origin not allowed'});
  if(pathname!=='/api/identity/vedic-profile')return proxy(req,res);
  try{
    const gid=sessionGid(req); if(!gid)return json(req,res,401,{ok:false,code:'AUTH_REQUIRED',error:'Authenticated GID required'});
    if(req.method==='GET'){const profile=await getVedicProfile(db(),gid);return json(req,res,200,{ok:true,profile})}
    if(req.method==='POST'){const input=await body(req);const profile=await saveVedicProfile(db(),gid,input);return json(req,res,201,{ok:true,profile})}
    if(req.method==='PATCH'){const input=await body(req);const profile=await validateVedicProfile(db(),gid,input);return json(req,res,200,{ok:true,profile})}
    return json(req,res,405,{ok:false,error:'Method not allowed'});
  }catch(error){console.error('ARI Vedic gateway error',error);return json(req,res,Number(error?.status||500),{ok:false,code:error?.code||'VEDIC_PROFILE_ERROR',error:error?.message||'Vedic profile request failed'})}
});
function waitForPort(port,timeout=30000){const end=Date.now()+timeout;return new Promise((resolve,reject)=>{const attempt=()=>{const s=net.createConnection({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve()});s.once('error',e=>{s.destroy();Date.now()>=end?reject(e):setTimeout(attempt,120)})};attempt()})}
waitForPort(innerPort).then(()=>server.listen(outerPort,'0.0.0.0',()=>console.log(`ARI Vedic gateway listening on ${outerPort}; authorization chain on ${innerPort}`))).catch(e=>{console.error(`ARI Vedic gateway readiness failed: ${e.message}`);if(!child.killed)child.kill('SIGTERM');process.exit(1)});
function shutdown(signal){console.log(`ARI Vedic gateway received ${signal}`);server.close(async()=>{if(!child.killed)child.kill('SIGTERM');if(pool)await pool.end().catch(()=>{});process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()}
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
