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

## Account recovery security progress (2026-11-18)

- [x] SQLite development wallet supports authenticated recovery-token rotation. Rotation issues a new random 256-bit token, stores only its hash, revokes the previous token immediately and retains the account ID, balance and tournaments.
- [x] Verify invalid or cross-account tokens cannot rotate another player's credentials, and rotation persists across database restart. Focused CI run [44443231095](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44443231095) passed all 13 tests; full development suite [44443035776](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44443035776) passed all 221 tests.
- [x] Implement authenticated, in-process rate-limited recovery-code rotation API and a player confirmation control. The old code is invalidated; the new code updates browser session storage and is displayed with a save-it-securely warning. API tests passed in [run 44443849599](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44443849599); actual browser UI + tournament launch passed in [run 44444015266](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44444015266). This does **not** prove distributed rate-limit persistence or verify player identity for a lost-code reset.
- [x] Add a durable preliminary signup-abuse throttle: the SQLite registration path permits at most eight new accounts per server-observed network address per UTC day, records only database-salted HMAC address hashes, counts successful registrations atomically and does not trust a browser-supplied forwarding header. Tested across restarts and spoofed headers in [CI run 44444476692](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44444476692) (15/15 passed).
- [x] Add a second, SQLite-transactional signup-abuse safeguard: maximum **100 successful starter-credit registrations across all source addresses per UTC day**, in addition to the existing eight-per-source limit. Duplicate/invalid registrations roll back both counters; limits persist through restart and require no stored raw IPs. [Run 44461794547](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44461794547): 18/18 focused tests and 225/225 full development regressions passed. This conservative pilot-wide cap can reject legitimate players when demand is high, so monitor and revisit before public launch.
- [ ] **Still blocking production credit activation:** implement verified identity or abuse-resistant registration beyond a network quota; verify Render's actual proxy/client-IP chain so legitimate users behind shared proxies are not treated as one person, and add distributed defenses against IP rotation/VPNs. A daily network cap alone does not prove uniqueness or prevent fake accounts.
- [ ] Strengthen global/distributed rate limits, recovery-code privacy/masking and notices. Test already-connected gameplay sockets against recovery-code revocation before release.
- [ ] Implement durable signup-abuse controls or verified identity, privacy terms and account recovery that does not permit unverified wallet recreation to farm starter credits.
- [x] Enforce wallet recovery-code rotation against existing paid-game Socket.IO sessions: old connected game actions are denied, old room tokens alone cannot resume a paid match after rotation, and a current authenticated wallet can reconnect to the **same seat without an additional entry charge**. Pilot client attaches wallet identity to paid reconnect events; private friends rooms are unaffected. [Wallet security run 44462897274](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44462897274) passed 19/19 targeted and 225/225 full tests. These checks cover live-process reconnect; real Render restart, multi-device Safari UI and malicious session replay remain separate launch checks.
- [x] Immediate paid-session invalidation when a recovery code rotates: before responding with the new code, the server evicts affected tournament/public sockets from the Socket.IO room, emits a clear recovery-code notice, and applies the existing tournament seat-hold/public grace policy. A regression test triggers a separate authoritative room broadcast and verifies **no subsequent private-state or room-state reaches the revoked socket**. Reconnection with the current recovery code restores the same tournament seat without another charge. [Security run 44467485307](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44467485307): **21/21 targeted and 227/227 full tests passed**.
- [ ] Verify the revoked-session notice and reauthentication flow on a **physical iPhone Safari**. Browser automation is not a substitute. Expand the immediate-revocation broadcast test to paid public tables separately before launch.
- [x] Merged production `main` into the draft branch on 2026-11-18, retaining production's secure `body-parser` 2.4.0 / `qs` 6.17.1 lockfile and corrected live multiplayer smoke test, while preserving tournament socket support and current Cut Throat setup. Merge commit [`69bd5b8`](https://github.com/tdotjerk-art/jamaican-vibes-domino/commit/69bd5b8c69aae926b2dd7cba6df3b2bfaac1ba49). GitHub reports PR #116 mergeable and 0 commits behind main. **No wallet feature has been deployed to production.**

## Rewarded-ad security foundation (2026-11-18)

- [x] Added SQLite-persisted, authenticated reward intents using unpredictable 192-bit nonces, 15-minute expiry, a limit of six requests per hour, global provider-event replay blocking, transactionally single-use reward settlement, and a maximum of three verified rewards per rolling 24-hour account period. Requesting an ad **never** grants credits.
- [x] Added tests for expired claims, repeated events, other-account event replay, daily caps, invalid credentials, and process database reopening.
- [ ] Connect an approved rewarded-web provider and implement its **documented, authenticated server-side verification protocol**. Google Ad Manager now supports web SSV callbacks, but receiving a callback alone is not proof of authenticity: verify the exact provider signature/credential and account-bound nonce before invoking reward settlement.
- [ ] Verify ad-provider contract, account, policy restrictions, reward amount, age/consent eligibility and production callback delivery. Never accept the browser's `rewardedSlotGranted` event as authorization to credit a wallet.
- [ ] Expose a player-facing opt-in reward control only after callback verification and anti-fraud tests pass. All rewards remain **disabled in production**.

## Rewarded web SSV priority (2026-11-19)

- [x] Confirmed Google Ad Manager currently supports **web rewarded ad server-side callbacks** when a network configures an SSV URL on its rewarded ad units. The Google Ad Manager **web** help page documents GET callbacks but does not document the mobile SDK's ECDSA `signature` / `key_id` verification contract for web. **Do not reuse mobile SSV key verification assumptions for web.** Official source: https://support.google.com/admanager/answer/9116812
- [x] Added an authenticated, per-account `rewards/status` read-only endpoint that reports **pending, expired, or settled** without granting credits. Added a rate-limited `rewards/intent` endpoint which responds **503 by default** until `DOMINO_REWARDED_ADS_ENABLED=true` is explicitly set. Creating or polling an intent does not credit anyone. No browser-accessible settlement endpoint exists. [Wallet CI run 44464044063](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44464044063) passed **21/21** focused and **227/227** full tests, including test-only intent issuance, account isolation, expiry and forged-settlement rejection. This is secure plumbing, **not** a connected ad network or a verified SSV callback.
- [x] Hardened the pilot intent endpoint so even `DOMINO_REWARDED_ADS_ENABLED=true` cannot expose rewards on Render while no authenticated provider SSV callback exists. It now requires an **isolated local test process** with both `DOMINO_REWARDED_ADS_TEST_MODE=true` and `DOMINO_REWARDED_ADS_ENABLED=true`, and rejects all hosted Render requests with HTTP 503. Do not set these test flags in production; remove this test-only restriction only after provider-specific cryptographic or equivalent authenticated verification has been implemented and reviewed.
- [ ] Confirm the owner has an approved Google Ad Manager *publisher* account and eligible rewarded-web inventory. Google Ads advertiser accounts and marketing-reporting connectors are not substitutes. Configure rewarded web inventory and callback in the publisher dashboard, with provider-issued verification evidence and test callbacks; no publisher account setup was performed automatically.
- [ ] **Critical launch blocker:** Verify the actual publisher's **web-specific SSV callback authentication**, signed fields or equivalent verifiable provider-issued proof, event/nonce linkage, delivery and retries. Do not rely on the source IP, HTTP request arrival, guessed URL secret, or unsigned browser GPT `rewardedSlotGranted` event as sufficient credit authorization. A mobile SDK signed-callback guide is **not** proof of equivalent web support.
- [ ] Obtain an approved Google Ad Manager account and rewarded-web ad unit, consent/policy review and real provider test callbacks before configuring any ad provider or enabling rewards. Until then `settleVerifiedRewardIntent` remains internal only, with no public callback route and no production ads.
- [ ] Add provider-specific signature/authentication integration tests, real callback fixture replay and live test evidence before marking rewarded ads ready.

## Tournament priority #4 verification (2026-11-18)

- [x] Verified a complete two-player Cut Throat tournament game to exactly six with automatic, server-authoritative fixture settlement and no extra tournament debit.
- [x] Strengthened actual-process SIGKILL recovery: play a legal domino **before** crashing the Node server, reject stale room/reconnect tokens, confirm the fixture remains pending, launch a fresh-deal second attempt, preserve the bracket and keep both 25-credit entries at one charge.
- [x] Verify persisted two-, three- and four-player Cut Throat brackets, winners, round creation and byes using isolated SQLite tests.
- [x] Dedicated [tournament progression and crash CI run 44448056310](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44448056310) passed **18 of 18** targeted tests, including one real full-match completion and crash/restart replay.
- [ ] This is still **local isolated CI**, not physical iPhone Safari or an actual Render disk/redeployment test. A full multi-round tournament played by real clients (not just bracket unit progression) remains a launch check. Review player notices and forfeit/adjudication policy before activation.
- [ ] Four-player **Partners** tournament bracket advancement must use winning teams and is not implemented. Cut Throat tournament code must not be represented as supporting Partners.

## Mobile Safari-engine priority #5 verification (2026-11-18)

- [x] Extended isolated tournament-browser CI to use **both Chromium and WebKit** with separate evidence screenshots and real two-client tournament join, login, recovery rotation, screen-fit, socket persistence, and portrait-to-landscape / landscape-to-portrait rotation checks.
- [x] Fixed WebKit mobile orientation geometry: synchronous screen re-fit on orientation changes, viewport-dimension fallback when resize events are omitted, and fit for full vertical side hands on short landscape screens. The test rejects clipped dominoes, vertically/horizontally scrollable pages, socket changes, or changes to played dominoes.
- [x] Browser verification [run 44450358605](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44450358605): Chromium **PASS**, WebKit **PASS**, both rotation directions for each of two tournament players.
- [ ] Physical iPhone Safari is **not verified**. An automated Linux WebKit mobile viewport is not identical to iOS Safari: test real iPhone portrait and landscape, rotation during an active hand, touch hit areas, browser bars/safe areas, timers, reload, network loss and reconnection, UI login and tournament lobby, and screenshots before launch.
- [ ] Production layout changes from this branch must undergo a separate release review. Credit pilot still disabled and PR #116 remains draft.

## Final reconciliation and security review (2026-11-18)

- [x] Production branch reconciled with draft PR #116 without changing production or enabling credits.
- [x] The isolated release-security audit found **0 npm vulnerabilities** and **18 of 18** targeted wallet safety tests passing in [run 44455571521](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44455571521); its release-activation job is **expected to fail closed** on incomplete launch gates.
- [x] Post-merge GitHub runs: complete main game regressions [44459764511](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44459764511) **PASSED** and independent Chromium + WebKit two-player tournament browser checks [44459758471](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44459758471) **BOTH PASSED** after merge commit `69bd5b8`.
- [ ] Review the remaining launch blockers in this file before enabling paid public matches or tournaments; no implicit approval from passing CI.

## Must be completed before activation

- [x] Owner confirmed Render workspace `My Workspace` (`tea-dab89eou01pc73ef8nh0`); existing service already has a 1 GB `/var/data` disk. No new paid resource was purchased.
- [x] Read-only Render configuration check: service `srv-dabmu467bikc73dkp380` deploys from `main` on a single Node instance and has an existing 1 GB disk configured with mount path `/var/data`. This does **not** verify the runtime mount contents or database durability.
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

## Live full-match test findings — 2026-11-18

- **Run [44360976070](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44360976070) failed** against the actual deployed `main` URL. Six preceding private-room smoke checks passed in [44359413028](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44359413028).
- Two-player Cut Throat: the harness timed out waiting for a board/phase update after move 11 (seat 1, domino ID 26). No proof yet whether the server rejected the move or the harness used a stale state.
- Three-player Cut Throat: similar timeout after move 162 (seat 1, domino ID 9), after many hands/turns.
- Four-player Cut Throat: 13 hands and 298 requested moves; latest phase `hand-over` with scores `[3,5,1,4]`, but did not reach six inside 125 seconds.
- Four-player Partners: 16 hands and 343 requested moves; latest phase `hand-over`, team scores `[0,2]`; no winner within 155 seconds. Bruck scoring can legitimately prolong this format.
- Rematch phase was **not tested** because the first match did not complete. Do not interpret these as confirmed live gameplay bugs or as a successful completion test.
- **Next:** improve test instrumentation to capture `action-error` and verify move processing using state version/sequence, expand reasonable hand/match time limits and isolate scenarios in separate CI jobs. After a full match completes, verify all-player replay votes and reset.

## Full-match regression rerun — 2026-11-18

- [Run 44374811461](https://github.com/tdotjerk-art/jamaican-vibes-domino/actions/runs/44374811461) tested the currently deployed main game in isolated private rooms using the updated synchronized test harness from development commit `e94c16f`.
- **PASS:** 2-player Cut Throat, 66 moves / 6 hands; scored to six, and the rematch vote/reset/fresh deal also passed.
- **PASS:** 3-player Cut Throat, 179 moves / 10 hands; scored to six.
- **PASS:** 4-player Cut Throat, 371 moves / 16 hands; scored to six.
- **NOT PASSED:** 4-player Partners, 864 moves / 39 hands; no team scored six in 420 seconds. No move-rejection error was reported. Bruck-and-start scoring legitimately resets progress when the opposite team wins, so this outcome does not establish a gameplay bug or a full-match pass.
- Earlier four-format failures in run 44372008199 were all `Domino not found in your hand` rejections, consistent with a race between independently delivered seat snapshots and server turns. Synchronization has removed that failure in all four latest runs, but additional repeated/regression testing is needed before calling it fully resolved.
- **Still required:** deterministic Partners Bruck scoring/winner checks and a bounded endurance check separate from the random full-match-to-six outcome; tournament browser-to-bracket completion; mobile Safari testing and credit economy launch gates. No production credit deployment.

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
