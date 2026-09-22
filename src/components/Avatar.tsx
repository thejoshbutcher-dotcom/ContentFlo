"use client";

import { identityByEmail, initialOf, personName, useTeam } from "@/lib/team";

/**
 * A person, as a circle: their picture if they've set one, else their initial.
 * Keyed by email because that's what cards and notes store. Subscribes to the
 * directory so a teammate changing their picture shows up everywhere at once.
 */
export default function Avatar({
  email,
  size = 20,
  className = "",
}: {
  email: string;
  size?: number;
  className?: string;
}) {
  // Subscribing (not just reading) is what makes this re-render on changes.
  useTeam((s) => s.directory);
  useTeam((s) => s.roster);
  const id = identityByEmail(email);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.46) };

  if (id?.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={id.avatar}
        alt=""
        className={`peer-dot has-img ${className}`.trim()}
        style={style}
      />
    );
  }
  return (
    <span className={`peer-dot ${className}`.trim()} style={style}>
      {initialOf(id?.name?.trim() || email)}
    </span>
  );
}

/** Display name for an email, live. */
export function Name({ email }: { email: string }) {
  useTeam((s) => s.directory);
  useTeam((s) => s.roster);
  const me = useTeam((s) => s.me);
  // personName reads the store; the subscriptions above keep it fresh.
  return <>{personName(email, me?.email)}</>;
}
