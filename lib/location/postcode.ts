// Standard UK postcode format regex, including the special "GIR 0AA" case.
const UK_POSTCODE_RE =
  /^([A-PR-UWYZ0-9][A-HK-Y0-9][AEHMNPRTVXY0-9]?[ABEHMNPRVWXY0-9]?\s?[0-9][ABD-HJLNP-UW-Z]{2}|GIR\s?0AA)$/i;

/**
 * Normalises free-form user input into a canonical UK postcode ("SW1A 1AA").
 * Returns null when the input is not a valid UK postcode.
 */
export function normalisePostcode(input: string): string | null {
  const compact = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!compact) return null;

  const outward = compact.slice(0, -3);
  const inward = compact.slice(-3);
  if (!outward || inward.length !== 3) return null;

  const candidate = `${outward} ${inward}`;
  if (!UK_POSTCODE_RE.test(candidate)) return null;

  return candidate;
}
