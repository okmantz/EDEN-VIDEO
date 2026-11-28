// Who is signed in. Kept in its own tiny module so storage, brand and the UI can all read it without import cycles.
export const Session = { user: null };

/** The id of the signed-in account, or null. */
export const currentUid = () => Session.user?.id || null;

/** A localStorage key that belongs to the signed-in account (falls back to a shared key when nobody is signed in). */
export const userKey = (name) => (Session.user ? `eden.u.${Session.user.id}.${name}` : `eden.${name}`);
