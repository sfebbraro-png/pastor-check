// Stripe: a church pays $99 a year by card, renewing automatically.
// Railway variables:
//   STRIPE_SECRET_KEY      - from Stripe, Developers > API keys (starts with sk_live_ or sk_test_)
//   STRIPE_WEBHOOK_SECRET  - from Stripe, after adding the webhook (starts with whsec_)
//   STRIPE_PRICE_CENTS     - optional, defaults to 9900 ($99.00)
import Stripe from 'stripe';
import * as db from './db.js';
import { notify, toChurch } from './notify.js';

// STRIPE_API_BASE is only for the automated tests, which point at a stand-in Stripe server.
const testBase = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, testBase ? { host: testBase.hostname, port: Number(testBase.port), protocol: testBase.protocol.replace(':', '') } : undefined)
  : null;
export const stripeReady = () => !!stripe;
export const PRICE_CENTS = Number(process.env.STRIPE_PRICE_CENTS) || 9900;
export const priceText = () => `$${(PRICE_CENTS / 100).toFixed(PRICE_CENTS % 100 ? 2 : 0)}`;

const ymd = unix => new Date(unix * 1000).toISOString().slice(0, 10);
const fmt = s => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Send the church office to Stripe's payment page.
export async function checkoutUrl(church, baseUrl) {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: PRICE_CENTS,
        recurring: { interval: 'year' },
        product_data: { name: 'Is This Really Pastor? (one church, one year)' },
      },
    }],
    client_reference_id: String(church.id),
    metadata: { church_id: String(church.id) },
    subscription_data: { metadata: { church_id: String(church.id) }, description: church.name },
    ...(church.stripe_customer_id ? { customer: church.stripe_customer_id } : { customer_email: church.admin_email }),
    success_url: `${baseUrl}/admin?paid=1`,
    cancel_url: `${baseUrl}/admin`,
  });
  return session.url;
}

async function paidThrough(subscriptionId) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const end = sub.items?.data?.[0]?.current_period_end || sub.current_period_end;
  return { sub, paidUntil: end ? ymd(end) : '' };
}
function churchForSubscription(sub) {
  return db.getChurchBySubscription(sub.id) || db.getChurchById(Number(sub.metadata?.church_id));
}
function subscriptionIdOf(invoice) {
  const s = invoice.parent?.subscription_details?.subscription || invoice.subscription;
  return typeof s === 'string' ? s : s?.id;
}

// Stripe calls this when something happens. Raw body is needed to check the signature.
export async function handleWebhook(rawBody, signature) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return { status: 400, text: 'Stripe is not set up' };
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return { status: 400, text: 'Bad signature' };
  }
  if (!db.stripeEventIsNew(event.id)) return { status: 200, text: 'already handled' };
  const o = event.data.object;

  if (event.type === 'checkout.session.completed' && o.mode === 'subscription') {
    const church = db.getChurchById(Number(o.client_reference_id || o.metadata?.church_id));
    if (church && o.subscription) {
      const subId = typeof o.subscription === 'string' ? o.subscription : o.subscription.id;
      const { paidUntil } = await paidThrough(subId);
      db.setStripePaid(church.id, typeof o.customer === 'string' ? o.customer : o.customer?.id, subId, paidUntil);
      await notify(church.id, 'paid', `${church.name} paid ${priceText()} by card`,
        `${church.name} paid ${priceText()} by card. They're paid through ${fmt(paidUntil)} and it renews automatically each year.`, `paid:${event.id}`);
    }
  }

  if (event.type === 'invoice.paid' && o.billing_reason === 'subscription_cycle') {
    const subId = subscriptionIdOf(o);
    if (subId) {
      const { sub, paidUntil } = await paidThrough(subId);
      const church = churchForSubscription(sub);
      if (church) {
        db.setPaidUntil(church.id, paidUntil);
        await notify(church.id, 'renewed', `${church.name} renewed`,
          `${church.name}'s card was charged ${priceText()} for another year. Paid through ${fmt(paidUntil)}.`, `renewed:${event.id}`);
      }
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const subId = subscriptionIdOf(o);
    const church = subId ? churchForSubscription(await stripe.subscriptions.retrieve(subId)) : null;
    if (church) await notify(church.id, 'payment_failed', `${church.name}: card payment failed`,
      `Stripe couldn't charge ${church.name}'s card. Stripe will try again over the next few days.`, `failed:${event.id}`, toChurch.paymentFailed(church));
  }

  if (event.type === 'customer.subscription.deleted') {
    const church = churchForSubscription(o);
    if (church && church.stripe_subscription_id === o.id) {
      db.setCancelled(church.id);
      await notify(church.id, 'cancelled', `${church.name} cancelled`,
        `${church.name}'s yearly card payment was cancelled in Stripe, so their members' page is now paused. If that was a mistake, set them back to "paid" on the owner page.`, `cancelled:${event.id}`);
    }
  }

  return { status: 200, text: 'ok' };
}
