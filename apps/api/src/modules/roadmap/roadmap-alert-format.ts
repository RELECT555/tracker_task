const REDACTED = '[redacted]';

const SECRET_PATTERNS: readonly RegExp[] = [
  // Everything after the webhook secret header, quoted (JSON) or not.
  /x-roadmap-webhook-secret["']?\s*:[\s\S]*/gi,
  /\b(?:Basic|Bearer)\s+\S+/gi,
  // Azure DevOps personal access tokens: 52 characters, or 84 for the newer format.
  /(?<![A-Za-z0-9])(?:[A-Za-z0-9]{52}|[A-Za-z0-9]{84})(?![A-Za-z0-9])/g,
];

/** Removes credentials from text that is stored or shown to users, then truncates it. */
export function redactSecrets(text: string, max: number): string {
  const clean = SECRET_PATTERNS.reduce(
    (value, pattern) => value.replace(pattern, REDACTED),
    text,
  );
  return clean.slice(0, max);
}
