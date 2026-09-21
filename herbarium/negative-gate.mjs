export const NEGATIVE_CATEGORIES = Object.freeze(['object','animal','print','tablecloth']);
const allowed = new Set(NEGATIVE_CATEGORIES);

/**
 * Conservative local negative-evidence gate.
 * It only accepts an explicit, already-observed negative signal.
 * Missing/unknown input stays UNKNOWN; this module never returns VERIFIED.
 */
export function classifyNegativeEvidence(signal) {
  return allowed.has(signal)
    ? { status: 'REJECT', negativeCategory: signal }
    : { status: 'UNKNOWN', negativeCategory: null };
}
