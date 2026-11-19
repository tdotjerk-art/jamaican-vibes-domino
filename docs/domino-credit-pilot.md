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

## SQLite transactional pilot (development only)

The branch now includes `domino-wallet-sqlite.js` based on Node 22's `node:sqlite`. It uses BEGIN IMMEDIATE transactions, wallet operation keys, a globally unique verified-ad event ledger, and a durable tournament roster in the same SQLite database. This is an **alternative prototype** to the earlier JSON wallet; it is not enabled in production.

For *local development only*, set `DOMINO_CREDITS_ENABLED=true`, `DOMINO_CREDIT_STORAGE=sqlite`, `DOMINO_CREDIT_DB_PATH=/absolute/path/to/wallet.sqlite`. This enables a pilot API for tournament list, read-only status, registration and withdrawal. Admin create/start/cancel APIs require a server-only `DOMINO_TOURNAMENT_ADMIN_TOKEN` of at least 32 characters. Never put this secret into browser JS. The current app has no bracket match assignment or tournament match results, so it is **not a finished playable tournament**.

On Render, the branch fails closed unless SQLite storage is selected and `DOMINO_CREDIT_DURABLE_CONFIRMED=true`. That flag is only meaningful **after** a paid persistent disk has been provisioned and tested at the SQLite file path. Do not set it based merely on an absolute path. Render free's ephemeral filesystem cannot preserve credits. Before launch, verify Node 22 support, persistent disk mount, backup/recovery, a single deployment instance, tests across service restarts, and tournament match/game lifecycle.

A transactional PostgreSQL schema and migration plan are also in `db/domino-credit-schema.sql` and `docs/domino-credit-postgres.md`. Those are not wired to application code. PostgreSQL is preferable for future horizontal scaling; SQLite is acceptable only with reliable persistent disk and operational constraints.

The daily award route is authenticated and chooses the UTC day on the server; it returns 20 credits once per day. No browser endpoint can award advertised rewards, and rewarded ads still require a configured provider and signed server-side verification.
