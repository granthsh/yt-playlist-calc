const STORAGE_KEY = "ytplc_youtube_auth";

interface YouTubeAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** Parse auth data from URL fragment after OAuth callback */
export function parseAuthFromUrl(): YouTubeAuth | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.substring(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const data = params.get("youtube_auth");
  if (!data) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(data)) as { access_token: string; refresh_token: string; expires_in: number };
    if (!parsed.access_token) return null;
    const auth: YouTubeAuth = {
      accessToken: parsed.access_token,
      refreshToken: parsed.refresh_token || "",
      expiresAt: Date.now() + (parsed.expires_in || 3600) * 1000,
    };
    saveYouTubeAuth(auth);
    // Clean URL
    window.history.replaceState({}, "", window.location.pathname + window.location.search);
    return auth;
  } catch {
    return null;
  }
}

export function getYouTubeAuth(): YouTubeAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as YouTubeAuth;
  } catch {
    return null;
  }
}

function saveYouTubeAuth(auth: YouTubeAuth): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearYouTubeAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function isYouTubeAuthenticated(): boolean {
  const auth = getYouTubeAuth();
  return !!auth && !!auth.accessToken;
}

/** Returns a valid access token, refreshing if needed. Returns null if not authenticated. */
export async function getValidAccessToken(): Promise<string | null> {
  const auth = getYouTubeAuth();
  if (!auth) return null;

  // Still valid (with 5-min buffer)
  if (auth.expiresAt > Date.now() + 5 * 60 * 1000) {
    return auth.accessToken;
  }

  // Try refresh
  if (auth.refreshToken) {
    try {
      const res = await fetch("/api/auth/youtube/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: auth.refreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        const refreshed: YouTubeAuth = {
          accessToken: data.access_token,
          refreshToken: auth.refreshToken,
          expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        };
        saveYouTubeAuth(refreshed);
        return refreshed.accessToken;
      }
    } catch {
      // Refresh failed
    }
  }

  // Token expired and refresh failed — clear auth
  clearYouTubeAuth();
  return null;
}

export function getAuthEmail(): string | null {
  const auth = getYouTubeAuth();
  if (!auth) return null;
  // We don't store email, but we can signal "connected"
  return auth.accessToken ? "Connected" : null;
}
