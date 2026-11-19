'use strict';
// Isolated Chromium viewport smoke for the credit pilot. Never touches production.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fork}=require('node:child_process');
const {chromium}=require('playwright');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'domino-browser-'));
 const secret='b'.repeat(48);
 const child=fork(path.join(__dirname,'../test-support/credit-server.js'),[],{
  env:{...process.env,RENDER:'false',DOMINO_CREDITS_ENABLED:'true',DOMINO_CREDIT_STORAGE:'sqlite',
   DOMINO_CREDIT_DB_PATH:path.join(dir,'wallet.sqlite'),DOMINO_TOURNAMENT_ADMIN_TOKEN:secret},
  stdio:['ignore','inherit','inherit','ipc']
 });
 let browser;
 try{
  const port=await new Promise((resolve,reject)=>{
   let timer=setTimeout(()=>reject(Error('Local server did not start')),12000);
   child.once('message',m=>{clearTimeout(timer);resolve(m.port)});
   child.once('exit',c=>{clearTimeout(timer);reject(Error('Server exited '+c))});
  });
  const url='http://127.0.0.1:'+port;
  const api=async(route,payload={},admin=false)=>{
   const response=await fetch(url+'/api/domino/wallet/'+route,{
    method:'POST',headers:{'content-type':'application/json',...(admin?{authorization:'Bearer '+secret}:{})},
    body:JSON.stringify(payload)
   });
   const value=await response.json();
   assert.equal(response.status,200,route+': '+JSON.stringify(value));return value;
  };
  const names=['PhoneOne','PhoneTwo'];
  const accounts=[];
  for(const name of names)accounts.push(await api('register',{name}));
  await api('tournaments',{id:'browser_round',capacity:2,playerCount:2},true);
  for(const acct of accounts)await api('tournaments/browser_round/join',{id:acct.account.id,token:acct.token});
  await api('tournaments/browser_round/start',{},true);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const modes=[{name:'portrait',width:390,height:844},{name:'landscape',width:844,height:390}];
  for(const mode of modes){
   const contexts=[];
   const pages=[];
   try{
    for(let i=0;i<2;i++){
     // Real players use independent browser profiles and local storage.
     const context=await browser.newContext({viewport:{width:mode.width,height:mode.height},
      isMobile:true,hasTouch:true,deviceScaleFactor:3});contexts.push(context);
     const page=await context.newPage();pages.push(page);
     await page.addInitScript(({name,credentials})=>{
      localStorage.setItem('jvSignupName',name);
      sessionStorage.setItem('jvDominoWalletAccount',JSON.stringify(credentials));
     },{name:names[i],credentials:{id:accounts[i].account.id,token:accounts[i].token}});
     await page.goto(url,{waitUntil:'domcontentloaded'});
     await page.locator('#jvOnline').click();
     await page.locator('#jvWalletPanel').waitFor();
     await page.locator('#jvTournamentDetails').evaluate(el=>el.open=true);
     await page.locator('#jvTournamentMineRefresh').click();
     const button=page.getByRole('button',{name:/Play round 1, match 1/i});
     await button.waitFor({state:'visible',timeout:10000});
     const box=await button.boundingBox();
     assert.ok(box&&box.width>=40&&box.height>=36,mode.name+': Play Round button too small');
     await button.click();
     // A full two-player fixture may start immediately as seat two joins.
     // In that case the lobby is correctly hidden in favor of the playing table.
     try { await page.waitForFunction(() =>
       (getComputedStyle(document.querySelector('#jvLobby')).display !== 'none' ||
       /Tournament seat assigned/.test(document.querySelector('#jvWalletStatus')?.textContent || '')),
       null,{timeout:12000}); }
     catch(error){
      const diagnostic=await page.evaluate(()=>({status:document.querySelector('#jvWalletStatus')?.textContent,
       setup:document.querySelector('#jvSetupStatus')?.textContent,
       connection:document.querySelector('#jvConnectionText')?.textContent,
       lobbyStyle:document.querySelector('#jvLobby')?.style.display,
       socket:window.getOnlineSocket?.()?.connected}));
      throw Error(mode.name+' player '+(i+1)+' join failed: '+JSON.stringify(diagnostic)+' / '+error.message);
     }
     const info=await page.evaluate(()=>{
      const el=document.querySelector('#jvLobby');
      const rect=el.getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,docWidth:document.documentElement.scrollWidth,
       lobbyTop:rect.top,lobbyWidth:rect.width,lobbyDisplay:getComputedStyle(el).display};
     });
     assert.ok(info.docWidth<=info.width+2,mode.name+': unexpected horizontal page scroll '+JSON.stringify(info));
     console.log(mode.name+' player '+(i+1)+': lobby connected; '+JSON.stringify(info));
    }
    await pages[0].waitForFunction(()=>{
     const status=document.querySelector('#jvWalletStatus')?.textContent||'';
     return /Tournament seat assigned/.test(status) ||
       document.querySelector('#jvLobby')?.style.display==='flex';
    },null,{timeout:10000});
    await pages[0].screenshot({path:'tournament-'+mode.name+'.png',fullPage:true});
   }finally{for(const context of contexts)await context.close()}
  }
  console.log('PASS: tournament Play Round browser seats and portrait/landscape viewport checks');
 }finally{if(browser)await browser.close();child.kill();await delay(300);fs.rmSync(dir,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
