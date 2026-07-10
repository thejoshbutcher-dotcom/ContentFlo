import { redirect } from "next/navigation";
import PlannerApp from "@/components/PlannerApp";
import { hasPurchase } from "@/lib/entitlement";
import { isAuthEnabled } from "@/lib/supabase/env";
import { getUser } from "@/lib/supabase/server";

/**
 * The real access gate. It runs on the server, so no client can bypass it:
 * even if someone obtains a session without buying, they land on /purchase
 * until an active purchase exists for their email.
 */
export default async function Home() {
  if (isAuthEnabled()) {
    const user = await getUser();
    if (!user) redirect("/login");
    if (!(await hasPurchase(user.email))) redirect("/purchase");
  }

  return <PlannerApp />;
}
