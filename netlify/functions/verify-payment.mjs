import crypto from "node:crypto";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const resendKey = process.env.RESEND_API_KEY;
  const deliveryUrl = process.env.DELIVERY_URL;
  const supportEmail = process.env.SUPPORT_EMAIL;
  const fromEmail = process.env.FROM_EMAIL;
  if (!keyId || !keySecret || !resendKey || !deliveryUrl || !supportEmail || !fromEmail) {
    return json({ error: "Payment verification or delivery is not fully configured. Contact support before retrying." }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const orderId = String(body.razorpay_order_id || "");
  const paymentId = String(body.razorpay_payment_id || "");
  const signature = String(body.razorpay_signature || "");
  const email = String(body.email || "").trim();
  if (!orderId.startsWith("order_") || !paymentId.startsWith("pay_") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-f0-9]{64}$/i.test(signature)) {
    return json({ error: "Missing or invalid payment details." }, 400);
  }

  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return json({ error: "Payment signature could not be verified." }, 400);

  // Confirm the payment with Razorpay itself, not just the browser callback.
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  const payment = await paymentResponse.json();
  if (!paymentResponse.ok || payment.order_id !== orderId || payment.amount !== 28900 || payment.currency !== "INR" || !["captured"].includes(payment.status)) {
    return json({ error: "Payment is not yet captured. Please contact support with your payment ID." }, 409);
  }

  // Resend idempotency key helps prevent duplicate delivery for repeated callback requests.
  const mailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `delivery-${paymentId}` },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      reply_to: supportEmail,
      subject: "Your Shopify Liquid Library access",
      html: `<p>Hi,</p><p>Your payment of ₹289 has been verified successfully.</p><p><a href="${deliveryUrl}">Click here to access your Shopify Liquid Library</a></p><p>If you need help, reply to this email or contact ${supportEmail}.</p><p>Thank you,<br>Code Injection</p>`
    })
  });
  const mail = await mailResponse.json();
  if (!mailResponse.ok) return json({ error: "Payment is verified, but the delivery email could not be sent. Contact support with payment ID: " + paymentId }, 502);
  // The link is only returned after the payment is verified and captured.
  return json({ verified: true, delivered: true, downloadUrl: deliveryUrl });
};
