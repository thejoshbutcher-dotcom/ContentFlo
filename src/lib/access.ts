/**
 * Whether the open profile is view-only for this user.
 *
 * A plain module flag rather than store state so the planner and profile
 * stores can consult it without importing each other. The database enforces
 * the same rule (a viewer's writes are rejected by RLS); this just keeps the
 * local copy from drifting away from a cloud it isn't allowed to change.
 */
let readOnly = false;

export function setReadOnly(v: boolean) {
  readOnly = v;
}

export function isReadOnly(): boolean {
  return readOnly;
}
