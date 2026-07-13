import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ redirect }) => {
  const clientId = env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID as string;
  const siteUrl = (env.PUBLIC_SITE_URL as string) || "https://ytplaylistcalc.pro";

  if (!clientId) {
    return new Response("Google OAuth is not configured.", { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${siteUrl}/api/auth/youtube/callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    access_type: "offline",
    prompt: "consent",
  });

  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};
