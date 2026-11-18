/* Jamaican Vibes Domino credit pilot. Only loaded when enabled by the server. */
(function () {
  'use strict';
  const KEY = 'jvDominoWalletAccount';
  const $ = id => document.getElementById(id);
  let credentials = null, busy = false, ready = false;
  try { credentials = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch {}
  const isValid = a => a && /^[a-f0-9]{32}$/.test(a.id || '') && /^[a-f0-9]{64}$/.test(a.token || '');
  if (!isValid(credentials)) credentials = null;

  async function post(action, data) {
    const response = await fetch('/api/domino/wallet/' + action, {
      method: 'POST', headers: {'content-type': 'application/json'},
      cache: 'no-store', body: JSON.stringify(data)
    });
    const value = await response.json();
    if (!response.ok) throw Error(value.error || 'Wallet request failed.');
    return value;
  }
  function walletName() { return (localStorage.getItem('jvSignupName') || $('jvName')?.value || '').trim(); }
  function message(value) { const target = $('jvWalletStatus'); if (target) target.textContent = value; }
  function update(balance) { const target = $('jvWalletBalance'); if (target) target.textContent = String(balance); }

  async function refresh() {
    if (!credentials) return;
    try {
      const account = await post('me', credentials);
      // Do not silently sign in as a different person after changing signup name.
      if (account.name !== walletName()) {
        credentials = null; sessionStorage.removeItem(KEY);
        message('Signup name changed. Register a new wallet for public play.');
        return;
      }
      update(account.balance);
      message('Signed in as ' + account.name);
    } catch {
      credentials = null; sessionStorage.removeItem(KEY);
      message('Your wallet session expired. Sign in again using your recovery code.');
    }
  }
  async function register() {
    const name = walletName();
    if (!name || /tdot/i.test(name)) throw Error('Enter a signup name that does not contain Tdot.');
    const response = await post('register', { name });
    credentials = { id: response.account.id, token: response.token };
    sessionStorage.setItem(KEY, JSON.stringify(credentials));
    update(response.account.balance);
    message('Wallet created. Save your recovery code securely before changing devices.');
    const code = $('jvWalletRecovery');
    if (code) { code.value = response.account.id + ':' + response.token; code.hidden = false; }
    return credentials;
  }
  async function restore() {
    const input = $('jvWalletRecoveryInput');
    const parts = (input?.value || '').trim().split(':');
    if (parts.length !== 2) throw Error('Enter account ID and recovery token separated by a colon.');
    const next = { id: parts[0], token: parts[1] };
    if (!isValid(next)) throw Error('Invalid recovery code.');
    const account = await post('me', next);
    if (account.name !== walletName()) throw Error('Your signup name does not match this account.');
    credentials = next;
    sessionStorage.setItem(KEY, JSON.stringify(credentials));
    if (input) input.value = '';
    update(account.balance); message('Wallet recovered for ' + account.name);
  }

  async function refreshTournaments() {
    const list = $('jvTournamentList'), details = $('jvTournamentDetails');
    if (!list || !details) return;
    try {
      const response = await fetch('/api/domino/wallet/tournaments', {cache:'no-store'});
      if (response.status === 404) { details.hidden = true; return; }
      if (!response.ok) throw Error('Tournament list unavailable.');
      const tournaments = await response.json();
      details.hidden = false;
      list.replaceChildren();
      if (!Array.isArray(tournaments) || !tournaments.length) {
        list.textContent = 'No tournaments are accepting registration.';
        return;
      }
      for (const bracket of tournaments) {
        const line = document.createElement('div');
        line.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0;flex-wrap:wrap';
        const summary = document.createElement('span');
        summary.textContent = bracket.id + ' — ' + bracket.registered + '/' + bracket.capacity + ' registered';
        const join = document.createElement('button');
        join.type = 'button'; join.textContent = 'Join: 25 credits';
        join.disabled = bracket.registered >= bracket.capacity;
        join.onclick = async () => {
          try {
            if (!isValid(credentials)) throw Error('Create or recover your wallet first.');
            const account = await post('me', credentials);
            if (account.name !== walletName()) throw Error('Your signup name must match your wallet.');
            const entry = await post('tournaments/' + encodeURIComponent(bracket.id) + '/join', credentials);
            update(entry.balance);
            message(entry.applied ? 'Registered for ' + bracket.id + '. Match assignments are not active yet.' :
              'Already registered for ' + bracket.id + '.');
            await refreshTournaments();
          } catch (error) { message(error.message); }
        };
        line.append(summary,join); list.append(line);
      }
    } catch (error) { list.textContent = error.message; }
  }

  function install() {
    if (ready) return;
    const join = $('jvPublicJoin'), setup = $('jvOnlineSetup');
    if (!join || !setup) return;
    ready = true;
    const panel = document.createElement('section');
    panel.id = 'jvWalletPanel';
    panel.style.cssText = 'margin:8px auto;padding:9px;max-width:450px;border:1px solid #ffd447;border-radius:10px;background:#082719;color:#fff;font-size:13px';
    panel.innerHTML = '<strong>Public Match Credits</strong> — <span id="jvWalletBalance">—</span> available. Public entry: 10 credits. Private friends and computer games: FREE.'+
      '<div id="jvWalletStatus" role="status" style="margin:6px 0">Create or recover a wallet before public play.</div>'+
      '<button type="button" id="jvWalletRegister">Create Wallet</button> '+
      '<button type="button" id="jvWalletRefresh">Refresh Balance</button>'+
      ' <button type="button" id="jvWalletDaily">Claim Daily 20 Credits</button>'+
      '<p style="margin:5px 0"><label>Recovery code <input id="jvWalletRecovery" readonly hidden aria-label="Your recovery code" style="width:100%;font-size:12px"></label></p>'+
      '<label>Existing recovery code <input id="jvWalletRecoveryInput" autocomplete="off" aria-label="Existing recovery code" style="width:100%"></label>'+
      '<button type="button" id="jvWalletRestore">Recover Wallet</button>'+
      '<details id="jvTournamentDetails" hidden style="margin-top:8px"><summary>Tournament registration (pilot)</summary>'+
      '<p style="margin:4px 0">Entry: 25 credits. Tournament match assignments are not yet active.</p>'+
      '<button type="button" id="jvTournamentRefresh">Refresh tournaments</button>'+
      '<div id="jvTournamentList" aria-live="polite"></div></details>';
    join.parentNode.insertBefore(panel, join);
    $('jvWalletRegister').onclick = async () => {
      try { await register(); } catch (e) { message(e.message); }
    };
    $('jvWalletRefresh').onclick = refresh;
    $('jvTournamentRefresh').onclick = refreshTournaments;
    $('jvWalletDaily').onclick = async () => {
      try {
        if (!isValid(credentials)) throw Error('Sign in to claim your daily credits.');
        const result = await post('daily', credentials);
        update(result.balance);
        message(result.applied ? 'Daily 20 credits added.' : 'Today\'s 20 credits were already claimed.');
      } catch (error) { message(error.message); }
    };
    $('jvWalletRestore').onclick = async () => {
      try { await restore(); } catch (e) { message(e.message); }
    };
    // Capture only public joins; original private and computer handlers stay intact.
    join.addEventListener('click', async e => {
      if (busy) return;
      e.preventDefault(); e.stopImmediatePropagation();
      busy = true;
      try {
        if (!credentials) throw Error('Create or recover your wallet before entering a public game.');
        const account = await post('me', credentials);
        if (account.name !== walletName()) throw Error('Use the signup name registered with this wallet.');
        update(account.balance);
        if (account.balance < 10) throw Error('Not enough credits. Private friends and computer games are free.');
        // The original handler still owns room creation and all gameplay logic.
        join.click();
      } catch (error) { message(error.message); }
      finally { busy = false; }
    }, true);
    refresh();
    refreshTournaments();
  }

  // Preserve the existing online socket implementation, attaching credentials
  // only to public-entry emits. Private room payloads are unchanged.
  const originalIo = window.io;
  if (typeof originalIo === 'function') {
    window.io = function (...args) {
      const socket = originalIo.apply(this, args);
      const originalEmit = socket.emit;
      socket.emit = function (event, data, ...rest) {
        if (event === 'join-public-table') {
          if (!isValid(credentials)) { message('Create or recover your wallet first.'); return this; }
          return originalEmit.call(this, event, {...data, accountId: credentials.id, accountToken: credentials.token}, ...rest);
        }
        return originalEmit.call(this, event, data, ...rest);
      };
      socket.on('wallet-balance', data => {
        if (Number.isSafeInteger(data?.balance)) update(data.balance);
      });
      return socket;
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
