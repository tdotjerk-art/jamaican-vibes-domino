/* Keep a pressed domino attached while the phone viewport/layout changes. */
(function(root){
  function bindActivation(el,activate){
    let press=null,lastTouch=-Infinity;
    el.setAttribute('role','button');el.tabIndex=0;
    el.style.touchAction='manipulation';
    el.addEventListener('pointerdown',e=>{
      if(e.pointerType==='touch' && e.isPrimary!==false)press={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
    });
    el.addEventListener('pointermove',e=>{
      if(press && press.id===e.pointerId && Math.hypot(e.clientX-press.x,e.clientY-press.y)>12)press.moved=true;
    });
    el.addEventListener('pointercancel',()=>{press=null;lastTouch=Date.now();});
    el.addEventListener('pointerup',e=>{
      const p=press;press=null;
      if(!p || p.id!==e.pointerId)return;
      lastTouch=Date.now();
      if(p.moved || Math.hypot(e.clientX-p.x,e.clientY-p.y)>12)return;
      // Act on finger release; suppress the compatibility click to avoid double play.
      e.preventDefault();activate();
    });
    el.addEventListener('click',e=>{
      if(e.detail!==0 && Date.now()-lastTouch<700){e.preventDefault();return;}
      activate();
    });
    el.addEventListener('keydown',e=>{
      if((e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();activate();}
    });
  }
  function renderHand(host,hand,create,play){
    const existing=new Map(Array.from(host.children,el=>[el.dataset.dominoId,el]));
    const keep=new Set();
    hand.forEach((tile,i)=>{
      const id=String(tile.id);let el=existing.get(id);
      if(!el){
        el=create(tile);el.dataset.dominoId=id;
        bindActivation(el,()=>play(id));
      }
      keep.add(el);
      // Do not detach/reinsert an already correctly placed pressed element.
      if(host.children[i]!==el)host.insertBefore(el,host.children[i]||null);
    });
    Array.from(host.children).forEach(el=>{if(!keep.has(el))el.remove();});
  }
  root.JVDominoInput={bindActivation,renderHand};
  if(typeof module!=='undefined')module.exports={bindActivation,renderHand};
})(typeof window!=='undefined'?window:globalThis);
