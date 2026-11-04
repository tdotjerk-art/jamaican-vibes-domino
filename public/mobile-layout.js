/* Phone geometry is calculated in one coordinate system. Artwork and rules stay unchanged. */
(function(root){
  function arrange(board,openingId,width,height,long){
    const short=long*.51,gap=1.5,placed=[];
    let anchor=board.findIndex(t=>t.id===openingId);if(anchor<0)anchor=0;
    const opening=board[anchor];if(!opening)return placed;
    const dims=o=>o==='v'?{w:short,h:long}:{w:long,h:short};
    const startO=opening.a===opening.b?'v':'h';
    function put(t,x,y,o,touch,match){
      const a=t.faceA??t.a,b=t.faceB??t.b;
      const flip=touch&&(touch==='left'||touch==='top'?a!==match:b!==match);
      placed.push({t,x,y,o,flip:!!flip,...dims(o)});
    }
    put(opening,0,0,startO,false);
    function branch(items,dir,vertical){
      let x=0,y=0,prev=dims(startO),rowDir=dir;
      const edge=width/2-gap;
      for(const t of items){
        const o=t.a===t.b?'v':'h',d=dims(o),match=dir<0?t.b:t.a;
        const nx=x+rowDir*(prev.w/2+gap+d.w/2);
        if(Math.abs(nx)+d.w/2<=edge){
          x=nx;put(t,x,y,o,rowDir>0?'left':'right',match);prev=d;
        }else{
          // One upright domino turns the chain; the next row travels back across the felt.
          x+=rowDir*(prev.w/2-short/2);
          y+=vertical*(prev.h/2+gap+long/2);
          put(t,x,y,'v',vertical>0?'top':'bottom',match);
          prev=dims('v');rowDir=-rowDir;
          // A full row pitch leaves room for a double anywhere on the return row.
          y+=vertical*(long/2-short/2);
        }
      }
    }
    branch(board.slice(0,anchor).reverse(),-1,-1);
    branch(board.slice(anchor+1),1,1);
    const minX=Math.min(...placed.map(p=>p.x-p.w/2)),maxX=Math.max(...placed.map(p=>p.x+p.w/2));
    const minY=Math.min(...placed.map(p=>p.y-p.h/2)),maxY=Math.max(...placed.map(p=>p.y+p.h/2));
    const dx=width/2-(minX+maxX)/2,dy=height/2-(minY+maxY)/2;
    placed.forEach(p=>{p.x+=dx;p.y+=dy;});
    placed.bounds={width:maxX-minX,height:maxY-minY};return placed;
  }
  function layout(board,openingId,width,height,preferredLong=48){
    // Start at the dealt-hand size; shrink only when the actual chain needs it.
    let long=preferredLong,result=arrange(board,openingId,width,height,long);
    while((result.bounds?.width>width-4||result.bounds?.height>height-4)&&long>4){
      long=Math.max(4,long-1);result=arrange(board,openingId,width,height,long);
    }
    return {long,short:long*.51,placed:result};
  }
  function render(host,board,openingId,tileEl){
    const preferred=parseFloat(getComputedStyle(host.closest('.table')).getPropertyValue('--dealt-long'))||48;
    const geometry=layout(board,openingId,host.clientWidth,host.clientHeight,preferred);
    for(const p of geometry.placed){
      const el=tileEl(p.t,p.o,null,p.flip);
      el.style.setProperty('--played-pw',geometry.short+'px');el.style.setProperty('--played-ph',geometry.long+'px');
      el.style.position='absolute';el.style.left=(p.x-geometry.short/2)+'px';el.style.top=(p.y-geometry.long/2)+'px';
      if(p.t.playedOrder!==undefined)el.dataset.playedOrder=p.t.playedOrder;
      host.appendChild(el);
    }
  }
  function frame(width,height,safeTop=0,safeBottom=0){
    const tableWidth=width*.96;
    const baselineHeight=width>height?Math.min(width*.539328,height-56):Math.max(560,height-105);
    const long=1.15*1.584*Math.min(96,(tableWidth*.053-4)/.54,baselineHeight*.11);
    const handHeight=Math.max(20,long);
    // On short landscape screens the top hand shares the controls strip.
    // Feedback floats beside the bottom hand, so neither needs an extra row.
    const sharedTop=width>height&&height<=520;
    const topBudget=sharedTop?Math.max(32,handHeight+4):32;
    const topHandRow=sharedTop?0:handHeight+6;
    const tableHeight=Math.max(40,height-topBudget-safeTop-safeBottom-topHandRow-2);
    const artHeight=Math.max(1,(tableHeight-handHeight-10)/.675);
    const artTop=6-artHeight*.125;
    const originalFeltTop=artTop+artHeight*.184;
    const originalFeltBottom=artTop+artHeight*.733;
    const centre=(originalFeltTop+originalFeltBottom)/2;
    const requestedSpan=(originalFeltBottom-originalFeltTop)*1.2;
    // Expand the playing surface toward Players 1 and 3, retaining visible wood.
    const rimTop=artTop+artHeight*.125;
    const rimBottom=artTop+artHeight*.8;
    const feltTop=Math.max(rimTop+4,centre-requestedSpan/2);
    const feltBottom=Math.min(rimBottom-4,centre+requestedSpan/2);
    return {long:handHeight,short:handHeight*.54,tableHeight,topBudget,sharedTop,bottomOverhang:0,
      artHeight,artTop,feltTop,feltBottom:tableHeight-feltBottom,
      boardTop:feltTop+8,boardBottom:tableHeight-feltBottom+8,
      topLight:10,bottomLight:tableHeight-handHeight-8};
  }
function partnerWin(r,winnerSeat){
 const team=winnerSeat%2;
 const other=1-team;
 const points=r.handValue===2?2:1;

 if(r.oneOnePlayTwo){
   r.oneOnePlayTwo=false;
   r.bruckStartTeam=team;
   r.bruckStartCount=2;
   r.teamScores=[0,0];
   r.teamScores[team]=2;
   r.nextPlayFor=1;
   return {team,count:2,won:false,bruck:false,oneOneResolved:true};
 }

 if(r.bruckStartTeam===null || r.bruckStartCount===0){
   r.bruckStartTeam=team;
   r.bruckStartCount=points;
   r.teamScores=[0,0];
   r.teamScores[team]=points;
   r.nextPlayFor=1;
   return {team,count:points,won:false,bruck:false,oneOne:false};
 }

 if(r.bruckStartTeam===team){
   // Six is the hard finish line. Never allow the winning score to pass 6.
   r.bruckStartCount=Math.min(6,r.bruckStartCount+points);
   r.teamScores=[0,0];
   r.teamScores[team]=r.bruckStartCount;
   r.nextPlayFor=1;
   return {team,count:r.bruckStartCount,won:r.bruckStartCount===6,bruck:false,oneOne:false};
 }

 if(r.bruckStartCount===1 && points===2){
   r.oneOnePlayTwo=false;r.bruckStartTeam=team;r.bruckStartCount=2;
   r.teamScores=[0,0];r.teamScores[team]=2;r.nextPlayFor=1;
   return {team,count:2,won:false,bruck:false,oneOne:false};
 }
 if(r.bruckStartCount===1){
   r.oneOnePlayTwo=true;
   r.bruckStartTeam=null;
   r.bruckStartCount=0;
   r.teamScores=[1,1];
   r.nextPlayFor=2;
   return {team,count:1,won:false,bruck:false,oneOne:true};
 }

 r.oneOnePlayTwo=false;
 r.doubleSixPoseAfterBruck=true;
 r.lastWinnerTeam=null;
 r.bruckStartTeam=null;
 r.bruckStartCount=0;
 r.scores=[0,0,0,0];
 r.teamScores=[0,0];
 r.nextPlayFor=1;
 return {team,count:0,won:false,bruck:true,oneOne:false};
}
  function mount(){
    const lobbyOptions=document.getElementById('jvLobbyOptions');
    if(lobbyOptions){
      const settings=document.createElement('details');
      const summary=document.createElement('summary');
      summary.textContent='Table settings';
      lobbyOptions.before(settings);
      settings.append(summary,lobbyOptions);
      const ready=document.getElementById('jvReady');
      const actions=document.createElement('div');
      actions.id='jvLobbyActions';
      ready.before(actions);
      actions.append(ready,document.getElementById('jvLeave'));
    }
    const app=document.querySelector('.app'),table=document.querySelector('.table');if(!app||!table)return;
    // Both local result paths use the actual value of the hand after a blocked tie.
    root.applyOfflineBruckAndStartWin=function(winner){
      const state={handValue,bruckStartTeam:offlineBruckTeam,bruckStartCount:offlineBruckCount,
        oneOnePlayTwo:offlineOneOnePlayTwo,nextPlayFor:offlineNextPlayFor,teamScores:[scores[0],scores[1]],scores:[0,0,0,0]};
      const result=partnerWin(state,winner);
      offlineBruckTeam=state.bruckStartTeam;offlineBruckCount=state.bruckStartCount;
      offlineOneOnePlayTwo=state.oneOnePlayTwo;offlineNextPlayFor=state.nextPlayFor;
      if(result.oneOne)tiedCarry=true;
      scores[0]=state.teamScores[0];scores[1]=state.teamScores[1];
      return result;
    };
    // Match Setup belongs on the home menu, outside the in-game toolbar.
    const setup=document.getElementById('jvMatchSetupBtn');
    const menu=document.querySelector('#jvHome .jv-grid');
    if(setup&&menu){
      setup.classList.add('jv-btn');
      setup.textContent='⚙ MATCH SETUP';
      menu.appendChild(setup);
      setup.onclick=()=>document.getElementById('jvSingle')?.click();
    }
    // Move only the poser-choice card; buttons keep their normal tap behavior.
    let poseDrag=null;
    function positionPose(card,x,y){
      const box=card.getBoundingClientRect();
      card.style.setProperty('--pose-left',Math.max(8,Math.min(x,innerWidth-box.width-8))+'px');
      card.style.setProperty('--pose-top',Math.max(8,Math.min(y,innerHeight-box.height-8))+'px');
    }
    document.addEventListener('pointerdown',event=>{
      const card=event.target.closest('#card.partner-pose-choice');
      if(!card||event.target.closest('button,input,select,a')||event.button!==0)return;
      const box=card.getBoundingClientRect();
      poseDrag={card,id:event.pointerId,dx:event.clientX-box.left,dy:event.clientY-box.top};
      card.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    document.addEventListener('pointermove',event=>{
      if(!poseDrag||event.pointerId!==poseDrag.id)return;
      positionPose(poseDrag.card,event.clientX-poseDrag.dx,event.clientY-poseDrag.dy);
    });
    const stopPoseDrag=()=>{poseDrag=null;};
    document.addEventListener('pointerup',stopPoseDrag);
    document.addEventListener('pointercancel',stopPoseDrag);
    document.addEventListener('lostpointercapture',stopPoseDrag);
    root.addEventListener('resize',()=>{
      const card=document.querySelector('#card.partner-pose-choice');
      if(card){const box=card.getBoundingClientRect();positionPose(card,box.left,box.top);}
    });
    const actions=document.createElement('div');actions.id='jvGameActions';
    const feedback=document.createElement('div');feedback.id='jvGameFeedback';feedback.setAttribute('aria-live','polite');
    app.insertBefore(actions,table);app.insertBefore(feedback,table);
    // Give the top hand and advertising their own rows so neither can cover a hand.
    const topHand=document.getElementById('hand3'),ticker=document.getElementById('contactTicker');
    // Keep the top hand outside the playing surface, in its own row.
    if(topHand)table.before(topHand);
    if(ticker)table.after(ticker);
    const placements=[];
    for(const [target,ids] of [[actions,['jvQuitGameBtn','jvFeatureToolbar']],[feedback,['onlineWaiting','jvStreakBadge','jvCoach','status']]]){
      for(const id of ids){const el=document.getElementById(id);if(!el)continue;
        const marker=document.createComment('phone placement: '+id);el.before(marker);placements.push({el,marker,target});
      }
    }
    const mobile=matchMedia('(max-width: 1000px) and (pointer: coarse), (max-width: 760px), (max-height: 520px)');
    const position=()=>{for(const {el,marker,target} of placements){if(mobile.matches)target.appendChild(el);else marker.after(el);}};
    mobile.addEventListener('change',position);position();
    // Restore the original desktop DOM positions when the viewport grows.
    const resize=new ResizeObserver(()=>{if(typeof root.renderPhotoTemplateBoard==='function')root.renderPhotoTemplateBoard();});
    resize.observe(document.getElementById('board'));
    // Budget every row against the actual visible iPhone viewport, including browser bars.
    let fitQueued=false;
    function fitFrame(){
      fitQueued=false;
      const width=root.visualViewport?.width||root.innerWidth;
      const height=root.visualViewport?.height||root.innerHeight;
      const appStyle=getComputedStyle(app);
      const safeTop=parseFloat(appStyle.getPropertyValue('--screen-safe-top'))||0;
      const safeBottom=parseFloat(appStyle.paddingBottom)||0;
      const geometry=frame(width,height,safeTop,safeBottom);
      app.style.setProperty('--fit-top-budget',geometry.topBudget+'px');
      for(const key of ['artHeight','artTop','feltTop','feltBottom','boardTop','boardBottom','topLight','bottomLight']){
        table.style.setProperty('--fit-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),geometry[key]+'px');
      }
      document.documentElement.style.setProperty('--fit-viewport-height',height+'px');
      table.style.setProperty('--fit-table-height',geometry.tableHeight+'px');
      app.style.setProperty('--fit-bottom-overhang',geometry.bottomOverhang+'px');
      for(const el of [table,topHand]){
        if(!el)continue;
        el.style.setProperty('--fit-dealt-long',geometry.long+'px');
        el.style.setProperty('--fit-dealt-short',geometry.short+'px');
      }
      requestAnimationFrame(()=>{if(typeof root.render==='function')root.render();});
    }
    function requestFit(){if(!fitQueued){fitQueued=true;requestAnimationFrame(fitFrame)}}
    root.addEventListener('resize',requestFit);
    root.addEventListener('orientationchange',requestFit);
    root.visualViewport?.addEventListener('resize',requestFit);
    fitFrame();
  }
  root.JVMobileLayout={layout,render,mount,frame,partnerWin};
  if(typeof module!=='undefined')module.exports={layout,frame,partnerWin};
})(typeof window!=='undefined'?window:globalThis);
