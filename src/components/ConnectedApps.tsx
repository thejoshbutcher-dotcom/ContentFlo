"use client";

import { useEffect, useState } from "react";
import { Plug, Unplug } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

interface Grant {
  clientId: string;
  name: string;
  grantedAt: string;
}

/**
 * Apps connected to this CreatorFlo account through OAuth (e.g. Claude, via
 * the MCP connector). Disconnecting revokes the app's access and its tokens.
 * Renders nothing when there are none, or before the OAuth server is on.
 */
export default function ConnectedApps() {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function fetchGrants(): Promise<Grant[]> {
    const supabase = getSupabaseBrowser();
    if (!supabase) return [];
    const { data, error } = await supabase.auth.oauth.listGrants();
    if (error || !data) return [];
    return data.map((g) => ({
      clientId: g.client.id,
      name: g.client.name || "Unnamed app",
      grantedAt: g.granted_at,
    }));
  }
  const load = () => void fetchGrants().then(setGrants);

  useEffect(() => {
    let live = true;
    void fetchGrants().then((g) => live && setGrants(g));
    return () => {
      live = false;
    };
  }, []);

  if (!grants?.length) return null;

  return (
    <div className="connected-apps">
      <div className="prop-label t-eyebrow">Connected apps</div>
      {grants.map((g) => (
        <div key={g.clientId} className="connected-app">
          <Plug size={14} />
          <span className="connected-app-name">
            {g.name}
            <span>since {new Date(g.grantedAt).toLocaleDateString()}</span>
          </span>
          <button
            className="btn btn-ghost"
            disabled={busy === g.clientId}
            onClick={async () => {
              if (!confirm(`Disconnect ${g.name}? It loses access to your CreatorFlo boards.`)) return;
              setBusy(g.clientId);
              await getSupabaseBrowser()?.auth.oauth.revokeGrant({ clientId: g.clientId });
              setBusy(null);
              load();
            }}
          >
            <Unplug size={13} /> Disconnect
          </button>
        </div>
      ))}
    </div>
  );
}
