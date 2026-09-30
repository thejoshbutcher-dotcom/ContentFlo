import Image from "next/image";
import { redirect } from "next/navigation";
import { hasPurchase } from "@/lib/entitlement";
import { createSupabaseServer, getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Supabase Auth's OAuth 2.1 server sends people here (the "Authorization
 * Path") when an app like Claude asks to connect to their CreatorFlo account.
 * They sign in with CreatorFlo's usual sign-in, then Allow or Deny.
 */

async function decide(formData: FormData) {
  "use server";
  const id = String(formData.get("authorization_id") ?? "");
  const allow = formData.get("decision") === "allow";
  const supabase = await createSupabaseServer();
  if (!supabase || !id) redirect("/");
  // A licence is required to connect, however the form was submitted.
  const user = await getUser();
  if (allow && !(await hasPurchase(user?.email))) redirect("/purchase");
  const { data, error } = allow
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) {
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&error=1`);
  }
  redirect(data.redirect_url);
}

function Card({ children }: { children: React.ReactNode }) {
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
        {children}
      </div>
    </div>
  );
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
  const { authorization_id: id, error: failed } = await searchParams;
  if (!id) {
    return (
      <Card>
        <h1 className="auth-title">Nothing to approve</h1>
        <p className="auth-sub">
          This page opens when an app asks to connect to your CreatorFlo account. Start
          from the app you&rsquo;re connecting.
        </p>
      </Card>
    );
  }

  const user = await getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);
  }

  const supabase = await createSupabaseServer();
  const { data, error } = supabase
    ? await supabase.auth.oauth.getAuthorizationDetails(id)
    : { data: null, error: new Error("Sign-in isn't configured.") };

  if (error || !data) {
    return (
      <Card>
        <h1 className="auth-title">This request has expired</h1>
        <p className="auth-sub">
          Go back to the app you were connecting and click Connect again.
        </p>
      </Card>
    );
  }
  // Already approved before for these permissions: straight back to the app.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const licensed = await hasPurchase(user.email);
  const app = data.client?.name?.trim() || "An app";

  return (
    <Card>
      <h1 className="auth-title">Connect {app}?</h1>
      {licensed ? (
        <>
          <p className="auth-sub">
            <strong>{app}</strong> wants to read and edit your CreatorFlo boards as{" "}
            <strong>{user.email}</strong>.
          </p>
          <ul className="consent-list">
            <li>See the boards you own and the ones shared with you</li>
            <li>Read cards, and write boxes, create cards and move them between steps</li>
            <li>Only what your role allows: view-only boards stay read-only</li>
            <li>It can&rsquo;t delete anything</li>
          </ul>
          {failed && (
            <p className="auth-error">That didn&rsquo;t go through. Try again.</p>
          )}
          <form action={decide} className="consent-actions">
            <input type="hidden" name="authorization_id" value={id} />
            <button type="submit" name="decision" value="deny" className="btn btn-ghost">
              Deny
            </button>
            <button type="submit" name="decision" value="allow" className="btn btn-amber">
              Allow
            </button>
          </form>
          <p className="auth-foot">
            You can disconnect it any time from Your profile in CreatorFlo.
          </p>
        </>
      ) : (
        <>
          <p className="auth-sub">
            {user.email} doesn&rsquo;t have a CreatorFlo licence, so there&rsquo;s nothing
            to connect yet.
          </p>
          <form action={decide} className="consent-actions">
            <input type="hidden" name="authorization_id" value={id} />
            <button type="submit" name="decision" value="deny" className="btn btn-ghost">
              Cancel
            </button>
            <a href="/purchase" className="btn btn-amber">
              Get CreatorFlo
            </a>
          </form>
        </>
      )}
    </Card>
  );
}
