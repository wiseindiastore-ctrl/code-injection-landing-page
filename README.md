# Code Injection landing page — Netlify + Razorpay starter

This folder contains the edited landing page and two Netlify Functions:
- `create-order`: creates a fixed ₹289 INR Razorpay order on the server.
- `verify-payment`: verifies the Razorpay HMAC signature, checks payment status/amount with Razorpay, then sends the delivery email through Resend.
- `razorpay-webhook`: independently handles Razorpay `payment.captured`, so delivery can still happen if the buyer closes the checkout tab after paying.

## Before deploying

1. Replace `YOUR_META_PIXEL_ID` in `index.html` with your Meta Pixel ID.
2. Replace `SUPPORT_EMAIL_PLACEHOLDER` in `index.html` with your customer-support email (or change the mailto link).
3. Add these environment variables in Netlify → Project configuration → Environment variables. Make sure the scope includes Functions:
   - `RAZORPAY_KEY_ID` — Razorpay API Key ID (test key first, live key only after testing)
   - `RAZORPAY_KEY_SECRET` — Razorpay API Key Secret (NEVER put this in HTML or share it in chat)
   - `RESEND_API_KEY` — Resend API key
   - `DELIVERY_URL` — the URL of the digital product download/access page
   - `SUPPORT_EMAIL` — support email address
   - `FROM_EMAIL` — a sender address verified in Resend, e.g. `Code Injection <orders@yourdomain.com>`
   - `RAZORPAY_WEBHOOK_SECRET` — the webhook secret you choose when adding the webhook in Razorpay Dashboard

The current checkout amount is ₹289, fixed independently in both browser display and server function. If you change the selling price, update the amount in `index.html`, `create-order.mjs`, and `verify-payment.mjs`.

## Deploy

Upload this entire folder to a Git repository and import it into Netlify, or deploy it with Netlify CLI. Do not upload only `index.html`; the `netlify/functions` folder and `netlify.toml` are required for payment processing.

## Test safely

Use Razorpay Test Mode keys first. Test a successful captured payment and a failed/cancelled payment. Confirm that only a captured ₹289 payment triggers the email. Then switch to Live Mode keys in Netlify environment variables and redeploy.

## Important production notes

- Do not expose Razorpay Key Secret, Resend API key, or a private download credential in client-side HTML.
- `DELIVERY_URL` is emailed to the buyer. If it is a public file URL, buyers can forward it. For protected downloads, use expiring signed URLs and a persistent order/delivery database.
- This starter verifies the Checkout callback and payment status with Razorpay. The `payment.captured` webhook is included. Configure it in Razorpay Dashboard to call `https://YOUR-DOMAIN/.netlify/functions/razorpay-webhook`, subscribe to `payment.captured`, and use the same webhook secret in Netlify. Resend idempotency keys reduce duplicate emails. For larger-scale fulfilment, add persistent order/delivery records and reconciliation.
- Meta Pixel `Purchase` is fired in the browser only after the server endpoint reports verification. For stronger attribution and deduplication, add Meta Conversions API server-side with `event_id` deduplication.
- Ensure you have the rights to distribute every theme/template included in the product library, and publish accurate Privacy, Terms, and Refund pages before running ads.
