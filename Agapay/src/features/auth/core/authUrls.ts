export function normalizePathname(url: string, baseUrl?: string): string {
  try {
    const u = baseUrl ? new URL(url, baseUrl) : new URL(url);
    return u.pathname;
  } catch {
    return url;
  }
}

export function isAuthUrl(url: string | undefined, baseUrl: string, skipPaths: Set<string>): boolean {
  if (!url) return false;
  const pathname = normalizePathname(url, baseUrl);
  return skipPaths.has(pathname) || skipPaths.has(url);
}
