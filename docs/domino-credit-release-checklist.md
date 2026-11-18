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

- [ ] Confirm the correct Render workspace with the owner, and obtain permission for any paid service or disk.
- [ ] Provision and verify paid persistent storage, mounted inside the application; test database file, backup/restore, WAL file handling, disk fullness and crash recovery.
- [ ] Confirm an instance-count limit of one for SQLite; otherwise use a transactional shared SQL database.
- [ ] Confirm Render runtime Node.js version supports node:sqlite and that runtime flags are appropriate.
- [ ] Replace unlimited unverified account creation with verified identity or sufficiently strong registration-abuse controls, account recovery and privacy notices.
- [ ] Implement playable tournament brackets, server-authorized match seating, winner reporting, round progression, player reconnect and disconnect/forfeit rules; preserve bracket state across restarts.
- [ ] Configure an approved rewarded-web advertising account and ad unit, with signed server-to-server verification. Never grant credits on browser-reported ad completions. Validate account linkage, single use, rate limits, age restrictions and ad policy.
- [ ] Complete physical iPhone Safari testing in portrait/landscape plus login, public multiplayer, rematch, tournament, timers, reload, lost connectivity and no scrolling.
- [ ] Validate real Render restart/redeployment, simultaneous joins, load, storage permissions, health checks, backups and observability.
- [ ] Obtain explicit deployment approval after the owner reviews gameplay and financial impact.

## Release procedure

1. Test in an isolated staging service with credits enabled and production-like persistent storage.
2. Record test run URL, exact commit SHA, Render deployment, Safari screenshots and pass/fail results.
3. Confirm all gates pass, then merge the draft PR and deploy with explicit owner approval.
4. Test live URL and monitor credit entry, refund and provider verification logs.
5. Keep an immediate rollback path that disables credits without breaking private and computer games.
