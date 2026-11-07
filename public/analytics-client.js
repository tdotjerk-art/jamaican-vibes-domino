(()=>{'use strict';
 const game=location.pathname.startsWith('/ludi')?'ludi':location.pathname.startsWith('/draff')?'draff':location.pathname.startsWith('/holdem')?'holdem':location.pathname.includes('three-cards')?'three-cards':'domino';
 let id;try{id=localStorage.getItem('jv-analytics-browser');if(!/^[a-f0-9-]{36}$/.test(id||'')){id=crypto.randomUUID();localStorage.setItem('jv-analytics-browser',id)}}catch{id=crypto.randomUUID()}
 document.cookie='jv_analytics_browser='+id+'; Path=/; Max-Age=7776000; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');
 let active=false,current=null;const refs=new WeakMap();
 function send(path,body){fetch('/api/analytics/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true}).catch(()=>{})}
 function pulse(){if(document.hidden)return;send('visit',{game,id});if(active&&current)send('practice',{game,id,...current})}
 window.JVAnalytics={state(ref,complete=false){if(!ref){current=null;return}if(!refs.has(ref))refs.set(ref,crypto.randomUUID());const next={match:refs.get(ref),complete:!!complete};if(!current||next.match!==current.match||next.complete!==current.complete){current=next;if(active)pulse()}},start(){active=true;pulse()}};
 document.addEventListener('pointerdown',()=>{active=true},{passive:true});document.addEventListener('keydown',()=>{active=true},{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)pulse()});setInterval(pulse,20000);pulse();
})();
