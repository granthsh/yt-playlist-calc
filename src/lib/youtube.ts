import { parseIso8601Duration } from "./duration";

export interface VideoItem {
  id: string;
  title: string;
  thumbnail: string;
  durationSeconds: number;
  isUnavailable: boolean;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
}

export interface PlaylistResult {
  playlistId: string;
  playlistTitle: string;
  totalVideos: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  unavailableVideosCount: number;
  videos: VideoItem[];
}

/** Parses a playlist ID from a YouTube URL or returns the raw input if it looks like a playlist ID. */
export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Direct playlist IDs: WL (Watch Later) or start with PL, UU, LL, FL, RD, OL
  if (trimmed === "WL") return "WL";
  if (/^(PL|UU|LL|FL|RD|OL)[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const listParam = url.searchParams.get("list");
    if (listParam) return listParam;
  } catch (_) {}

  const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/** Parses a video ID from various YouTube URL formats. */
export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Direct 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be" || url.hostname === "www.youtu.be") {
      return url.pathname.slice(1).split(/[?#]/)[0] || null;
    }
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] || null;
    if (url.pathname.startsWith("/embed/"))  return url.pathname.split("/")[2] || null;
    if (url.pathname.startsWith("/v/"))      return url.pathname.split("/")[2] || null;
    const v = url.searchParams.get("v");
    if (v) return v;
  } catch (_) {}

  // Fallback regexes
  for (const re of [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
  ]) {
    const m = trimmed.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Resolves special playlist aliases (LL) to actual API playlist IDs via the channels endpoint. */
async function resolvePlaylistId(playlistId: string, accessToken: string): Promise<string> {
  // YouTube's API has never exposed the "Watch Later" playlist (Google dropped
  // `watchLater` from relatedPlaylists for privacy reasons in 2016) — it can't be
  // fetched for any account, even your own via OAuth, so fail fast with a clear message.
  if (playlistId === "WL") {
    throw new Error(
      "YouTube's API doesn't allow access to the \"Watch Later\" playlist for any account — this is a restriction Google put in place, not something this tool can work around. Copy the videos into a regular playlist and calculate that instead."
    );
  }

  const aliases: Record<string, string> = { LL: "likes" };
  const field = aliases[playlistId];
  if (!field || !accessToken) return playlistId;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      const data = await res.json();
      const resolved = data.items?.[0]?.contentDetails?.relatedPlaylists?.[field];
      if (resolved) return resolved;
    }
  } catch (_) {}
  return playlistId;
}

/** Fetches the actual display title of a playlist from the API. */
export async function fetchPlaylistTitle(playlistId: string, apiKey: string, accessToken?: string): Promise<string> {
  try {
    const headers: Record<string, string> = {};
    let apiUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}`;
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    } else {
      apiUrl += `&key=${apiKey}`;
    }
    const res = await fetch(apiUrl, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.items?.[0]) return data.items[0].snippet?.title || "Untitled Playlist";
    }
  } catch (_) {}
  return `Playlist ${playlistId.slice(0, 10)}...`;
}

/** Fetches all playlist items then resolves durations + statistics in parallel batches. */
export async function fetchPlaylistData(
  playlistId: string,
  apiKey: string,
  onProgress?: (count: number) => void,
  accessToken?: string
): Promise<PlaylistResult> {
  // Resolve special playlist aliases (WL, LL) to actual IDs
  const resolvedId = await resolvePlaylistId(playlistId, accessToken || "");

  // Start playlist title fetch immediately (parallel)
  const titlePromise = fetchPlaylistTitle(resolvedId, apiKey, accessToken);

  const authHeaders: Record<string, string> = {};
  if (accessToken) authHeaders["Authorization"] = `Bearer ${accessToken}`;

  // Paginate through playlistItems
  let items: any[] = [];
  let pageToken = "";
  do {
    let apiUrl =
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?part=snippet,contentDetails&playlistId=${resolvedId}&maxResults=50` +
      (accessToken ? "" : `&key=${apiKey}`) +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const res = await fetch(apiUrl, { headers: authHeaders });
    if (!res.ok) {
      const status = res.status;
      if (status === 404) throw new Error(`Playlist "${playlistId}" not found.`);
      if (status === 403) throw new Error("Access denied — playlist may be private or API key invalid.");
      throw new Error(`YouTube API error (HTTP ${status}).`);
    }
    const data = await res.json();
    items.push(...(data.items || []));
    onProgress?.(items.length);
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  const playlistTitle = await titlePromise;

  if (!items.length) {
    return { playlistId, playlistTitle, totalVideos: 0, totalDurationSeconds: 0, averageDurationSeconds: 0, unavailableVideosCount: 0, videos: [] };
  }

  // Build id→position map for ordering
  const positionMap = new Map<string, number>();
  items.forEach((item, i) => {
    const vid = item.contentDetails?.videoId;
    if (vid) positionMap.set(vid, i);
  });

  // Deduplicate video IDs
  const allIds = [...new Set(items.map(i => i.contentDetails?.videoId).filter(Boolean))];

  // Batch-fetch video details (contentDetails + snippet + statistics) in chunks of 50
  const detailMap = new Map<string, {
    duration: number;
    title: string;
    thumbnail: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    publishedAt: string;
  }>();

  await Promise.all(
    chunk(allIds, 50).map(async (ids) => {
      let apiUrl =
        `https://www.googleapis.com/youtube/v3/videos` +
        `?part=contentDetails,snippet,statistics&id=${ids.join(",")}` +
        (accessToken ? "" : `&key=${apiKey}`);
      const res = await fetch(apiUrl, { headers: authHeaders });
      if (!res.ok) return;
      const data = await res.json();
      for (const v of data.items || []) {
        detailMap.set(v.id, {
          duration:     parseIso8601Duration(v.contentDetails?.duration || "PT0S"),
          title:        v.snippet?.title || "",
          thumbnail:    v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || "",
          viewCount:    parseInt(v.statistics?.viewCount  || "0", 10),
          likeCount:    parseInt(v.statistics?.likeCount  || "0", 10),
          commentCount: parseInt(v.statistics?.commentCount || "0", 10),
          publishedAt:  v.snippet?.publishedAt || "",
        });
      }
    })
  );

  // Assemble final list
  const videos: VideoItem[] = [];
  let totalDurationSeconds = 0;
  let unavailableVideosCount = 0;

  for (const item of items) {
    const vId = item.contentDetails?.videoId;
    const detail = vId ? detailMap.get(vId) : null;
    if (detail) {
      videos.push({ id: vId, ...detail, durationSeconds: detail.duration, isUnavailable: false });
      totalDurationSeconds += detail.duration;
    } else {
      const title = item.snippet?.title || "Private / Deleted Video";
      const thumbnail = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "";
      videos.push({ id: vId || "", title, thumbnail, durationSeconds: 0, isUnavailable: true, viewCount: 0, likeCount: 0, commentCount: 0, publishedAt: "" });
      unavailableVideosCount++;
    }
  }

  const activeCount = videos.length - unavailableVideosCount;
  return {
    playlistId,
    playlistTitle,
    totalVideos: videos.length,
    totalDurationSeconds,
    averageDurationSeconds: activeCount > 0 ? totalDurationSeconds / activeCount : 0,
    unavailableVideosCount,
    videos,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
