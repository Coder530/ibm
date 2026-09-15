/**
 * Best-effort client IP extraction for rate limiting / dedupe keys — not a
 * security boundary (any of these headers can be spoofed by a caller talking
 * directly to the origin). Preference order: `x-vercel-forwarded-for` (set
 * by the Vercel edge network itself, so it survives a proxy sitting in front
 * of the app — unlike `x-forwarded-for`, which Vercel docs confirm gets
 * overwritten on-platform), then `x-real-ip`, then `x-forwarded-for`.
 */
export function clientIp(request: Request): string {
  const vercelForwardedFor = firstEntry(request.headers.get("x-vercel-forwarded-for"));
  if (vercelForwardedFor) return vercelForwardedFor;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwardedFor = firstEntry(request.headers.get("x-forwarded-for"));
  if (forwardedFor) return forwardedFor;

  return "anon";
}

function firstEntry(header: string | null): string | undefined {
  const first = header?.split(",")[0]?.trim();
  return first || undefined;
}
