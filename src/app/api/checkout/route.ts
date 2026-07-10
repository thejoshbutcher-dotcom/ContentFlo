import { NextResponse, type NextRequest } from "next/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/** Starts a one-time Stripe Checkout session. */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const price = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;

  if (!stripe || !price) {
    return NextResponse.json(
      { error: "Payments aren't configured yet." },
      { status: 503 }
    );
  }

  let email: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.email === "string") email = body.email.trim().toLowerCase();
  } catch {
    /* email is optional; Stripe will collect one */
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price, quantity: 1 }],
    customer_email: email,
    // Land back on /login so the buyer creates their account with the email
    // they just paid with — that is what proves ownership.
    success_url: `${origin}/login?purchased=1`,
    cancel_url: `${origin}/purchase?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
