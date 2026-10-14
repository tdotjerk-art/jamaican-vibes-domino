# Jamaican Vibes Domino: membership launch

The game remains free to play. VIP costs C$9.99/month and adds password-protected
rooms, gold/emerald table rims and the last 20 completed online match results.
No betting, cash prizes or purchasable competitive advantages are included.

## Run and test

Requires Node 22.13 or newer (Node 24 recommended).

```sh
npm ci
npm test
npm start
```

Open http://localhost:3000. Create an account through Account & VIP. Save the
one-time recovery code; email delivery is not integrated. Recovery rotates that
code and invalidates all existing sign-in sessions, including connected sockets.
Only one concurrent request can consume a recovery code. Signing out disconnects
the sockets using that session; other signed-in sessions are unaffected. A seated
player's game pauses under the existing 90-second reconnect rule. Sign in again
and use Reconnect to last room to reclaim the account's seat within that window.
Guests can still play free.
Accounts are associated with new online rooms after sign-in; an existing guest
match is not retroactively associated with an account. Only completed online
matches count toward saved statistics. Single-player results stay local.

## Storage and hosting

Member data and sessions are stored in SQLite. Set DATABASE_PATH to a persistent
disk before accepting real users. Back up the database using SQLite's backup API
or stop the service and copy the database and its WAL files together. Test restore.
Run one server instance; game rooms remain in memory and restart on deployment.
The default free Render configuration is for testing, not durable memberships.
render.memberships.yaml is an optional paid-service example, not a deployed service.
Review hosting charges before provisioning it. Keep the current service until
the replacement is verified and any existing member data has been migrated.

Set APP_URL to the exact public HTTPS origin and NODE_ENV=production. Use a
single trusted reverse proxy; the app trusts one proxy hop for rate limiting.
Never commit real secrets. .env.example lists required settings; it is not loaded
automatically. Supply variables in your host dashboard.

## Connect Stripe in test mode first

1. Create a recurring Stripe Price: CAD 9.99, monthly, one month per interval.
2. Set STRIPE_SECRET_KEY and STRIPE_VIP_PRICE_ID to the test values.
3. Add a webhook endpoint at https://YOUR-HOST/api/billing/webhook.
4. Subscribe to checkout.session.completed, customer.subscription.created,
   customer.subscription.updated, customer.subscription.deleted,
   customer.subscription.paused, customer.subscription.resumed, invoice.paid,
   and invoice.payment_failed. Set STRIPE_WEBHOOK_SECRET to that endpoint's secret.
5. Configure Stripe Customer Portal to allow payment-method updates and
   cancellation at the end of the current paid period.
6. Complete a test Checkout, check VIP activation, create a password-protected
   room and have free guests join. Verify wrong-password rejection for players
   and spectators. Check renewal, failed payment, cancellation and duplicate
   webhook deliveries. Payment success URLs do not grant membership by themselves.
7. Publish your operator identity, support contact, privacy policy and membership
   terms (renewals, cancellation, refunds and applicable taxes) before charging
   customers. Decide tax collection with your accountant and configure it in
   Stripe/Checkout as appropriate; automatic tax is not enabled by this change.
8. Switch to live Stripe keys, live Price and live webhook secret only after
   the test flow and owner setup are complete. Never share secret keys in chat.

VIP is activated only by a signed webhook and current Stripe subscription state
with the configured price. Expired, canceled, unpaid and past-due memberships do
not unlock paid features. Cancellation at period end preserves access while the
subscription remains active and within its paid period. Billing must be connected
before Join VIP is enabled. If webhook deliveries fail, retry them in Stripe.

## Before inviting players

- Test four actual phones/computers: create/join/ready, instant legal moves,
  hidden hands, blocked reveal, inactive timers, reconnect and rematch.
- Test portrait and landscape, corners near the table rim and the Rules panel.
- Provide a support route for lost recovery codes; there is no email reset yet.
- Handle refunds/disputes in Stripe, update or cancel the related subscription
  as appropriate, and verify the subscription webhook updates access.
- Keep a database backup and confirm paid member accounts survive redeployment.

Automated integration tests use simulated Stripe responses with actual SDK
signature verification. They do not establish that a live Stripe account or
public deployment has been configured.

Security regression tests force overlapping recovery/login requests and signed
webhook deliveries, and exercise session revocation and spectator transitions
over real local Socket.IO connections. Subscription retrieval and persistence are
serialized per subscription within the required single server process; failed
syncs remain retryable. Do not run multiple billing/game server processes.
