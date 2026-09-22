"use client";

import { CreditCard } from "lucide-react";

/**
 * Checkout is a Stripe Payment Link, configured in the Stripe dashboard (price,
 * promotion codes, the thank-you redirect). The signed-in email is pre-filled
 * so the purchase is keyed to the account that will sign in afterwards.
 */
const PAYMENT_LINK =
  process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ??
  "https://buy.stripe.com/8x2fZhaQA416a7SaOl18c02";

export default function BuyButton({ email }: { email?: string }) {
  const href = email
    ? `${PAYMENT_LINK}?prefilled_email=${encodeURIComponent(email)}`
    : PAYMENT_LINK;

  return (
    <a className="btn btn-amber auth-cta" href={href}>
      <CreditCard size={15} /> Buy CreatorFlo
    </a>
  );
}
