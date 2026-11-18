# Domino credit wallet pilot (not live)

This branch introduces the **wallet foundation only**. It does not turn on payment gates, issue browser tokens, show ads, or change the deployed application.

## Proposed entry rules

| Mode | Credits |
| --- | ---: |
| Online public table | 10 per completed match entry |
| Tournament | 25 per entry |
| Computer practice | 0 |
| Private friends room | 0 |

New verified accounts receive 100 credits. A new day may grant 20 credits once and a provider-verified rewarded ad event may grant 30 once. Both are idempotent by event ID.

## Integration requirements before enabling

1. Integrate trusted login and authenticated account IDs with the Socket.IO server. **Do not use a client-supplied display name as wallet identity.** Existing public-table entry accepts names, so no gate should be activated until this is solved.
2. Store wallet records on confirmed durable storage or a transactional shared database. The filesystem adapter uses atomic replacement but is not a multi-instance database and does not support cross-process locking.
3. Charge **once per complete match or tournament registration**, not for each hand. Explicitly define rematch as a new paid match or keep it free; never silently charge.
4. Perform atomic entry charge and seat reservation. Refund when joining fails before the match starts and prevent second charges on reconnection, refresh and duplicate events.
5. Verify reward completion with the advertising provider on the server; do not accept client claims of completed ads. Enforce provider policy, privacy and abuse limits.
6. Provide visible wallet balance and insufficient-credits recovery in the public lobby. Practice and private friends games must work without balance.
7. Verify server restart, reconnect, forced disconnect, two simultaneous requests, iPhone Safari portrait/landscape, private mode bypass and refund logic.
8. Keep this work as a draft pull request until all end-to-end tests and policy review pass. No deployment before that.

## Test

Run `npm test` or `node --test test/domino-wallet.test.js`.

This is a development-only staged implementation, not a complete functional credit system.
