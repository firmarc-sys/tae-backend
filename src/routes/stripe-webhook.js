const prisma = require('../db');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

const PLAN_TOKENS = {
  demo: 5000,
  starter: 50000,
  pro: 500000,
  enterprise: 10000000,
};

// Stripe webhook endpoint handler
module.exports = async function stripeWebhook(req, res) {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook verification failed' });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.sios_user_id;
        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          const priceId = sub.items.data[0]?.price?.id;

          // Map price ID to plan
          let plan = 'starter';
          if (priceId === process.env.STRIPE_PRICE_PRO) plan = 'pro';

          await prisma.user.update({
            where: { id: userId },
            data: {
              plan,
              stripe_subscription_id: session.subscription,
              tokens_limit: PLAN_TOKENS[plan],
              tokens_used: 0,
              renewal_date: new Date(sub.current_period_end * 1000),
            },
          });

          await prisma.alert.create({
            data: {
              user_id: userId,
              type: 'plan_upgraded',
              message: `Welcome to ${plan.charAt(0).toUpperCase() + plan.slice(1)}! Your token allocation has been updated.`,
            },
          });

          console.log(`User ${userId} upgraded to ${plan}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const user = await prisma.user.findFirst({
          where: { stripe_customer_id: customerId },
        });
        if (user) {
          // Reset tokens on renewal
          await prisma.user.update({
            where: { id: user.id },
            data: {
              tokens_used: 0,
              renewal_date: new Date(invoice.lines.data[0]?.period?.end * 1000 || Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });
          console.log(`Tokens reset for user ${user.id} on renewal`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const user = await prisma.user.findFirst({
          where: { stripe_customer_id: customerId },
        });
        if (user) {
          await prisma.alert.create({
            data: {
              user_id: user.id,
              type: 'payment_failed',
              message: 'Your payment failed. Please update your payment method to continue using SIOS.',
            },
          });
          console.log(`Payment failed for user ${user.id}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const user = await prisma.user.findFirst({
          where: { stripe_customer_id: customerId },
        });
        if (user) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan: 'demo',
              stripe_subscription_id: null,
              tokens_limit: PLAN_TOKENS.demo,
            },
          });
          await prisma.alert.create({
            data: {
              user_id: user.id,
              type: 'plan_downgraded',
              message: 'Your subscription has ended. You are now on the Demo plan.',
            },
          });
          console.log(`Subscription cancelled for user ${user.id}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};
