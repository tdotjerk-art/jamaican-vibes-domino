const test=require('node:test');
const assert=require('node:assert/strict');
const {bindActivation,renderHand}=require('../public/domino-input');
function element(){
 const handlers={};
 return {dataset:{},style:{},tabIndex:-1,setAttribute(){},addEventListener(type,fn){handlers[type]=fn;},
  fire(type,values={}){const e={pointerType:'touch',pointerId:1,clientX:10,clientY:10,isPrimary:true,detail:1,preventDefault(){this.prevented=true;},...values};handlers[type]?.(e);return e;},
  remove(){const a=this.parent.children;a.splice(a.indexOf(this),1);this.parent=null;}};
}
function host(){return {children:[],mutations:0,insertBefore(el,before){this.mutations++;if(el.parent)el.remove();const i=before?this.children.indexOf(before):this.children.length;this.children.splice(i,0,el);el.parent=this;}};}
test('a touch release activates once even when the browser follows it with a click',()=>{
 const el=element();let plays=0;bindActivation(el,()=>plays++);
 el.fire('pointerdown');el.fire('pointerup');el.fire('click');
 assert.equal(plays,1);
});
test('scrolling and cancelled touches do not play a domino',()=>{
 const el=element();let plays=0;bindActivation(el,()=>plays++);
 el.fire('pointerdown');el.fire('pointermove',{clientX:50});el.fire('pointerup');el.fire('click');
 assert.equal(plays,0);
 el.fire('pointerdown');el.fire('pointercancel');el.fire('pointerup');el.fire('click');assert.equal(plays,0);
});
test('mouse and keyboard activation remain available',()=>{
 const el=element();let plays=0;bindActivation(el,()=>plays++);
 el.fire('click',{pointerType:'mouse'});el.fire('keydown',{key:'Enter'});el.fire('keydown',{key:' ',repeat:false});
 el.fire('keydown',{key:'Enter',repeat:true});assert.equal(plays,3);
});
test('redrawing a hand preserves pressed elements and activation uses the domino id',()=>{
 const h=host(),hand=[{id:10},{id:20},{id:30}],plays=[];
 const draw=tiles=>renderHand(h,tiles,element,id=>plays.push(id));
 draw(hand);const pressed=h.children[1],mutations=h.mutations;
 pressed.fire('pointerdown');draw(hand);
 assert.equal(h.children[1],pressed);assert.equal(h.mutations,mutations);
 pressed.fire('pointerup');assert.deepEqual(plays,['20']);
 draw(hand.slice(1));assert.equal(h.children[0],pressed);
 pressed.fire('click',{detail:0});assert.deepEqual(plays,['20','20']);
 assert.deepEqual(h.children.map(el=>el.dataset.dominoId),['20','30']);
});

test('online two-end buttons run valid commands for the selected domino',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 const start=html.indexOf('  window.humanChoose=function(i){');
 const code=html.slice(start,html.indexOf('  window.onlinePlaySelected=',start));
 let markup='';const plays=[];
 const ctx={window:{},isOnline:()=>true,onlineState:{phase:'playing'},turn:0,hands:[[{id:17,a:1,b:2}]],board:[{}],
  ends:()=>[1,2],show:s=>markup=s,$:()=>({classList:{add(){}}}),closeModal(){}};
 vm.createContext(ctx);vm.runInContext(code,ctx);ctx.window.humanChoose(0);
 ctx.window.onlinePlaySelected=(id,side)=>plays.push({id,side});
 const commands=Array.from(markup.matchAll(/onclick="([^"]*)"/g),m=>m[1]);
 assert.equal(commands.length,2);
 for(const cmd of commands)vm.runInContext(cmd,ctx);
 assert.deepEqual(plays,[{id:17,side:'left'},{id:17,side:'right'}]);
});
