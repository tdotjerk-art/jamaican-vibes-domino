/* One viewport coordinate system: clocks follow tiles, never cached positions. */
(function(root){
  function besideHand(rects,viewportWidth,viewportHeight){
    const visible=rects.filter(r=>r.width>0&&r.height>0);
    if(!visible.length)return null;
    const right=Math.max(...visible.map(r=>r.right));
    const top=Math.min(...visible.map(r=>r.top));
    const bottom=Math.max(...visible.map(r=>r.bottom));
    const gap=5,height=28;
    const width=Math.min(28,Math.max(16,viewportWidth-right-gap-3));
    return {left:right+gap,top:Math.max(3,Math.min((top+bottom-height)/2,viewportHeight-height-3)),width,height};
  }
  function mount(){
    const layer=document.getElementById('playerTimers');
    if(!layer)return;
    // Outside the transformed table so positions use the same coordinates as tiles.
    document.body.appendChild(layer);
    let pending=false;
    function place(){
      pending=false;
      for(let player=1;player<=4;player++){
        const hand=document.getElementById('hand'+player),timer=document.getElementById('timerP'+player);
        if(!hand||!timer)continue;
        const pos=besideHand(Array.from(hand.children,el=>el.getBoundingClientRect()),root.innerWidth,root.innerHeight);
        if(!pos){timer.classList.remove('active');continue;}
        if(player===2||player===4){
          // The original game has exactly one turnLight element per player.
          // Place that existing red light using CSS custom properties so the
          // old fixed-position renderer cannot overwrite this position.
          const rects=Array.from(hand.children,el=>el.getBoundingClientRect())
            .filter(r=>r.width>0&&r.height>0);
          const table=document.querySelector('.table');
          const light=document.getElementById('turnLight'+player);
          if(rects.length&&table&&light){
            const right=Math.max(...rects.map(r=>r.right));
            const top=Math.min(...rects.map(r=>r.top));
            const bottom=Math.max(...rects.map(r=>r.bottom));
            const tableBox=table.getBoundingClientRect();
            const radius=Math.max(8,light.offsetWidth/2||8);
            const x=right+9+radius;
            const y=(top+bottom)/2;
            table.style.setProperty('--jv-p'+player+'-light-x',(x-tableBox.left)+'px');
            table.style.setProperty('--jv-p'+player+'-light-y',(y-tableBox.top)+'px');
            // The countdown stays on the same side, beyond the red light.
            pos.left=Math.min(root.innerWidth-pos.width-3,right+9+radius*2+12);
          }
        }
        for(const key of ['left','top','width','height'])timer.style.setProperty(key,pos[key]+'px','important');
      }
    }
    function schedule(){if(!pending){pending=true;root.requestAnimationFrame(place);}}
    const hands=[1,2,3,4].map(i=>document.getElementById('hand'+i)).filter(Boolean);
    const changes=new MutationObserver(schedule);
    hands.forEach(hand=>changes.observe(hand,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class']}));
    const resize=new ResizeObserver(schedule);
    hands.forEach(hand=>resize.observe(hand));
    const table=document.querySelector('.table');if(table)resize.observe(table);
    root.addEventListener('resize',schedule);
    root.addEventListener('scroll',schedule,true);
    if(root.visualViewport){root.visualViewport.addEventListener('resize',schedule);root.visualViewport.addEventListener('scroll',schedule);}
    root.JVPlayerTimers={schedule};
    schedule();
  }
  if(typeof module!=='undefined')module.exports={besideHand};
  if(typeof document!=='undefined')mount();
})(typeof window!=='undefined'?window:globalThis);
