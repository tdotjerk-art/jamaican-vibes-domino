(() => {
  const style=document.createElement('style');
  style.textContent=`
    #memberPanel{position:fixed;inset:0;z-index:30000;display:none;align-items:center;justify-content:center;background:#08170feb;padding:16px;box-sizing:border-box;font-family:Arial,sans-serif;color:#fff}
    #memberPanel .member-card{width:min(480px,100%);max-height:88dvh;overflow:auto;background:#11261b;border:2px solid #ffd92f;border-radius:16px;padding:22px;box-sizing:border-box}
    #memberPanel h2{color:#ffd92f;margin:0 0 14px;font-size:26px}
    #memberPanel input,#memberPanel select{display:block;width:100%;box-sizing:border-box;padding:12px;margin:6px 0 14px;border-radius:7px;border:1px solid #9cae9f;background:#fff;color:#111;font-size:16px}
    #memberPanel button{cursor:pointer;min-height:44px;padding:10px 14px;border:0;border-radius:8px;background:#ffd92f;color:#111;font-weight:bold;margin:4px 4px 4px 0}
    #memberPanel button:disabled{opacity:.5;cursor:default}
    #memberPanel .member-muted{font-size:14px;color:#cbd6cd;line-height:1.5}
    #memberPanel .member-box{border:1px solid #496b52;border-radius:10px;padding:14px;margin:14px 0}
    #memberPanel .member-close{float:right;background:#fff}
    #memberPanel [hidden]{display:none!important}
    #memberMessage{line-height:1.5;margin-top:12px;color:#ffe67a;overflow-wrap:anywhere}
    #memberRecoveryCode{font:14px monospace;overflow-wrap:anywhere;background:#06140d;padding:12px}
    .member-table-accent{display:none;position:absolute;inset:8% 3%;border:4px solid transparent;border-radius:16% / 35%;pointer-events:none;z-index:3;box-sizing:border-box}
    body[data-member-theme=gold] .member-table-accent{display:block;border-color:#cfa63f}
    body[data-member-theme=emerald] .member-table-accent{display:block;border-color:#36b978}
    @media(max-height:500px){#memberPanel .member-card{max-height:94dvh;padding:14px}}
  `;
  document.head.appendChild(style);
  const accent=document.createElement('div');accent.className='member-table-accent';accent.setAttribute('aria-hidden','true');document.querySelector('.table')?.appendChild(accent);
  const panel=document.createElement('section');panel.id='memberPanel';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','memberTitle');
  panel.innerHTML=`<div class="member-card">
    <button class="member-close" id="memberClose" aria-label="Close account">Close</button>
    <h2 id="memberTitle">Account &amp; VIP</h2>
    <p class="member-muted">Basic single-player and online play stay free.</p>
    <div id="memberSignedOut">
      <div><button id="memberLoginTab">Sign in</button><button id="memberRegisterTab">Create account</button><button id="memberRecoverTab">Recover</button></div>
      <form id="memberForm">
        <label id="memberNameLabel" hidden>Player name<input id="memberName" maxlength="20" autocomplete="nickname"></label>
        <label>Email<input id="memberEmail" type="email" maxlength="254" autocomplete="email" required></label>
        <label>Password<input id="memberPassword" type="password" minlength="12" maxlength="128" autocomplete="current-password" required></label>
        <label id="memberRecoveryLabel" hidden>Recovery code<input id="memberRecoveryInput" autocomplete="off" maxlength="64"></label>
        <p id="memberRegistrationNote" class="member-muted" hidden>Use at least 12 characters. After signing up, save your recovery code: it lets you reset your password without email.</p>
        <button id="memberSubmit" type="submit">Sign in</button>
      </form>
    </div>
    <div id="memberSignedIn" hidden>
      <p id="memberIdentity"></p>
      <p id="memberPlan" class="member-muted"></p>
      <div class="member-box"><strong>Your online matches</strong><p id="memberStats">Loading…</p><div id="memberRecent"></div></div>
      <label>Table rim design<select id="memberTheme"><option value="classic">Classic brown</option><option value="gold">VIP · Gold</option><option value="emerald">VIP · Emerald</option></select></label>
      <button id="memberManage" hidden>Manage membership / cancel</button><button id="memberLogout">Sign out</button>
    </div>
    <div id="memberRecovery" class="member-box" hidden><strong>Save your recovery code now</strong><p class="member-muted">Keep it private. Anyone with this code and your email can reset your password. It is shown only once.</p><p id="memberRecoveryCode"></p><button id="memberCopyRecovery">Copy code</button><button id="memberSavedRecovery">I saved it</button></div>
    <div class="member-box"><strong>VIP · C$9.99 / month</strong><ul class="member-muted"><li>Host password-protected rooms; friends join free</li><li>Gold and emerald table rims</li><li>Last 20 completed online matches</li></ul><p class="member-muted">Renews monthly until cancelled through Manage membership. Cancellation takes effect at the end of your paid period.</p><button id="memberUpgrade">Join VIP</button><p id="memberBillingStatus" class="member-muted"></p></div>
    <p id="memberMessage" role="status" aria-live="polite"></p>
  </div>`;
  document.body.appendChild(panel);
  const $=id=>document.getElementById(id);
  let user=null, ready=false, mode='login', previousFocus=null;
  const message=text=>{$('memberMessage').textContent=text;};
  async function api(route,body) {
    const r=await fetch('/api/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await r.json();if(!r.ok)throw new Error(data.error||'Unable to complete request.');return data;
  }
  function tabs(next) {
    mode=next;$('memberNameLabel').hidden=mode!=='register';$('memberName').required=mode==='register';
    $('memberRecoveryLabel').hidden=mode!=='recover';$('memberRecoveryInput').required=mode==='recover';
    $('memberRegistrationNote').hidden=mode!=='register';$('memberPassword').autocomplete=mode==='login'?'current-password':'new-password';
    $('memberSubmit').textContent=mode==='register'?'Create free account':mode==='recover'?'Reset password':'Sign in';message('');
  }
  async function refresh() {
    const data=await api('me');user=data.user;ready=data.billingReady;
    $('memberSignedOut').hidden=!!user;$('memberSignedIn').hidden=!user;
    $('memberBillingStatus').textContent=ready?'Secure payment opens on Stripe.':'VIP payments are not connected yet. You can create a free account and play.';
    $('memberUpgrade').disabled=!ready||!!user?.vip;
    document.body.dataset.memberTheme=user?.theme||'classic';
    if(!user)return;
    $('memberIdentity').textContent=`${user.name} · ${user.email}`;
    $('memberPlan').textContent=user.vip?'VIP membership active':'Free account';
    $('memberTheme').value=user.theme;$('memberTheme').options[1].disabled=!user.vip;$('memberTheme').options[2].disabled=!user.vip;
    $('memberManage').hidden=!user.hasBilling;
    const stats=await api('stats');$('memberStats').textContent=`${stats.totals.matches} completed · ${stats.totals.wins} wins`;
    $('memberRecent').replaceChildren();
    stats.recent.forEach(match=>{const row=document.createElement('p');row.className='member-muted';row.textContent=`${match.won?'Win':'Loss'} · ${match.mode==='partner'?'Partner':'Individual'} · ${new Date(match.completed).toLocaleDateString()}`;$('memberRecent').appendChild(row);});
  }
  async function open() {previousFocus=document.activeElement;panel.style.display='flex';$('memberClose').focus();try{await refresh();}catch(e){message(e.message);}}
  function close() {panel.style.display='none';previousFocus?.focus();}
  $('jvAccountOpen')?.addEventListener('click',open);$('memberClose').onclick=close;
  panel.addEventListener('keydown',e=>{
    if(e.key==='Escape')close();
    if(e.key==='Tab'){
      const all=[...panel.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.getClientRects().length);
      if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all.at(-1).focus();}
      else if(!e.shiftKey&&document.activeElement===all.at(-1)){e.preventDefault();all[0].focus();}
    }
  });
  $('memberLoginTab').onclick=()=>tabs('login');$('memberRegisterTab').onclick=()=>tabs('register');$('memberRecoverTab').onclick=()=>tabs('recover');
  $('memberForm').onsubmit=async e=>{
    e.preventDefault();$('memberSubmit').disabled=true;message('Working…');
    try{
      const data=await api(mode,{email:$('memberEmail').value,name:$('memberName').value,password:$('memberPassword').value,recoveryCode:$('memberRecoveryInput').value});
      $('memberPassword').value='';$('memberRecoveryInput').value='';
      if(data.recoveryCode){$('memberRecoveryCode').textContent=data.recoveryCode;$('memberRecovery').hidden=false;}
      await refresh();message('You are signed in. Your account will be used for new online games.');
    }catch(e){message(e.message);}finally{$('memberSubmit').disabled=false;}
  };
  $('memberSavedRecovery').onclick=()=>{$('memberRecovery').hidden=true;$('memberRecoveryCode').textContent='';};
  $('memberCopyRecovery').onclick=async()=>{try{await navigator.clipboard.writeText($('memberRecoveryCode').textContent);message('Recovery code copied. Keep it somewhere safe.');}catch{message('Select and copy the recovery code above.');}};
  $('memberLogout').onclick=async()=>{try{await api('logout',{});$('memberRecovery').hidden=true;$('memberRecoveryCode').textContent='';await refresh();message('Signed out.');}catch(e){message(e.message);}};
  $('memberTheme').onchange=async()=>{try{await api('theme',{theme:$('memberTheme').value});await refresh();message('Table rim updated.');}catch(e){message(e.message);await refresh();}};
  async function billing(route,button) {
    if(!user){tabs('register');message('Create an account or sign in before joining VIP.');return;}
    button.disabled=true;message('Opening secure payment…');
    try{const data=await api('billing/'+route,{});const url=new URL(data.url);if(url.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(url.hostname))throw new Error('Invalid payment address.');window.location.assign(url.href);}
    catch(e){message(e.message);button.disabled=false;}
  }
  $('memberUpgrade').onclick=()=>billing('checkout',$('memberUpgrade'));$('memberManage').onclick=()=>billing('portal',$('memberManage'));
  refresh().catch(()=>{});
  const result=new URLSearchParams(location.search).get('billing');
  if(result){open().then(()=>message(result==='success'?'Checkout finished. VIP activates after payment is verified. Refresh your account in a moment.':'Checkout cancelled. Your free account is available.'));history.replaceState(null,'',location.pathname);}
})();
