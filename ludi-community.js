'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const E=require('./public/ludi/engine');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const idOK=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
function createCommunity(directory){
 const profiles=new Map(),results=new Map(),totals=new Map();
 const root=directory?path.join(directory,'community'):null;
 function write(folder,id,value){
  if(!root)return;
  const dir=path.join(root,folder);fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file=path.join(dir,id+'.json'),temporary=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  try{const fd=fs.openSync(temporary,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(temporary,file);const d=fs.openSync(dir,'r');try{fs.fsyncSync(d)}finally{fs.closeSync(d)}}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary)}
 }
 function load(folder,valid,apply){
  if(!root||!fs.existsSync(path.join(root,folder)))return;
  for(const name of fs.readdirSync(path.join(root,folder))){if(!/^[a-f0-9]{32}\.json$/.test(name))continue;const row=JSON.parse(fs.readFileSync(path.join(root,folder,name),'utf8'));if(!valid(row)||row.id+'.json'!==name)throw Error('Invalid saved LUDI '+folder+' record');apply(row)}
 }
 function credit(result){
  if(results.has(result.id))return;
  results.set(result.id,result);
  for(const player of result.players){const stats=totals.get(player.id)||{games:0,wins:0};stats.games++;if(player.id===result.winner)stats.wins++;totals.set(player.id,stats)}
 }
 load('profiles',p=>p&&idOK(p.id)&&E.cleanName(p.name)===p.name&&!!p.name&&/^[a-f0-9]{64}$/.test(p.key)&&Number.isFinite(p.createdAt),p=>profiles.set(p.id,p));
 load('results',validResult,credit);
 function publicProfile(p){const stats=totals.get(p.id)||{games:0,wins:0};return {id:p.id,name:p.name,...stats,losses:stats.games-stats.wins,winRate:stats.games?Math.round(stats.wins/stats.games*100):0}}
 function authenticate(id,token){
  const p=profiles.get(id);if(!p||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!crypto.timingSafeEqual(Buffer.from(p.key,'hex'),Buffer.from(hash(token),'hex'))){const error=Error('Player profile could not be recovered. Use your recovery code or create a new profile.');error.status=403;throw error}return p;
 }
 return {
  create(name){name=E.cleanName(name);if(!name){const error=Error('Enter your name to save a player profile.');error.status=400;throw error}const token=crypto.randomBytes(32).toString('hex'),p={id:crypto.randomBytes(16).toString('hex'),key:hash(token),name,createdAt:Date.now()};write('profiles',p.id,p);profiles.set(p.id,p);return {profile:publicProfile(p),token}},
  authenticate,
  profile(id,token,name){let p=authenticate(id,token);if(name!==undefined){name=E.cleanName(name);if(!name){const e=Error('Enter your player name.');e.status=400;throw e}if(name!==p.name){p={...p,name};write('profiles',p.id,p);profiles.set(p.id,p)}}return publicProfile(p)},
  hasResult:id=>results.has(id),
  record(result){if(!validResult(result))throw Error('Invalid LUDI result');if(results.has(result.id))return;write('results',result.id,result);credit(result)},
  leaderboard(){return [...profiles.values()].filter(p=>totals.has(p.id)).map(publicProfile).sort((a,b)=>b.wins-a.wins||b.winRate-a.winRate||b.games-a.games||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).slice(0,20)}
 };
}
function validResult(r){return r&&idOK(r.id)&&Number.isFinite(r.at)&&Array.isArray(r.players)&&r.players.length>=2&&r.players.length<=4&&r.players.every(p=>p&&idOK(p.id)&&!!p.name&&E.cleanName(p.name)===p.name)&&new Set(r.players.map(p=>p.id)).size===r.players.length&&r.players.some(p=>p.id===r.winner)}
module.exports={createCommunity,validResult,idOK};
