export class MissingApiKeyError extends Error {
  constructor() {
    super("YouTube API key is not configured for this site.");
    this.name = "MissingApiKeyError";
  }
}

export function getYouTubeApiKey(): string {
  const key = import.meta.env.PUBLIC_YT_API_KEY;
  if (!key) {
    throw new MissingApiKeyError();
  }
  return key;
}

export function getGoogleOAuthClientId(): string {
  return import.meta.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID || "";
}

export function getSiteUrl(): string {
  return import.meta.env.PUBLIC_SITE_URL || "https://ytplaylistcalc.pro";
}

export function isOAuthConfigured(): boolean {
  return !!getGoogleOAuthClientId();
}
