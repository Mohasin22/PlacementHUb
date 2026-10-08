/**
 * Safe URL validation utility for PlacementHub
 * Enforces safe protocols (http://, https://, /api/) and rejects
 * dangerous protocols (javascript:, data:, file:, etc.)
 */

export function isSafeUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  
  // Explicitly deny dangerous schemes
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('blob:')
  ) {
    return false;
  }
  
  // Allow safe web URLs and internal API endpoints
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/api/') ||
    trimmed.startsWith('/')
  );
}

export function getSafeUrl(url?: string | null): string | null {
  if (!isSafeUrl(url)) return null;
  return url!.trim();
}

/**
 * Format resume URL to use secure authenticated download endpoint if it's a stored file,
 * or return the verified safe external URL.
 */
export function getSecureResumeUrl(rawUrl?: string | null, token?: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  
  // If already an API endpoint or filename
  if (trimmed.startsWith('/api/files/download/') || trimmed.startsWith('/api/files/secure-download/')) {
    return token ? `${trimmed}?token=${encodeURIComponent(token)}` : trimmed;
  }
  
  if (isSafeUrl(trimmed)) {
    return trimmed;
  }
  
  return null;
}
