import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const POST: APIRoute = async ({ request }) => {
  const clientId = env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID as string;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET as string;

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: "OAuth not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const refreshToken = body.refresh_token;

    if (!refreshToken) {
      return new Response(JSON.stringify({ error: "Missing refresh_token" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });

    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: "Refresh failed" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tokens = await tokenRes.json();
    return new Response(JSON.stringify({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in || 3600,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Network error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
