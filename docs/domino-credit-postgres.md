# PostgreSQL credit-wallet production transition

This schema is a **foundation**, not a completed migration. The currently merged production app has no credits. PR #116's development wallet remains a single-process JSON adapter and the tournament roster is in memory. Do not enable either on Render free service.

### Transaction requirements for the production adapter

- **Signup:** in one transaction insert an account with a case-insensitive unique signup name. Reserve 'Tdot' in all casing and reject invalid display names. Store only token hashes.
- **Wallet debit/credit:** BEGIN; lock the account row with `SELECT ... FOR UPDATE`; check existing `(account_id, operation_id)`; validate balance and credit limit; update balance; insert operation; COMMIT. If an operation key already exists with identical amount/reason, return idempotent success without touching balance. On conflict of amount/reason, reject.
- **Tournament register:** BEGIN; lock tournament row first to serialize seat capacity; lock account row second; check bracket open and capacity; check existing account entry; debit exactly 25 credits and insert a unique operation; insert unique roster seat; COMMIT. A registration must never be charged without a committed seat.
- **Tournament cancellation/withdrawal:** BEGIN; lock tournament, then account; check entry and whether cancellation is still permitted; use idempotent refund operation; mark entry cancelled; COMMIT. Never reuse a withdrawn registration ID, and never refund after tournament start.
- **Public match:** seat reservation and debit must have a durable match entry key; ensure replays, reconnects and duplicate sockets do not deduct twice. Compensate failed pregame reservations transactionally. Match starts and completion should be durably recorded before settling charges.
- **Daily award:** server chooses calendar day in UTC; event key `daily:YYYY-MM-DD`; one award per account/day; reject user-supplied date.
- **Rewarded ads:** never accept browser 'watched' assertions or award credits before server-side provider verification. Store a unique provider event ID scoped globally to prevent one verified event being redeemed across multiple accounts. Verify signatures, age/privacy policy, and provider terms.
- **Recovery:** rate limit account registration and authentication, add recovery flows, backups, retention/privacy policy, and audit records before launch.
- **Operations:** use Render Postgres with backups and appropriate retention, not an ephemeral disk. Set credentials in Render secrets only. No credentials in GitHub. Confirm iPhone Safari and real Render restart behavior.

### Before enabling

Implement the PostgreSQL adapter and swap both wallet and tournament roster onto one transaction boundary. Then run concurrent two-process registration/debit tests, crash/restart/reconnect tests, account recovery tests, full test suite, live mobile visual tests, and verified rewarded-web SSV integration. Keep `DOMINO_CREDITS_ENABLED=false` until all pass.
