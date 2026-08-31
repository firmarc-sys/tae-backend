import * as Astronomy from 'astronomy-engine';
import tzLookup from 'tz-lookup';
import { calculateBirthNumerology } from './numerology.js';

const SIGNS=['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const NAKSHATRAS=['Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra','Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha','Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishta','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati'];
const BODIES={sun:Astronomy.Body.Sun,moon:Astronomy.Body.Moon,mercury:Astronomy.Body.Mercury,venus:Astronomy.Body.Venus,mars:Astronomy.Body.Mars,jupiter:Astronomy.Body.Jupiter,saturn:Astronomy.Body.Saturn};

const norm=(x)=>((x%360)+360)%360;
const rad=(d)=>d*Math.PI/180;
const deg=(r)=>r*180/Math.PI;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));

function julianDay(date){ return date.getTime()/86400000+2440587.5; }
function lahiriAyanamsa(date){
  const years=(julianDay(date)-2451545.0)/365.2425;
  return 23.85675 + years*(50.290966/3600);
}
function longitudeMeta(lon){
  const x=norm(lon), signIndex=Math.floor(x/30), inSign=x-signIndex*30;
  const nsize=360/27, ni=Math.floor(x/nsize), within=x-ni*nsize, pada=Math.floor(within/(nsize/4))+1;
  return {longitude:Number(x.toFixed(6)),sign:SIGNS[signIndex],degree:Number(inSign.toFixed(4)),nakshatra:NAKSHATRAS[clamp(ni,0,26)],pada:clamp(pada,1,4)};
}
function meanNodeTropical(date){
  const T=(julianDay(date)-2451545.0)/36525;
  return norm(125.0445479 - 1934.1362891*T + 0.0020754*T*T + (T*T*T)/467441 - (T*T*T*T)/60616000);
}
function trueNodeTropical(date){
  const T=(julianDay(date)-2451545.0)/36525;
  const mean=meanNodeTropical(date);
  const D=rad(norm(297.8501921 + 445267.1114034*T - 0.0018819*T*T));
  const M=rad(norm(357.5291092 + 35999.0502909*T - 0.0001536*T*T));
  const Mp=rad(norm(134.9633964 + 477198.8675055*T + 0.0087414*T*T));
  const F=rad(norm(93.2720950 + 483202.0175233*T - 0.0036539*T*T));
  const correction = -1.4979*Math.sin(2*(D-F)) - 0.1500*Math.sin(M) - 0.1226*Math.sin(2*D) + 0.1176*Math.sin(2*F) - 0.0801*Math.sin(2*(Mp-F));
  return norm(mean + correction);
}
function tropicalLongitude(body,date){
  if(body===Astronomy.Body.Moon) return norm(Astronomy.EclipticGeoMoon(date).lon);
  const vec=Astronomy.GeoVector(body,date,true);
  return norm(Astronomy.Ecliptic(vec).elon);
}
function gmstDegrees(date){
  const jd=julianDay(date), T=(jd-2451545)/36525;
  return norm(280.46061837 + 360.98564736629*(jd-2451545) + 0.000387933*T*T - T*T*T/38710000);
}
function ascendantLongitude(date,latitude,longitude){
  const theta=rad(norm(gmstDegrees(date)+longitude));
  const eps=rad(23.439291 - 0.0130042*((julianDay(date)-2451545)/36525));
  const phi=rad(clamp(latitude,-89.9,89.9));
  let lambda=deg(Math.atan2(-Math.cos(theta), Math.sin(theta)*Math.cos(eps)+Math.tan(phi)*Math.sin(eps)));
  lambda=norm(lambda+180);
  return lambda;
}
function houseFor(sign,ascSign){ return ((SIGNS.indexOf(sign)-SIGNS.indexOf(ascSign)+12)%12)+1; }

function offsetMinutesAt(timeZone,date){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const p=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const asUTC=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
  return Math.round((asUTC-date.getTime())/60000);
}
function localToUtc(dateText,timeText,timeZone){
  const [y,m,d]=dateText.split('-').map(Number), [hh,mm,ss=0]=timeText.split(':').map(Number);
  let utc=Date.UTC(y,m-1,d,hh,mm,ss);
  for(let i=0;i<3;i++){ const off=offsetMinutesAt(timeZone,new Date(utc)); utc=Date.UTC(y,m-1,d,hh,mm,ss)-off*60000; }
  return new Date(utc);
}

async function geocode(place){
  const q=String(place||'').trim(); if(!q) throw Object.assign(new Error('birthplace is required'),{status:400});
  const url=new URL('https://nominatim.openstreetmap.org/search'); url.searchParams.set('q',q); url.searchParams.set('format','jsonv2'); url.searchParams.set('limit','1');
  const r=await fetch(url,{headers:{'user-agent':process.env.NOMINATIM_USER_AGENT||'Jahorin-ARI/1.0 (birth-chart geocoder)'},signal:AbortSignal.timeout(8000)});
  if(!r.ok) throw Object.assign(new Error('birthplace lookup failed'),{status:502});
  const rows=await r.json(); if(!rows?.[0]) throw Object.assign(new Error('birthplace not found'),{status:422});
  const latitude=Number(rows[0].lat), longitude=Number(rows[0].lon), timeZone=tzLookup(latitude,longitude);
  return {place:q,resolved_place:rows[0].display_name,latitude,longitude,time_zone:timeZone};
}

export async function ensureVedicSchema(pool){
  await pool.query(`create table if not exists public.jahorin_vedic_profiles (
    gid text primary key,
    birth_data jsonb not null,
    calculation jsonb not null,
    chart jsonb not null,
    interpretation jsonb not null default '{}'::jsonb,
    validation jsonb not null default '{}'::jsonb,
    consent boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
}

export async function calculateVedicProfile(input){
  const birthDate=String(input?.birth_date||'').trim();
  const birthTime=String(input?.birth_time||'12:00').trim();
  const timePrecision=['exact','estimated','unknown'].includes(input?.time_precision)?input.time_precision:'estimated';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw Object.assign(new Error('birth_date must be YYYY-MM-DD'),{status:400});
  if(!/^\d{2}:\d{2}(:\d{2})?$/.test(birthTime)) throw Object.assign(new Error('birth_time must be HH:MM'),{status:400});
  let location;
  if(Number.isFinite(Number(input?.latitude))&&Number.isFinite(Number(input?.longitude))){
    const latitude=Number(input.latitude),longitude=Number(input.longitude), timeZone=String(input?.time_zone||tzLookup(latitude,longitude));
    location={place:String(input?.birthplace||''),resolved_place:String(input?.birthplace||''),latitude,longitude,time_zone:timeZone};
  } else location=await geocode(input?.birthplace);
  const date=localToUtc(birthDate,birthTime,location.time_zone), ay=lahiriAyanamsa(date);
  const planets={};
  for(const [name,body] of Object.entries(BODIES)){ const tropical=tropicalLongitude(body,date), sidereal=norm(tropical-ay); planets[name]={...longitudeMeta(sidereal),tropical_longitude:Number(tropical.toFixed(6))}; }
  const asc=longitudeMeta(norm(ascendantLongitude(date,location.latitude,location.longitude)-ay));
  for(const p of Object.values(planets)) p.house=houseFor(p.sign,asc.sign);
  const meanRahu=longitudeMeta(norm(meanNodeTropical(date)-ay)), trueRahu=longitudeMeta(norm(trueNodeTropical(date)-ay));
  const meanKetu=longitudeMeta(norm(meanRahu.longitude+180)), trueKetu=longitudeMeta(norm(trueRahu.longitude+180));
  meanRahu.house=houseFor(meanRahu.sign,asc.sign); trueRahu.house=houseFor(trueRahu.sign,asc.sign); meanKetu.house=houseFor(meanKetu.sign,asc.sign); trueKetu.house=houseFor(trueKetu.sign,asc.sign);
  const numerology=calculateBirthNumerology(birthDate);
  const chart={ascendant:asc,planets,lunar_nodes:{rahu:{mean:meanRahu,true:trueRahu},ketu:{mean:meanKetu,true:trueKetu}},house_system:'whole_sign'};
  return {
    birth:{date:birthDate,local_time:birthTime,time_precision:timePrecision,birthplace:location.place,resolved_place:location.resolved_place,latitude:location.latitude,longitude:location.longitude,time_zone:location.time_zone,utc:date.toISOString()},
    calculation:{zodiac:'sidereal',ayanamsa:'lahiri',ayanamsa_degrees:Number(ay.toFixed(6)),ephemeris:'astronomy-engine',node_methods:['mean','true-approx'],numerology,calculated_at:new Date().toISOString()},
    chart,
    interpretation:{framework:'vedic_astrology_plus_birth_date_numerology',status:'interpretive_not_diagnostic',growth_direction:`Rahu in ${trueRahu.sign}`,familiar_patterns:`Ketu in ${trueKetu.sign}`,numerology_summary:`Life Path ${numerology.life_path.number}: ${numerology.life_path.theme}.`,reflection_prompt:`Does the ${trueRahu.sign}–${trueKetu.sign} lunar-node axis and Life Path ${numerology.life_path.number} resonate with how you experience your growth and familiar patterns?`},
    validation:{resonance:'unanswered',notes:null}
  };
}

export async function getVedicProfile(pool,gid){
  await ensureVedicSchema(pool); const r=await pool.query('select gid,birth_data,calculation,chart,interpretation,validation,consent,created_at,updated_at from public.jahorin_vedic_profiles where gid=$1 limit 1',[gid]); return r.rows[0]||null;
}
export async function saveVedicProfile(pool,gid,input){
  await ensureVedicSchema(pool); const profile=await calculateVedicProfile(input); const consent=input?.consent===true;
  if(!consent) throw Object.assign(new Error('explicit consent is required to persist birth-chart data'),{status:400,code:'CONSENT_REQUIRED'});
  const r=await pool.query(`insert into public.jahorin_vedic_profiles(gid,birth_data,calculation,chart,interpretation,validation,consent) values($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,true) on conflict(gid) do update set birth_data=excluded.birth_data,calculation=excluded.calculation,chart=excluded.chart,interpretation=excluded.interpretation,validation=excluded.validation,consent=true,updated_at=now() returning *`,[gid,JSON.stringify(profile.birth),JSON.stringify(profile.calculation),JSON.stringify(profile.chart),JSON.stringify(profile.interpretation),JSON.stringify(profile.validation)]);
  return r.rows[0];
}
export async function validateVedicProfile(pool,gid,input){
  await ensureVedicSchema(pool); const resonance=['yes','partial','no','unanswered'].includes(input?.resonance)?input.resonance:'unanswered'; const notes=String(input?.notes||'').slice(0,2000)||null;
  const r=await pool.query(`update public.jahorin_vedic_profiles set validation=jsonb_build_object('resonance',$2::text,'notes',$3::text,'validated_at',now()),updated_at=now() where gid=$1 returning *`,[gid,resonance,notes]);
  if(!r.rows[0]) throw Object.assign(new Error('Vedic profile not found'),{status:404}); return r.rows[0];
}
