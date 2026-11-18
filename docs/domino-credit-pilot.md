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
