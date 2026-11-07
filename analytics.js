'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const GAMES=['domino','ludi','draff','three-cards','holdem'];
function createAnalytics({file=process.env.ANALYTICS_FILE||(fs.existsSync('/var/data')?'/var/data/game-analytics.json':null),now=Date.now}={}){
 const live=new Map();let saveTimer;function saveSoon(){if(!file||saveTimer)return;saveTimer=setTimeout(()=>{saveTimer=null;try{persist()}catch(error){console.error('Analytics save failed:',error.message)}},1000);saveTimer.unref()}let data={version:1,days:{},matches:{}};
 if(file){const root=path.resolve(file),pub=path.join(__dirname,'public');if(root===pub||root.startsWith(pub+path.sep))throw Error('Analytics storage must be private');if(fs.existsSync(file)){data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.version!==1||!data.days||!data.matches)throw Error('Invalid analytics snapshot')}}
 const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
 function persist(){if(!file)return;fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp',fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(data));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(tmp,file)}
 function day(){return new Date(now()).toLocaleDateString('en-CA',{timeZone:'America/Toronto'})}
 function bucket(g){const d=data.days[day()]||=(Object.fromEntries(GAMES.map(g=>[g,{visitors:[],players:[],started:0,completed:0,abandoned:0}])));return d[g]}
 function observe(game,id,{phase='waiting',players=[],match=null,complete=false,spectators=0,source='online'}={}){
  if(!GAMES.includes(game))return;const key=hash(game+':'+id),ids=players.map(hash),b=bucket(game);
  live.set(key,{game,phase,players:ids,spectators,source,at:now()});if(phase==='playing'||complete)for(const id of ids)if(!b.players.includes(id))b.players.push(id);
  if(match){const mid=hash(game+':'+id+':'+match);let m=data.matches[mid];if(!m){m=data.matches[mid]={game,at:now(),complete:false};b.started++}if(players.length)m.at=now();if(complete&&!m.complete&&!m.abandoned){m.complete=true;b.completed++}}
  prune();saveSoon();
 }
 function visit(game,id){if(!GAMES.includes(game)||!id)return;const b=bucket(game),h=hash(id);if(!b.visitors.includes(h)){b.visitors.push(h);saveSoon()}}
 function prune(){for(const [k,v]of live)if(now()-v.at>45000)live.delete(k);for(const m of Object.values(data.matches))if(!m.complete&&!m.abandoned&&now()-m.at>86400000&&now()-m.at<=90*86400000){m.abandoned=true;bucket(m.game).abandoned++}const cutoff=new Date(now()-90*86400000).toLocaleDateString('en-CA',{timeZone:'America/Toronto'});for(const d of Object.keys(data.days))if(d<cutoff)delete data.days[d];for(const [k,m]of Object.entries(data.matches))if(now()-m.at>90*86400000)delete data.matches[k]}
 function summary(){prune();const date=day(),days=Object.keys(data.days).sort(),month=days.filter(d=>d>=new Date(now()-29*86400000).toLocaleDateString('en-CA',{timeZone:'America/Toronto'}));return {generatedAt:now(),durable:!!file,timezone:'America/Toronto',games:GAMES.map(game=>{const rows=[...live.values()].filter(r=>r.game===game),unique=items=>new Set(items.flat()).size,today=data.days[date]?.[game];const seen=new Set(days.filter(d=>d<date).flatMap(d=>data.days[d][game]?.players||[]));return {game,playing:unique(rows.filter(r=>r.phase==='playing').map(r=>r.players)),waiting:unique(rows.filter(r=>r.phase==='waiting').map(r=>r.players)),onlinePlayers:unique(rows.filter(r=>r.source==='online'&&r.phase==='playing').map(r=>r.players)),practiceBrowsers:unique(rows.filter(r=>r.source==='practice'&&r.phase==='playing').map(r=>r.players)),tables:rows.filter(r=>r.source==='online'&&r.phase==='playing'&&r.players.length).length,spectators:rows.reduce((n,r)=>n+r.spectators,0),dailyPlayers:today?.players.length||0,monthlyPlayers:unique(month.map(d=>data.days[d][game]?.players||[])),returningToday:(today?.players||[]).filter(p=>seen.has(p)).length,visitorsToday:today?.visitors.length||0,startedToday:today?.started||0,completedToday:today?.completed||0,abandonedToday:today?.abandoned||0}}),history:days.map(date=>({date,games:Object.fromEntries(GAMES.map(g=>{const b=data.days[date][g];return[g,{players:b.players.length,visitors:b.visitors.length,started:b.started,completed:b.completed,abandoned:b.abandoned}]}))}))}}
 return {observe,visit,summary,persist};
}
function installAnalytics(app,options={}){
 const analytics=createAnalytics(options),express=require('express');
 const secret=()=>process.env.ANALYTICS_ADMIN_TOKEN;
 function authorize(req,res,next){res.set('Cache-Control','no-store');const token=(req.get('authorization')||'').replace(/^Bearer /,'');const expected=secret();if(!expected)return res.status(503).json({error:'Owner analytics access has not been configured.'});if(!crypto.timingSafeEqual(crypto.createHash('sha256').update(token).digest(),crypto.createHash('sha256').update(expected).digest()))return res.status(401).json({error:'Owner access required.'});next()}
 app.get('/api/analytics/summary',authorize,(req,res)=>res.json(analytics.summary()));
 const rates=new Map();
 function ingestion(req,res,next){let origin;try{origin=new URL(req.get('origin'))}catch{return res.sendStatus(403)}if(origin.host!==req.get('host'))return res.sendStatus(403);const key=req.socket.remoteAddress,t=Date.now();let r=rates.get(key);if(!r||t-r.at>=60000){r={at:t,count:0};rates.set(key,r)}if(++r.count>600)return res.sendStatus(429);for(const [k,r]of rates)if(t-r.at>60000)rates.delete(k);const {game,id}=req.body||{};if(!GAMES.includes(game)||typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return res.sendStatus(400);next()}
 app.post('/api/analytics/visit',express.json({limit:'1kb'}),ingestion,(req,res)=>{analytics.visit(req.body.game,req.body.id);res.sendStatus(204)});
 app.post('/api/analytics/practice',express.json({limit:'1kb'}),ingestion,(req,res)=>{const {game,id,match,complete}=req.body;if(typeof match!=='string'||!/^[a-f0-9-]{36}$/.test(match)||typeof complete!=='boolean')return res.sendStatus(400);analytics.observe(game,'practice:'+id+':'+match,{phase:complete?'finished':'playing',players:[id],match,complete,source:'practice'});res.sendStatus(204)});
 app.get('/owner/analytics',(req,res)=>res.sendFile(path.join(__dirname,'analytics-dashboard.html')));
 const timer=setInterval(()=>{try{analytics.persist()}catch(e){console.error('Analytics persistence failed',e.message)}},60000);timer.unref();return analytics;
}
function identity(headers,fallback){const match=(headers?.cookie||'').match(/(?:^|;\s*)jv_analytics_browser=([a-f0-9-]{36})(?:;|$)/);return match?match[1]:fallback}
let sampler=null,pending=false;function setSampler(fn){sampler=fn}function changed(){if(pending||!sampler)return;pending=true;setImmediate(()=>{pending=false;sampler?.()})}
module.exports={createAnalytics,installAnalytics,identity,setSampler,changed};
