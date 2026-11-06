'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),R=require('./public/ludi/report');
function createReports(storageDir){
 const dir=storageDir?path.join(storageDir,'reports'):null,memory=new Map();
 if(dir)fs.mkdirSync(dir,{recursive:true,mode:0o700});
 let count=dir?fs.readdirSync(dir).filter(n=>/^[a-f0-9]{24}\.json$/.test(n)).length:0;
 return {save(input,server=null){
  const report=R.clean(input),id=crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex').slice(0,24);
  const file=dir?path.join(dir,id+'.json'):null;
  if(file&&fs.existsSync(file)){const existing=JSON.parse(fs.readFileSync(file,'utf8'));if(existing.id!==id)throw Error('Invalid saved problem report.');return {id,saved:true,savedAt:existing.savedAt}}
  if(memory.has(id))return memory.get(id);
  if(count>=1000)throw Error('Problem report storage is full.');
  const savedAt=Date.now(),record={id,savedAt,report,server:server?{revision:server.revision,receivedAt:Date.now(),state:R.state(server.state)}:null};
  if(file){
   const temporary=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
   try{const fd=fs.openSync(temporary,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(record));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(temporary,file);const directoryFd=fs.openSync(dir,'r');try{fs.fsyncSync(directoryFd)}finally{fs.closeSync(directoryFd)}}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary)}
  }
  count++;const receipt={id,saved:true,savedAt};if(!file)memory.set(id,receipt);return receipt;
 }};
}
module.exports={createReports};
