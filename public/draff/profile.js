// Names identify players on the table. Room tokens still protect saved seats.
var DraffProfile=(()=>{
 const key='jv-draff-player-name-v1';
 const clean=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f]/g,'').replace(/\s+/g,' ').trim().slice(0,24):'';
 let name='';try{name=clean(localStorage.getItem(key))}catch{}
 const profile={name:()=>name,ready:()=>!!name,onLogin:null};
 const $=id=>document.getElementById(id);
 function show(){
  $('nameLogin').hidden=!!name;$('draffGame').hidden=!name;$('draffGame').inert=!name;
  $('playerBar').hidden=!name;$('signedInName').textContent=name?'Playing as '+name:'';
 }
 $('nameForm').onsubmit=event=>{
  event.preventDefault();const value=clean($('playerName').value);
  if(!value){$('nameError').textContent='Enter your name to play.';return;}
  name=value;$('playerName').value=name;$('nameError').textContent='';
  try{localStorage.setItem(key,name)}catch{}
  show();render();profile.onLogin?.();
 };
 show();return profile;
})();
