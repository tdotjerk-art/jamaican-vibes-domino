# Domino credit wallet pilot (not live)

This branch introduces a **disabled-by-default pilot**: a wallet, registration/authentication API, and server-side public-seat charges and pregame refunds. It does not change the deployed application or show ads. The existing browser lobby has NOT been connected to signup credentials, so the pilot must remain disabled.

## Proposed entry rules

| Mode | Credits |
| --- | ---: |
| Online public table | 10 per completed match entry |
| Tournament | 25 per entry |
| Computer practice | 0 |
| Private friends room | 0 |

New verified accounts receive 100 credits. A new day may grant 20 credits once and a provider-verified rewarded ad event may grant 30 once. Both are idempotent by event ID.

## Integration requirements before enabling

1. Integrate the browser login/lobby UI with the new `/api/domino/wallet/register` and `/api/domino/wallet/me` endpoints, and send verified account credentials to the public-table Socket.IO event. **Do not use a client-supplied display name as wallet identity.** When enabled, the server now derives the name from the verified account.
2. Store wallet records on confirmed durable storage or a transactional shared database. The filesystem adapter uses atomic replacement but is not a multi-instance database and does not support cross-process locking.
3. The public-seat charge is wired behind `DOMINO_CREDITS_ENABLED=true`, using `DOMINO_WALLET_DIR` for data storage, and pregame seat exit refunds are wired. Tournament entry is a wallet price but **no Domino tournament registration flow exists in this integration yet**. Rematches currently incur no additional charge.
4. Perform atomic entry charge and seat reservation. Refund when joining fails before the match starts and prevent second charges on reconnection, refresh and duplicate events.
5. Verify reward completion with the advertising provider on the server; do not accept client claims of completed ads. Enforce provider policy, privacy and abuse limits.
6. Provide visible wallet balance and insufficient-credits recovery in the public lobby. Practice and private friends games must work without balance.
7. Verify server restart, reconnect, forced disconnect, two simultaneous requests, iPhone Safari portrait/landscape, private mode bypass and refund logic.
8. Keep this work as a draft pull request until all end-to-end tests and policy review pass. No deployment before that.

## Test

Run `npm test` or `node --test test/domino-wallet.test.js`.

This is a development-only staged implementation, not a complete functional credit system.

## Verified in development

GitHub Actions run 44225846933 completed successfully after the wallet API, public-seat gate, and integration tests were added. This is automated test verification, not physical iPhone Safari verification. **Never activate on ephemeral storage, and do not merge yet.**

## Lobby integration (pilot)

When `DOMINO_CREDITS_ENABLED=true`, the server injects `/domino-wallet-client.js` into the root page. It adds wallet controls alongside Join Public Table, supports new account registration, recovery with `accountID:token`, session-only credentials, live balance retrieval, and forwarding authenticated account credentials with public joins. The signed-in account name is enforced server-side. Private-room and computer modes are unchanged.

**Known blockers before launch:** Production wallet storage needs verification (no ephemeral disk); registration needs a signup/recovery experience review and abuse controls; full iPhone portrait/landscape checks are unverified; this does not add a Domino tournament lobby or actual tournament registration yet. An account recovery code must be saved by its user. No rewarded ads have been connected. GitHub Actions #407 passed automated tests for the client integration branch.

## Tournament entry wallet operations (development only)

The wallet now exposes `registerTournament(id, tournamentId)`, `tournamentRegistration(id, tournamentId)`, and `cancelTournamentRegistration(id, tournamentId)`. A registration charges 25 credits at most once for a server-supplied bracket ID. A cancellation refunds the same registration once; the cancelled bracket ID cannot be reused by that account. State is reconstructed from the wallet transaction history after restart.

These methods are intentionally **not exposed as HTTP or Socket.IO routes**. There is no working Domino tournament bracket or registration lobby to authenticate an actual event and control when signups close. A trusted tournament controller, persistent bracket roster, server-side lifecycle, and atomic cross-process enrollment/capacity enforcement are required before any public-facing tournament charge. No live deploy is authorized.

## Tournament roster coordinator (development only)

`domino-tournament-roster.js` adds a **non-networked**, server-controlled tournament roster with strict 2–128 player capacity, one seat per verified wallet, registration closing at start, cancellation/refund protection, and regression tests. The coordinator deliberately has no HTTP/Socket.IO routes and is not available in the live lobby. The roster currently lives only in process memory. **Do not enable real tournament payments yet**: bracket state must become durable and transactions between a roster seat and wallet charge must become atomic across server processes/restarts. The current wallet filesystem adapter is also not multi-instance safe. Once transactional shared storage, bracket lifecycle and recovery tests are complete, introduce a server-authorized tournament lobby.
