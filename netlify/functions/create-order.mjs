const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return json({ error: "Payment gateway is not configured yet." }, 500);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const email = String(body.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "A valid email is required." }, 400);

  const amount = 28900; // Fixed server-side price: ₹289, not accepted from browser input.
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency: "INR", receipt: `ci_${Date.now()}`, notes: { product: "Shopify Liquid Library", customer_email: email } })
  });
  const order = await response.json();
  if (!response.ok) return json({ error: order.error?.description || "Razorpay could not create the order." }, 502);
  return json({ keyId, orderId: order.id, amount: order.amount, currency: order.currency });
};
