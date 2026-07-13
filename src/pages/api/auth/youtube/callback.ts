import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ url, redirect }) => {
  const code = url.searchParams.get("code");
  const siteUrl = (env.PUBLIC_SITE_URL as string) || "https://ytplaylistcalc.pro";

  if (!code) {
    return redirect("/?auth_error=missing_code");
  }

  const clientId = env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID as string;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET as string;

  if (!clientId || !clientSecret) {
    return redirect("/?auth_error=oauth_not_configured");
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${siteUrl}/api/auth/youtube/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return redirect("/?auth_error=token_exchange_failed");
    }

    const tokens = await tokenRes.json();
    const authData = encodeURIComponent(JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || "",
      expires_in: tokens.expires_in || 3600,
    }));

    return redirect(`/#youtube_auth=${authData}`);
  } catch {
    return redirect("/?auth_error=network_error");
  }
};
