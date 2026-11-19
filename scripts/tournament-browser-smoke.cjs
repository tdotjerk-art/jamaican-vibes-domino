'use strict';
// Isolated Chromium/WebKit viewport smoke for the credit pilot. Never touches production.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fork}=require('node:child_process');
const {chromium,webkit}=require('playwright');
const browserEngine=process.env.DOMINO_TEST_BROWSER==='webkit'?'webkit':'chromium';
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
  browser=await (browserEngine==='webkit'?webkit:chromium).launch(browserEngine==='webkit'?{headless:true}:{headless:true,args:['--no-sandbox']});
  const modes=[{name:'portrait',width:390,height:844},{name:'landscape',width:844,height:390}];
  for(const mode of modes){
   // Each rotation scenario is an independent tournament, since live
   // tournament seats must remain reserved after a browser disconnect.
   const shortTag=(browserEngine==='webkit'?'WK':'CR')+(mode.name==='portrait'?'P':'L');
   const names=['Phone'+shortTag+'One','Phone'+shortTag+'Two'];
   const accounts=[];
   const tournamentId='browser_'+browserEngine+'_'+mode.name;
   for(const name of names)accounts.push(await api('register',{name}));
   await api('tournaments',{id:tournamentId,capacity:2,playerCount:2},true);
   for(const acct of accounts)await api('tournaments/'+tournamentId+'/join',{id:acct.account.id,token:acct.token});
   await api('tournaments/'+tournamentId+'/start',{},true);
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
     if(i===0){
      // Exercise actual player-facing recovery rotation, then enter the
      // tournament using the newly saved credentials (not the revoked token).
      const previous=accounts[i].token;
      page.once('dialog',dialog=>dialog.accept());
      await page.locator('#jvWalletRotate').click();
      await page.waitForFunction(old=>{
       const value=document.querySelector('#jvWalletRecovery')?.value||'';
       return value.includes(':')&&!value.endsWith(':'+old);
      },previous,{timeout:10000});
      const newCode=await page.locator('#jvWalletRecovery').inputValue();
      const [id,token]=newCode.split(':');
      assert.equal(id,accounts[i].account.id);
      assert.match(token,/^[a-f0-9]{64}$/);
      accounts[i].token=token;
      const prior=await fetch(url+'/api/domino/wallet/me',{
       method:'POST',headers:{'content-type':'application/json'},
       body:JSON.stringify({id,token:previous})
      });
      assert.equal(prior.status,400,mode.name+': revoked code still authenticates');
      const session=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('jvDominoWalletAccount')));
      assert.equal(session.token,token,mode.name+': browser session did not switch to replacement code');
      console.log('PASS: '+mode.name+' UI recovery rotation revoked old code and retained tournament account');
     }
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
    // Rotate the SAME connected phone while its real tournament match is active.
    // This exercises layout reflow without reloading, reconnecting or discarding a board.
    for(let i=0;i<pages.length;i++){
     const page=pages[i];
     await page.waitForFunction(()=>
      window.getOnlineSocket?.()?.connected &&
      document.querySelector('#jvLobby')?.style.display==='none',
      null,{timeout:12000});
     // The deal animation intentionally covers the table and may temporarily
     // translate it offscreen. Test the settled playable viewport, not the stage.
     await page.waitForFunction(()=>{
      const stage=document.querySelector('#jvDealStage');
      if(!stage)return true;
      const css=getComputedStyle(stage);
      return css.display==='none'||css.visibility==='hidden'||css.opacity==='0';
     },null,{timeout:12000});
     const before=await page.evaluate(()=>({
      socketId:window.getOnlineSocket?.()?.id,
      board:document.querySelector('#board')?.textContent,
      boardChildren:document.querySelector('#board')?.children.length,
      phaseText:document.querySelector('#jvConnectionText')?.textContent
     }));
     const rotated=mode.name==='portrait'
       ?{width:844,height:390}:{width:390,height:844};
     await page.setViewportSize(rotated);
     await page.waitForTimeout(180);
     const after=await page.evaluate(()=>({
      viewportWidth:innerWidth,viewportHeight:innerHeight,
      docWidth:document.documentElement.scrollWidth,
      docHeight:document.documentElement.scrollHeight,
      bodyHeight:document.body.scrollHeight,
      ui:{home:getComputedStyle(document.querySelector('#jvHome')).display,
       app:getComputedStyle(document.querySelector('.app')).display,
       appVisibility:getComputedStyle(document.querySelector('.app')).visibility,
       onlineSetup:document.querySelector('#jvOnlineSetup')?getComputedStyle(document.querySelector('#jvOnlineSetup')).display:null,
       overlay:document.elementFromPoint(innerWidth/2,innerHeight/2)?.id||document.elementFromPoint(innerWidth/2,innerHeight/2)?.className||null,
       onlineMode:window.gameConnectionMode,
       appStyle:(()=>{const e=document.querySelector('.app'),c=getComputedStyle(e),r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,justify:c.justifyContent,align:c.alignItems,paddingTop:c.paddingTop,height:c.height,flexDirection:c.flexDirection,overflow:c.overflow,children:[...e.children].map(el=>{const x=el.getBoundingClientRect(),s=getComputedStyle(el);return {id:el.id,cls:String(el.className).slice(0,40),display:s.display,position:s.position,order:s.order,flex:s.flex,top:Math.round(x.top),bottom:Math.round(x.bottom),height:Math.round(x.height)}})}})()},
      screenParts:['#board','.app > .table','#hand1','#hand2','#hand3','#hand4']
       .map(selector=>{
        const el=document.querySelector(selector);
        if(!el)return {selector,found:false};
        const r=el.getBoundingClientRect(),style=getComputedStyle(el);
        return {selector,found:true,visible:style.display!=='none'&&style.visibility!=='hidden'&&!!el.getClientRects().length&&!!el.offsetParent,
         top:Math.round(r.top),bottom:Math.round(r.bottom),
         left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),height:Math.round(r.height)};
       }),
      socketId:window.getOnlineSocket?.()?.id,
      connected:window.getOnlineSocket?.()?.connected,
      lobbyVisible:getComputedStyle(document.querySelector('#jvLobby')).display!=='none',
      board:document.querySelector('#board')?.textContent,
      boardChildren:document.querySelector('#board')?.children.length
     }));
     assert.equal(after.connected,true,mode.name+' player '+(i+1)+': rotation disconnected online game');
     assert.equal(after.socketId,before.socketId,mode.name+' player '+(i+1)+': rotation unexpectedly changed socket');
     assert.equal(after.lobbyVisible,false,mode.name+' player '+(i+1)+': rotation reopened lobby during match');
     assert.ok(after.docWidth<=after.viewportWidth+2,
      mode.name+' player '+(i+1)+': rotation caused horizontal scrolling '+JSON.stringify(after));
     assert.notEqual(after.ui.home,'flex',
      mode.name+' player '+(i+1)+': home screen still shown after tournament match started '+JSON.stringify(after));
          assert.ok(after.docHeight<=after.viewportHeight+3,
      mode.name+' player '+(i+1)+': rotation requires vertical page scrolling '+JSON.stringify(after));
     await page.screenshot({path:'tournament-'+browserEngine+'-'+mode.name+'-rotated-player'+(i+1)+'.png',fullPage:true});
     for(const part of after.screenParts){
      if(!part.found||!part.visible||!part.width||!part.height)continue;
      assert.ok(part.top>=-3&&part.bottom<=after.viewportHeight+3,
       mode.name+' player '+(i+1)+': '+part.selector+' clipped vertically '+JSON.stringify(after));
     }
     assert.equal(after.boardChildren,before.boardChildren,
      mode.name+' player '+(i+1)+': rotation changed number of played dominoes');
     assert.equal(after.board,before.board,mode.name+' player '+(i+1)+': rotation changed displayed board');
     console.log('PASS: '+mode.name+' player '+(i+1)+' rotates in active match; '+JSON.stringify(after));
     await page.setViewportSize({width:mode.width,height:mode.height});
    }
    await pages[0].screenshot({path:'tournament-'+browserEngine+'-'+mode.name+'.png',fullPage:true});
   }finally{for(const context of contexts)await context.close()}
  }
  console.log('PASS: '+browserEngine+' tournament Play Round browser seats and portrait/landscape viewport checks');
 }finally{if(browser)await browser.close();child.kill();await delay(300);fs.rmSync(dir,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
