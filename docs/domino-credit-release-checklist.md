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
- [ ] Implement playable tournament brackets, server-authorized match seating, winner reporting, round progression, player reconnect and disconnect/forfeit rules; preserve bracket state across restarts.
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
