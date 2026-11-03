const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function boot({reduced=false}={}){
 let animations=0,knocks=0;const tasks=new Map(),muted=new Set();let next=0;
 const el={isConnected:true,animate(){animations++}},table={animate(){animations++}};
 const node=()=>({connect(){},disconnect(){},gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},start(){},stop(){}});
 class AudioContext{constructor(){this.state='running';this.currentTime=0;this.sampleRate=100}createBuffer(){return {getChannelData:()=>new Float32Array(9)}}createBufferSource(){knocks++;return node()}createBiquadFilter(){return {...node(),frequency:{value:0}}}createGain(){return node()}createOscillator(){return node()}}
 const ctx={window:{AudioContext,matchMedia:()=>({matches:reduced}),JVSound:{enabled:k=>!muted.has(k)},addEventListener(){}},document:{hidden:false,addEventListener(){},querySelector:s=>s==='.table'?table:el},setTimeout:fn=>{tasks.set(++next,fn);return next},clearTimeout:id=>tasks.delete(id)};
 vm.runInNewContext(fs.readFileSync('public/domino-energy.js','utf8'),ctx);
 return {observe:ctx.window.JVDominoEnergy.observe,muted,el,flush(){for(const fn of [...tasks.values()])fn();tasks.clear()},get animations(){return animations},get knocks(){return knocks},get pending(){return tasks.size}};
}
const tile=(order=1,double=false)=>({playedOrder:order,a:3,b:double?3:5});
test('one landing and one delayed impact per play, even across duplicate online snapshots',()=>{
 const x=boot(),tiles=[tile()];x.observe(tiles,1,{online:true});x.observe(tiles,1,{online:true});assert.equal(x.animations,1);assert.equal(x.knocks,0);x.flush();assert.equal(x.knocks,1);x.observe([...tiles,tile(2,true)],1,{online:true});x.flush();assert.equal(x.knocks,2);assert.equal(x.animations,3);
});
test('next hand restarts the order and cancels impacts from the previous hand',()=>{
 const x=boot();x.observe([tile()],1);assert.equal(x.pending,1);x.observe([],2);assert.equal(x.pending,0);x.observe([tile()],2);x.flush();assert.equal(x.knocks,1);
});
test('reconnection does not replay existing board history',()=>{
 const x=boot();x.observe([tile(),tile(2)],1,{online:true});x.flush();assert.equal(x.knocks,0);x.observe([tile(),tile(2),tile(3)],1,{online:true});x.flush();assert.equal(x.knocks,1);
});
test('mute takes effect before impact; disconnected tiles cannot produce stale impacts',()=>{
 const x=boot();x.observe([tile()],1);x.muted.add('play');x.flush();assert.equal(x.knocks,0);x.muted.clear();x.observe([tile(),tile(2)],1);x.el.isConnected=false;x.flush();assert.equal(x.knocks,0);
});
test('reduced motion preserves impact audio without tile or table movement',()=>{
 const x=boot({reduced:true});x.observe([tile(1,true)],1);x.flush();assert.equal(x.knocks,1);assert.equal(x.animations,0);
});
test('disabling double effects preserves ordinary placement sound',()=>{
 const x=boot();x.muted.add('double');x.observe([tile(1,true)],1);x.flush();assert.equal(x.knocks,1);
});
