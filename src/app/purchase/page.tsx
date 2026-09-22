import Image from "next/image";
import { redirect } from "next/navigation";
import { hasPurchase } from "@/lib/entitlement";
import { getUser } from "@/lib/supabase/server";
import BuyButton from "./BuyButton";

export default async function PurchasePage() {
  const user = await getUser();
  // Someone who already owns it has nothing to buy here.
  if (user && (await hasPurchase(user.email))) redirect("/");

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

        <BuyButton email={user?.email ?? undefined} />

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
