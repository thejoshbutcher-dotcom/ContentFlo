import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

// Signature verification needs the raw body and Node crypto.
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Must be the raw text. Parsing as JSON first would break the signature.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch (err) {
    console.error("[stripe] bad signature", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  // Stripe retries on any non-2xx, and can deliver the same event more than
  // once. Claim the id first; if it's taken, this is a replay.
  const { error: claimErr } = await admin
    .from("stripe_events")
    .insert({ id: event.id });
  if (claimErr) {
    if (claimErr.code === "23505") {
      return NextResponse.json({ received: true, replay: true });
    }
    console.error("[stripe] could not record event", claimErr);
    return NextResponse.json({ error: "Storage error" }, { status: 500 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const email =
        session.customer_details?.email ?? session.customer_email ?? null;

      if (!email) {
        console.error("[stripe] completed session with no email", session.id);
      } else if (session.payment_status === "paid") {
        const { error } = await admin.from("purchases").upsert({
          id: session.id,
          email: email.trim().toLowerCase(),
          status: "active",
          stripe_customer_id:
            typeof session.customer === "string" ? session.customer : null,
          stripe_payment_intent:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
        });
        if (error) throw error;
      }
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      if (typeof charge.payment_intent === "string") {
        const { error } = await admin
          .from("purchases")
          .update({ status: "refunded" })
          .eq("stripe_payment_intent", charge.payment_intent);
        if (error) throw error;
      }
    }
  } catch (err) {
    // Release the claim so Stripe's retry can succeed.
    await admin.from("stripe_events").delete().eq("id", event.id);
    console.error("[stripe] handler failed", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
