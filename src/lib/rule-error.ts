/** A business-rule refusal written by notem in Portuguese: the only kind of builder error shown to partners verbatim. */
export class RuleError extends Error {}
/** Public message for a caught builder error: our own rule text, otherwise a fixed fallback (never a library/internal message). */
export const ruleMessage = (e: unknown, fallback: string) => (e instanceof RuleError ? e.message : fallback);
