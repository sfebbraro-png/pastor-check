# Is This Really Pastor?

A web app church members use to check whether a text or email really came from their pastor or church staff.

## How churches come in

Churches can't sign themselves up. They try the demo at `/c/demo`, then send a request at `/start`.
The owner (Steve) sees requests on `/owner`, presses "Set up this church", tests it, and sends the church office a one-time hand-off link.
The free month (30 days) starts when the office takes over. After it ends there is a 7-day grace week, then the members' page pauses
(it tells members to call the office instead). Paying by card through Stripe ($99 a year, renews automatically) turns it on right away.
The owner can also mark a church paid by hand, change the free-month end date, or delete test churches.

Everything happens by email. The app emails the church office its hand-off link, a welcome with its members' link and flyer,
a reminder 5 days before the free month ends, a grace-week notice, a paused notice, and failed-payment notices. Stripe sends the receipts.
A church that sends a request gets an automatic reply. The owner gets notices (on `/owner` under "What's happened", and by email once Resend is set up) for: a new request,
a church taking over its page, a church's first member check, 5 days left in a free month, free month over, page paused,
card payment, renewal, failed payment, and cancellation. Checks made while logged in as the church office or the owner count as tests.

## What's in here

- `server.js` web server, pages, login, and the check API
- `billing.js` Stripe checkout and the webhook that marks churches paid
- `notify.js` notices to the owner, email through Resend, and the hourly free-month sweep
- `check.js` the scam check: code rules first, then Claude explains it in plain words. The code has the final say, and there is no "safe" verdict.
- `views.js` the HTML pages
- `db.js` SQLite database (Node's built-in sqlite)
- `public/` styles and the member page script
- `test/run-tests.js` sample scam messages (`npm test`)
- `test/flow-test.js` walks the whole business flow with a stand-in Stripe (`npm run test:flow`)

## Run it locally

    npm install
    npm start            # http://localhost:3000, demo church at /c/demo

## Railway settings

- Start command: `npm start` (Railway detects it)
- Volume mounted at `/data`
- Variables:
  - `ANTHROPIC_API_KEY` your Anthropic key (set in Railway, never in code)
  - `DATA_DIR=/data`
  - `NODE_ENV=production`
  - optional `PUBLIC_URL` once you have your own domain, e.g. `https://isthisreallypastor.com`
  - optional `ANTHROPIC_WORKSPACE_ID` (starts with `wrkspc_`), only needed if the API key isn't tied to a workspace
  - optional `ANTHROPIC_MODEL` to change the AI model (default `claude-haiku-5-5`)
  - `OWNER_SETUP_CODE` lets the owner account be created once at `/owner/setup`
  - `RESEND_API_KEY` turns on all email (from resend.com, with the isthisreallypastor.com domain verified there).
    Email is sent as steve@isthisreallypastor.com, and replies go to that Namecheap mailbox.
    Optional `SUPPORT_EMAIL` (default steve@isthisreallypastor.com), `NOTIFY_EMAIL` (where notices to the owner go, default SUPPORT_EMAIL), `EMAIL_FROM`.
    Railway's Hobby plan blocks sending through a mailbox directly (SMTP), which is why the app uses Resend.
  - `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` turn on card payments. In Stripe, add a webhook to
    `https://isthisreallypastor.com/stripe/webhook` for these events: `checkout.session.completed`, `invoice.paid`,
    `invoice.payment_failed`, `customer.subscription.deleted`. Optional `STRIPE_PRICE_CENTS` (default 9900).

Without an API key the app still works using the code rules alone.
