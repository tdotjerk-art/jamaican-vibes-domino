const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync('public/sound-settings.js','utf8');
function boot(storage={}){
 const master={checked:storage.jvSound!=='off'};
 const context={localStorage:{getItem:k=>storage[k]??null,setItem:(k,v)=>storage[k]=v},document:{getElementById:id=>id==='jvSound'?master:null,querySelectorAll:()=>[],addEventListener(){}},window:{dispatchEvent(){}},Event:class{}};
 vm.createContext(context);vm.runInContext(source,context);return {api:context.window.JVSound,master,storage};
}
test('each sound mutes independently, persists after reload, and survives master mute',()=>{
 const {api,master,storage}=boot();
 const kinds=['play','double','pass','ready','last','hand','blocked','bruck','six','match','achievement','crowd','ambience'];
 for(const kind of kinds){api.set(kind,true);assert.equal(api.enabled(kind),true);api.set(kind,false);assert.equal(api.enabled(kind),false);api.set(kind,true)}
 api.set('pass',false);assert.equal(api.enabled('play'),true);master.checked=false;
 for(const kind of kinds)assert.equal(api.enabled(kind),false);
 master.checked=true;assert.equal(api.enabled('pass'),false);assert.equal(api.enabled('play'),true);
 assert.equal(boot(storage).api.enabled('pass'),false);assert.equal(boot(storage).api.enabled('play'),true);
});
test('existing crowd and ambience choices migrate and unavailable storage does not break settings',()=>{
 const x=boot({jvCompleteSettings:JSON.stringify({crowd:false,ambience:true})});assert.equal(x.api.get('crowd'),false);assert.equal(x.api.get('ambience'),true);
 assert.equal(boot({jvSoundSettings:'invalid'}).api.enabled('play'),true);
});
test('online, local and Extras engines gate generated audio by the selected category',()=>{
 const html=fs.readFileSync('index.html','utf8');let allowed=new Set(),tones=0,noises=0;
 const context={window:{JVSound:{enabled:k=>allowed.has(k)}},soundOn:true,tone:()=>tones++,noise:()=>noises++,activeSoundKind:null};vm.createContext(context);
 const playFX=html.match(/  function playFX\(kind\)\{[\s\S]*?\n  \}/)[0];vm.runInContext(playFX,context);
 context.playFX('play');assert.equal(tones,0);allowed.add('pass');context.playFX('pass');assert.equal(tones,2);context.playFX('play');assert.equal(tones,2);
 const extraTone=html.match(/function tone\(f,d=\.08[\s\S]*?\n\}/)[0];vm.runInContext(extraTone,context);context.audioContext=()=>{throw Error('disabled category reached audio')};context.activeSoundKind='double';context.tone(100);
 const online=html.match(/  function playSound\(kind\)\{[\s\S]*?\n  \}/)[0];assert.ok(online.includes('JVSound.enabled(kind)'));
 const noise=html.match(/function noise\(duration[\s\S]*?\n\}/)[0];assert.ok(noise.includes("JVSound.enabled('crowd')"));
});
