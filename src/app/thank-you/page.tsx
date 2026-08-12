import Image from "next/image";
import { getStripe } from "@/lib/stripe";
import FacebookPurchasePixel from "./FacebookPurchasePixel";

/**
 * Post-checkout landing page. Two jobs:
 *
 *  1. Tell the buyer what happens next — the app is email-link based, so
 *     "check your inbox" is the actual instruction, not a nicety.
 *  2. Give the Meta pixel a dedicated URL to fire Purchase on.
 *
 * The sale is confirmed against Stripe here rather than trusted from the URL,
 * so simply visiting /thank-you never reports a conversion and the reported
 * value is the real amount charged. Entitlement itself still comes from the
 * webhook — this page only reports, it never grants.
 */

export const dynamic = "force-dynamic";

async function confirmedPurchase(sessionId: string | undefined) {
  if (!sessionId) return null;
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return null;
    return {
      id: session.id,
      email: session.customer_details?.email ?? null,
      // Stripe reports minor units (cents); Meta wants a decimal amount.
      value: session.amount_total ? session.amount_total / 100 : undefined,
      currency: session.currency?.toUpperCase(),
    };
  } catch {
    // A bad or expired id just means no pixel — never a broken page.
    return null;
  }
}

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const purchase = await confirmedPurchase(session_id);
  const pixelId = process.env.NEXT_PUBLIC_FB_PIXEL_ID;

  return (
    <div className="auth-screen">
      {pixelId && purchase && (
        <FacebookPurchasePixel
          pixelId={pixelId}
          eventId={purchase.id}
          value={purchase.value}
          currency={purchase.currency}
        />
      )}

      <div className="auth-card">
        <Image
          src="/brand/logo-white.png"
          alt="CreatorFlo"
          width={168}
          height={38}
          priority
          className="auth-logo"
        />
        <h1 className="auth-title">You&apos;re in. Thank you!</h1>
        <p className="auth-sub">
          {purchase?.email ? (
            <>
              Your purchase is confirmed and a receipt is on its way to{" "}
              <strong>{purchase.email}</strong>. Sign in with that same address
              — it&apos;s what unlocks your access.
            </>
          ) : (
            <>
              Your purchase is confirmed. Sign in with the email address you
              paid with — it&apos;s what unlocks your access.
            </>
          )}
        </p>

        <a className="btn btn-amber auth-cta" href="/login">
          Sign in to CreatorFlo
        </a>

        <p className="auth-foot">
          We&apos;ll email you a sign-in link — no password to remember. Check
          your spam folder if it hasn&apos;t arrived in a minute.
        </p>
      </div>
    </div>
  );
}
