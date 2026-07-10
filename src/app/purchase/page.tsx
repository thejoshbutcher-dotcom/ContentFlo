import Image from "next/image";
import { getUser } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe";
import BuyButton from "./BuyButton";

export default async function PurchasePage() {
  const user = await getUser();
  const configured = isStripeConfigured();

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <Image
          src="/brand/logo-white.png"
          alt="CreatorFlo"
          width={168}
          height={38}
          priority
          className="auth-logo"
        />
        <h1 className="auth-title">Get CreatorFlo</h1>
        <p className="auth-sub">
          {user
            ? `${user.email} doesn't have access yet. Buy once and it's yours — plan, script, and publish from one workspace.`
            : "Buy once and it's yours. Plan, script, and publish from one workspace."}
        </p>

        {configured ? (
          <BuyButton email={user?.email ?? undefined} />
        ) : (
          <p className="auth-error">
            Payments aren&apos;t configured yet. Add your Stripe keys to enable
            checkout.
          </p>
        )}

        <p className="auth-foot">
          Already bought?{" "}
          <a href="/login">Sign in with the email you paid with.</a>
        </p>

        {user && (
          <form action="/auth/signout" method="post" className="auth-foot">
            <button type="submit" className="link-btn">
              Sign out
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
