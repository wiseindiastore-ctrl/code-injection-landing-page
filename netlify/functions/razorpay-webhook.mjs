import crypto from "node:crypto";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const resendKey = process.env.RESEND_API_KEY;
  const deliveryUrl = process.env.DELIVERY_URL;
  const supportEmail = process.env.SUPPORT_EMAIL;
  const fromEmail = process.env.FROM_EMAIL;
  if (!webhookSecret || !keyId || !keySecret || !resendKey || !deliveryUrl || !supportEmail || !fromEmail) {
    return json({ error: "Webhook or delivery is not fully configured." }, 500);
  }

  const rawBody = await request.text();
  const received = request.headers.get("x-razorpay-signature") || "";
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  if (!received || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return json({ error: "Invalid webhook signature" }, 400);
  }

  let event;
  try { event = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (event.event !== "payment.captured") return json({ received: true, ignored: true });

  const payment = event.payload?.payment?.entity;
  if (!payment?.id || !payment?.order_id || payment.amount !== 28900 || payment.currency !== "INR" || payment.status !== "captured") {
    return json({ error: "Unexpected payment payload" }, 400);
  }

  // Retrieve the server-created order to obtain the email saved in its notes.
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const orderResponse = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(payment.order_id)}`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  const order = await orderResponse.json();
  if (!orderResponse.ok || order.amount !== 28900 || order.currency !== "INR") return json({ error: "Could not validate Razorpay order" }, 502);
  const email = String(order.notes?.customer_email || payment.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Customer email missing from payment/order" }, 422);

  const mailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `delivery-${payment.id}` },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      reply_to: supportEmail,
      subject: "Your Shopify Liquid Library access",
      html: `<p>Hi,</p><p>Your payment of ₹289 has been verified successfully.</p><p><a href="${deliveryUrl}">Click here to access your Shopify Liquid Library</a></p><p>If you need help, reply to this email or contact ${supportEmail}.</p><p>Thank you,<br>Code Injection</p>`
    })
  });
  if (!mailResponse.ok) return json({ error: "Delivery email failed; webhook can be retried." }, 502);
  return json({ received: true, delivered: true });
};
