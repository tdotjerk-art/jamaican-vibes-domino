const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function boot(initialName,blockedStorage=false){
 const nodes={},saved=new Map(initialName?[['jv-draff-player-name-v1',initialName]]:[]);let rendered=0;
 const get=id=>nodes[id]||(nodes[id]={value:'',textContent:'',hidden:false});
 const context=vm.createContext({document:{getElementById:get},localStorage:{getItem:k=>{if(blockedStorage)throw Error('Storage unavailable');return saved.get(k)},setItem:(k,v)=>{if(blockedStorage)throw Error('Storage unavailable');saved.set(k,v)}},render:()=>rendered++});
 vm.runInContext(fs.readFileSync('public/draff/profile.js','utf8'),context);
 const submit=name=>{get('playerName').value=name;get('nameForm').onsubmit({preventDefault(){}});};
 return {get,saved,submit,profile:context.DraffProfile,rendered:()=>rendered};
}
test('Draff requires a name, remembers it on the device and unlocks play after login',()=>{
 const ui=boot();assert.equal(ui.profile.ready(),false);assert.equal(ui.get('draffGame').hidden,true);assert.equal(ui.get('draffGame').inert,true);
 ui.submit('  ');assert.equal(ui.profile.ready(),false);assert.match(ui.get('nameError').textContent,/Enter your name/);
 let loggedIn=0;ui.profile.onLogin=()=>loggedIn++;ui.submit('  Junior   Brown  ');
 assert.equal(ui.profile.name(),'Junior Brown');assert.equal(ui.get('draffGame').hidden,false);assert.equal(ui.get('draffGame').inert,false);assert.equal(ui.get('nameLogin').hidden,true);
 assert.equal(loggedIn,1);assert.equal(ui.rendered(),1);assert.equal(ui.get('signedInName').textContent,'Playing as Junior Brown');
 const again=boot(ui.saved.get('jv-draff-player-name-v1'));assert.equal(again.profile.name(),'Junior Brown');assert.equal(again.get('nameLogin').hidden,true);
});
test('name login works without browser storage and writes names as text',()=>{
 const ui=boot(null,true);ui.submit('<b>Junior</b>');assert.equal(ui.profile.name(),'<b>Junior</b>');assert.equal(ui.get('signedInName').textContent,'Playing as <b>Junior</b>');
 ui.submit('J'.repeat(40));assert.equal(ui.profile.name().length,24);
});
