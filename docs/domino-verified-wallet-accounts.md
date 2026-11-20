# Verified wallet identity and recovery (development-only)

This is an opt-in SQLite pilot for Jamaican Vibes **Domino credit wallets**, not a deployed cross-game account system. The live game has the credit feature disabled. Practice and private friend games remain free.

## Ownership and signup
- Enable `DOMINO_VERIFIED_EMAIL_REQUIRED=true` only in isolated staging together with `DOMINO_CREDITS_ENABLED=true`, `DOMINO_CREDIT_STORAGE=sqlite` and a fresh staging SQLite database.
- Registration accepts a distinct player name (no case-insensitive `Tdot` substring) and email address. Email addresses are case-normalized and unique. Existing signup throttles remain: eight per connection per UTC day, 100 globally per day.
- Registration creates a **pending** wallet and mails a random, 192-bit verification code through the configured email service. No wallet credential is exposed by the registration API until code verification succeeds.
- The code is stored only as a SHA-256 digest, expires after 15 minutes, and can be redeemed once. Verification rotates the temporary credential and returns the account's first usable credential.
- An unverified wallet cannot authenticate or spend/claim credits. A pending-account verification resend is bound to account ID plus registered email, throttled to 15-minute intervals and five per UTC day.
- Existing accounts created under the prior unverified pilot do **not** become verified by enabling this flag. Migration/ownership verification for preexisting pilot wallets must be reviewed before activation.

## Lost-code recovery
- A verified player requests a recovery email. The API returns the same response for nonexistent and registered email addresses.
- A random 192-bit code is sent to the previously verified address; it expires after 15 minutes and has a 15-minute send cooldown and five-per-day quota per account.
- Submitting the correct email/code pair **transactionally** replaces the wallet credential and consumes the code. Reusing the old wallet credential or email challenge is rejected.
- Live paid sockets are revoked with the existing `revokePaidSessions` function; wallet ID, name, credits, and tournament entries are preserved.
- Email codes are required to prove control of that mailbox; email verification is not proof of a distinct real-world person. Multiple aliases/accounts and mailbox compromise remain risk factors.

## Email provider
- Production delivery requires a configured, approved Resend sender using the secrets `DOMINO_EMAIL_RESEND_API_KEY` and `DOMINO_EMAIL_FROM` **only on the server**, with a verified sender domain. Do not commit secrets.
- The server fails closed on Render credit activation without `DOMINO_VERIFIED_EMAIL_REQUIRED=true` and a configured email sender; the existing durable disk and release readiness checks still apply.
- A local-only test outbox can be enabled with `DOMINO_EMAIL_TEST_OUTBOX=/absolute/path` when `RENDER` is not `true`; never use this in production. No real emails are sent in isolated tests.
- An email-provider failure leaves a pending, unusable wallet rather than an active wallet or exposed credential. The client can retry sending verification later (cooldown applies).
- Ensure provider domain validation, email consent/privacy notices, rate limits, logging that excludes codes, provider delivery metrics, abuse checks and support policy before launch.

## Endpoints (only when the pilot is enabled)
- `POST /api/domino/wallet/register` with `{name,email}`
- `POST /api/domino/wallet/verify-email` with `{id,code}`
- `POST /api/domino/wallet/resend-email` with `{id,email}`
- `POST /api/domino/wallet/recovery-email` with `{email}`
- `POST /api/domino/wallet/recovery-complete` with `{email,code}`
- Existing authenticated `rotate-recovery` still works when already signed in.

## Test and release controls
- Unit tests: `node --test test/domino-verified-email-recovery.test.js`
- Isolated HTTP/email test: `node --test test/domino-verified-email-api.test.js`
- Full suite: `npm test`; GitHub wallet security workflow includes both new tests.
- **Not yet a verified passing release:** new test run statuses, actual Resend delivery/verified-domain credentials, browser-based signup/recovery, physical iPhone Safari, production disk/restarts, verified ad callback and publisher approval remain separate launch gates. No credit activation or live deployment is authorized by this implementation.
