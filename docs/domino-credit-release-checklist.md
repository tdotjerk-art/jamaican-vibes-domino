# Domino credit rollout gate (PR #116)

**Never merge or deploy credits while any blocking item remains.**

## Implemented on the development branch

- [x] Wallet account and name reservation, Tdot reserved-name rejection.
- [x] Starting 100 credits; 10/public entry; 25/tournament signup; 0 for computer and private.
- [x] 20-credit daily claim enforced once per server UTC day.
- [x] Replayed transaction IDs, refunds, and reward event IDs cannot mint extra credits.
- [x] SQLite transaction-backed wallet and tournament roster; admin-only tournament creation/start/cancel.
- [x] Tournament registration list and signup UI (pilot only; does not assign matches).
- [x] Public table charges once per match, with private/computer bypass.
- [x] New public rematch requires a fresh 10 credits per player; all-or-nothing charge transaction.
- [x] Completed public match entries are settled; in-memory matches interrupted by server restarts are refunded.
- [x] Automated module/API/process-restart tests.
- [x] Production guard refuses Render credit activation without selected SQLite backend and confirmed durable disk.

## Must be completed before activation

- [x] Owner confirmed Render workspace `My Workspace` (`tea-dab89eou01pc73ef8nh0`); existing service already has a 1 GB `/var/data` disk. No new paid resource was purchased.
- [ ] Verify the existing 1 GB `/var/data` Render disk is mounted in the actual Node process; test database file, backup/restore, WAL file handling, disk fullness, available space, permissions and crash recovery. Code now rejects paths outside `/var/data` and a missing separate filesystem mount.
- [x] Existing Render `jamaican-vibes-domino` web service currently reports exactly one instance (recheck before activation); a future horizontal scale requires a transactional shared SQL database.
- [ ] Confirm Render runtime Node.js version supports node:sqlite and that runtime flags are appropriate.
- [ ] Replace unlimited unverified account creation with verified identity or sufficiently strong registration-abuse controls, account recovery and privacy notices.
- [x] Add persistent tournament fixtures, round progression, byes, and administrator-authorized result recording to the SQLite development pilot (automated tests).
- [x] Add authenticated two-player tournament match rooms, restricted to assigned accounts, with server-owned game results recording bracket winners.
- [x] Add authenticated `/api/domino/wallet/tournaments/mine` listing and a pilot "My Matches" / "Play round" launcher for registered accounts; API automated checks passed.
- [ ] Verify actual lobby-to-Socket.IO launch in a real browser, complete an entire tournament game and confirm automatic advancement. The launcher depends on access to the existing game's active socket; this has not yet been browser-verified.
- [ ] Verify iPhone portrait/landscape, controls and no-scroll sizing for the tournament lobby and playing table.
- [x] Protect live-process tournament disconnections: hold the assigned seat and board, pause the match, and resume with the existing reconnect token. No automatic forfeit; disconnect/reconnect automated test passed.
- [x] Implement explicit unfinished-match restart policy: persist the bracket and registration; offer both assigned players a fresh-deal replay at no extra tournament fee. Track durable fixture attempt number and replay visibility.
- [ ] Complete end-to-end process-crash replay verification and iPhone/browser notice visibility; then define a fair forfeit/adjudication policy with clear player notifications. In-progress boards are deliberately reset after server restart.
- [ ] Configure an approved rewarded-web advertising account and ad unit, with signed server-to-server verification. Never grant credits on browser-reported ad completions. Validate account linkage, single use, rate limits, age restrictions and ad policy.
- [ ] Complete physical iPhone Safari testing in portrait/landscape plus login, public multiplayer, rematch, tournament, timers, reload, lost connectivity and no scrolling.
- [ ] Validate real Render restart/redeployment, simultaneous joins, load, storage permissions, health checks, backups and observability.
- [ ] Obtain explicit deployment approval after the owner reviews gameplay and financial impact.

## Release procedure

1. Test in an isolated staging environment with credits enabled and production-like persistent storage. Do not point staging at the production credit database.
2. Record test run URL, exact commit SHA, Render deployment, Safari screenshots and pass/fail results.
3. Confirm all gates pass, then merge the draft PR and deploy with explicit owner approval.
4. Test live URL and monitor credit entry, refund and provider verification logs.
5. Keep an immediate rollback path that disables credits without breaking private and computer games.

## Verified Render configuration (2026-11-18)

Confirmed workspace: `My Workspace` (`tea-dab89eou01pc73ef8nh0`). Production service `srv-dabmu467bikc73dkp380`, `jamaican-vibes-domino`, deploys automatically from `main`. Render reports a running single Node instance on a paid Starter-class service with an **existing 1 GB persistent disk** (`dsk-db86isu89jmc73cdrad0`) mounted at `/var/data`. Last observed live production commit is `45fee87215c35323687fa3967a92fc27c92c5b0a`; credit code is only on the draft PR branch, not deployed.

Do **not** create another paid resource solely for the credit pilot. Before activating, verify persistent storage capacity, billing, application Node version, backups and actual disk runtime mount. Render environment for SQLite *if and only if* all gates pass: `DOMINO_CREDITS_ENABLED=true`, `DOMINO_CREDIT_STORAGE=sqlite`, `DOMINO_CREDIT_DB_PATH=/var/data/domino-credit/wallet.sqlite`, `DOMINO_CREDIT_DURABLE_CONFIRMED=true` and a secret administrator token stored in Render. None of those activation variables should be changed before approval and full tests. Avoid modifying the live service while the PR is in draft.

## Bracket engine added (2026-11-18)

The SQLite pilot now stores matches and bracket winners in `tournament_matches`. The first round is seeded deterministically by signup order, odd-player byes advance automatically, and the next round is created transactionally only when every result in the current round is settled. The status endpoint exposes fixtures without player credentials. Results are writable only through an authenticated administrator API; players cannot directly report results. This **does not yet connect to live Domino match outcomes** or reserve online game rooms, so it remains a non-playable tournament coordinator. A future trusted match integration must settle results based on authoritative server game state, not on browser claims or unverified admin entry.

## Tournament match integration (2026-11-18)

Development server now accepts authenticated `join-tournament-match` Socket.IO requests for assigned players in an active, pending fixture. A dedicated two-player Cut Throat Domino room is created for each fixture; other accounts are rejected from joining by room code. When the authoritative server game finishes, its winner account is passed to the transaction-backed bracket progression logic. The client tournament lobby still needs to launch the match through the existing screen, and full game-to-bracket verification is pending. Existing reconnect tokens can reconnect within a live server process; a server restart drops in-memory boards and rooms, while fixture assignment persists. Tournament forfeit and replay policy are not yet implemented.

## Reconnect safety update

Unfinished tournament rooms no longer lose a player's seat after the ordinary 90-second public-match timeout; voluntary departure also pauses and holds the board. A disconnected player can reconnect using the existing room code and reconnect token. For a pregame fixture, restoring the seat restores readiness. No forfeits are automatically assigned. **This is an in-process reconnect guarantee only**: a server restart still wipes active boards and requires a replay of the pending fixture. Tournament-bracket data and wallet debits are persisted independently. Browser and physical iPhone verification remain outstanding.

## Player counts and format scope (2026-11-18)

- [x] Cut Throat tournament format accepts 2-, 3-, and 4-player table sizes. Matches persist exact authenticated player rosters in `tournament_match_seats`. Existing SQLite databases are migrated to default two-player tournaments for compatibility.
- [x] Admin tournament creation accepts a validated `playerCount` value, stored with each tournament; client tournament lists and "My Matches" display that size.
- [x] Server tournament join flow dynamically sizes dedicated two-, three-, or four-seat Cut Throat games. Regular online rooms already accept player counts 2, 3, and 4; private games remain free.
- [ ] Complete 4-player **Partners** tournament format separately, with explicit two-person teams and advancing **winning teams**, not individual winners. The current tournament bracket does not yet support this and must not label itself as Partners.
- [ ] Independently verify and, if necessary, adjust 2-, 3-, and 4-player selections across offline and computer practice UI. The main `index.html` is too large for the current GitHub file retrieval path, so this UI has not been inspected or modified in this branch.
- [ ] Test all three tournament table sizes in a real browser and iPhone; automated socket/integration tests are separate.
- [ ] Confirm whether undersized finals (for example a 2-player final in a 4-player Cut Throat tournament) are acceptable. The pilot uses full-size tables wherever possible and gives excess registrants automatic byes, but will use a smaller final when necessary.

## Tournament server-restart replay policy (2026-11-18)

A tournament bracket's pending match survives a Node process restart in SQLite. A restarted server has no trustworthy game board, so it does **not** restore an arbitrary partial hand, declare a winner, or charge the 25-credit tournament entry again. Both assigned players can join a new two-player room and restart with a fresh shuffle and initial score. The new `tournament_fixture_attempts` SQLite table counts each room creation across server restarts and exposes `attempts` in authenticated match assignments and read-only bracket status. When an unfinished fixture is reopened (attempt 2+), the room message explicitly tells players it is a no-extra-charge replay. The server-side match result remains authoritative for bracket progression. A dedicated actual-process SIGKILL/restart regression test validates this. Handling post-restart old reconnect tokens is a deliberate fallback to new authenticated fixture joining through My Matches.

This is a **replay policy, not full board persistence**. Until a tournament forfeit policy, physical iPhone UX verification, ad verification, and real Render restart testing are complete, keep credits and tournament play disabled in production.
