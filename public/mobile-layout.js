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
  function mount(){
    const app=document.querySelector('.app'),table=document.querySelector('.table');if(!app||!table)return;
    const actions=document.createElement('div');actions.id='jvGameActions';
    const feedback=document.createElement('div');feedback.id='jvGameFeedback';feedback.setAttribute('aria-live','polite');
    app.insertBefore(actions,table);app.insertBefore(feedback,table);
    // Give the top hand and advertising their own rows so neither can cover a hand.
    const topHand=document.getElementById('hand3'),ticker=document.getElementById('contactTicker');
    // Keep Player 3's hand inside the table: its mobile position is controlled by .table #hand3 CSS.
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
  }
  root.JVMobileLayout={layout,render,mount};
  if(typeof module!=='undefined')module.exports={layout};
})(typeof window!=='undefined'?window:globalThis);
