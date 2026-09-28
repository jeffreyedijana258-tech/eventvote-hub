// Server-only helpers for official Facebook/Instagram (Meta Graph API) and TikTok publishing.
import { createHmac, timingSafeEqual } from "node:crypto";

export type Platform = "facebook" | "instagram" | "tiktok";
export type PlatformResult = {
  status: "publishing" | "published" | "failed";
  id?: string;
  error?: string;
  pending?: Record<string, string>;
  at?: string;
};

const GRAPH = "https://graph.facebook.com/v19.0";

export function providerConfigured(p: "meta" | "tiktok") {
  return p === "meta"
    ? !!(process.env["META_APP_ID"] && process.env["META_APP_SECRET"])
    : !!(process.env["TIKTOK_CLIENT_KEY"] && process.env["TIKTOK_CLIENT_SECRET"]);
}

function sign(value: string) {
  return createHmac("sha256", process.env["SOCIAL_STATE_SECRET"] ?? "")
    .update(value)
    .digest("base64url");
}

export function makeState(userId: string, provider: string, returnTo: string) {
  const body = Buffer.from(
    JSON.stringify({ u: userId, p: provider, r: returnTo, e: Date.now() + 10 * 60_000 }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readState(state: string) {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sign(body));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as {
    u: string;
    p: string;
    r: string;
    e: number;
  };
  if (parsed.e < Date.now()) return null;
  return parsed;
}

export function authorizeUrl(provider: "meta" | "tiktok", redirectUri: string, state: string) {
  if (provider === "meta") {
    const q = new URLSearchParams({
      client_id: process.env["META_APP_ID"]!,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope:
        "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management",
    });
    return `https://www.facebook.com/v19.0/dialog/oauth?${q}`;
  }
  const q = new URLSearchParams({
    client_key: process.env["TIKTOK_CLIENT_KEY"]!,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: "user.info.basic,video.publish",
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
}

type Admin = any;

export async function exchangeAndStore(
  admin: Admin,
  provider: "meta" | "tiktok",
  code: string,
  redirectUri: string,
  userId: string,
) {
  if (provider === "meta") {
    const q = new URLSearchParams({
      client_id: process.env["META_APP_ID"]!,
      client_secret: process.env["META_APP_SECRET"]!,
      redirect_uri: redirectUri,
      code,
    });
    const tok = (await (await fetch(`${GRAPH}/oauth/access_token?${q}`)).json()) as {
      access_token?: string;
      error?: { message: string };
    };
    if (!tok.access_token) throw new Error(tok.error?.message ?? "Facebook sign-in failed.");
    const long = (await (
      await fetch(
        `${GRAPH}/oauth/access_token?${new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: process.env["META_APP_ID"]!,
          client_secret: process.env["META_APP_SECRET"]!,
          fb_exchange_token: tok.access_token,
        })}`,
      )
    ).json()) as { access_token?: string };
    const userToken = long.access_token ?? tok.access_token;
    const pages = (await (
      await fetch(
        `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`,
      )
    ).json()) as {
      data?: {
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username?: string };
      }[];
    };
    const page = pages.data?.[0];
    if (!page) throw new Error("No Facebook Page found on this account. A Page is required to post.");
    await admin.from("social_accounts").upsert(
      {
        user_id: userId,
        platform: "facebook",
        external_id: page.id,
        display_name: page.name,
        access_token: page.access_token,
        meta: { user_token: userToken },
      },
      { onConflict: "user_id,platform" },
    );
    if (page.instagram_business_account) {
      await admin.from("social_accounts").upsert(
        {
          user_id: userId,
          platform: "instagram",
          external_id: page.instagram_business_account.id,
          display_name: page.instagram_business_account.username ?? page.name,
          access_token: page.access_token,
        },
        { onConflict: "user_id,platform" },
      );
    }
    return;
  }

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env["TIKTOK_CLIENT_KEY"]!,
      client_secret: process.env["TIKTOK_CLIENT_SECRET"]!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const t = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    open_id?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!t.access_token) throw new Error(t.error_description ?? "TikTok sign-in failed.");
  await admin.from("social_accounts").upsert(
    {
      user_id: userId,
      platform: "tiktok",
      external_id: t.open_id ?? null,
      display_name: "TikTok account",
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? null,
      expires_at: new Date(Date.now() + (t.expires_in ?? 86400) * 1000).toISOString(),
    },
    { onConflict: "user_id,platform" },
  );
}

type Post = {
  id: string;
  author_id: string;
  platforms: Platform[];
  caption: string;
  hashtags: string | null;
  image_url: string | null;
  video_url: string | null;
  link_url: string | null;
  results: Record<string, PlatformResult>;
};

function fullText(p: Post) {
  return [p.caption, p.hashtags, p.link_url].filter(Boolean).join("\n\n");
}

async function publishOne(platform: Platform, post: Post, acct: any): Promise<PlatformResult> {
  const at = new Date().toISOString();
  if (!acct?.access_token) return { status: "failed", error: "Account not connected.", at };
  try {
    if (platform === "facebook") {
      let url: string;
      const body = new URLSearchParams({ access_token: acct.access_token });
      if (post.video_url) {
        url = `${GRAPH}/${acct.external_id}/videos`;
        body.set("file_url", post.video_url);
        body.set("description", fullText(post));
      } else if (post.image_url) {
        url = `${GRAPH}/${acct.external_id}/photos`;
        body.set("url", post.image_url);
        body.set("caption", fullText(post));
      } else {
        url = `${GRAPH}/${acct.external_id}/feed`;
        body.set("message", [post.caption, post.hashtags].filter(Boolean).join("\n\n"));
        if (post.link_url) body.set("link", post.link_url);
      }
      const r = (await (await fetch(url, { method: "POST", body })).json()) as {
        id?: string;
        post_id?: string;
        error?: { message: string };
      };
      if (r.error || !(r.id || r.post_id)) return { status: "failed", error: r.error?.message ?? "Facebook did not confirm the post.", at };
      return { status: "published", id: r.post_id ?? r.id, at };
    }

    if (platform === "instagram") {
      if (!post.image_url && !post.video_url)
        return { status: "failed", error: "Instagram needs an image or video.", at };
      const body = new URLSearchParams({ access_token: acct.access_token, caption: fullText(post) });
      if (post.video_url) {
        body.set("media_type", "REELS");
        body.set("video_url", post.video_url);
      } else body.set("image_url", post.image_url!);
      const c = (await (
        await fetch(`${GRAPH}/${acct.external_id}/media`, { method: "POST", body })
      ).json()) as { id?: string; error?: { message: string } };
      if (!c.id) return { status: "failed", error: c.error?.message ?? "Instagram rejected the media.", at };
      return finishInstagram(acct, c.id);
    }

    // TikTok — Content Posting API, pull video from URL.
    if (!post.video_url) return { status: "failed", error: "TikTok needs a video.", at };
    const r = (await (
      await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
        method: "POST",
        headers: { Authorization: `Bearer ${acct.access_token}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({
          post_info: { title: fullText(post).slice(0, 2000), privacy_level: "SELF_ONLY" },
          source_info: { source: "PULL_FROM_URL", video_url: post.video_url },
        }),
      })
    ).json()) as { data?: { publish_id?: string }; error?: { code?: string; message?: string } };
    if (!r.data?.publish_id)
      return { status: "failed", error: r.error?.message || r.error?.code || "TikTok rejected the post.", at };
    return { status: "publishing", pending: { publish_id: r.data.publish_id }, at };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "Unexpected error", at };
  }
}

async function finishInstagram(acct: any, containerId: string): Promise<PlatformResult> {
  const at = new Date().toISOString();
  const s = (await (
    await fetch(`${GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(acct.access_token)}`)
  ).json()) as { status_code?: string };
  if (s.status_code === "ERROR" || s.status_code === "EXPIRED")
    return { status: "failed", error: `Instagram media ${s.status_code.toLowerCase()}.`, at };
  if (s.status_code && s.status_code !== "FINISHED")
    return { status: "publishing", pending: { container_id: containerId }, at };
  const p = (await (
    await fetch(`${GRAPH}/${acct.external_id}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ access_token: acct.access_token, creation_id: containerId }),
    })
  ).json()) as { id?: string; error?: { message: string } };
  if (!p.id) return { status: "failed", error: p.error?.message ?? "Instagram did not confirm the post.", at };
  return { status: "published", id: p.id, at };
}

async function checkPending(platform: Platform, prev: PlatformResult, acct: any): Promise<PlatformResult> {
  const at = new Date().toISOString();
  if (!acct?.access_token) return { status: "failed", error: "Account disconnected.", at };
  if (platform === "instagram" && prev.pending?.["container_id"])
    return finishInstagram(acct, prev.pending["container_id"]);
  if (platform === "tiktok" && prev.pending?.["publish_id"]) {
    const r = (await (
      await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
        method: "POST",
        headers: { Authorization: `Bearer ${acct.access_token}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ publish_id: prev.pending["publish_id"] }),
      })
    ).json()) as { data?: { status?: string; fail_reason?: string; publicaly_available_post_id?: string[] } };
    const st = r.data?.status;
    if (st === "PUBLISH_COMPLETE")
      return { status: "published", id: r.data?.publicaly_available_post_id?.[0] ?? prev.pending["publish_id"], at };
    if (st === "FAILED") return { status: "failed", error: r.data?.fail_reason ?? "TikTok publishing failed.", at };
    return prev;
  }
  return prev;
}

function overall(results: Record<string, PlatformResult>, platforms: Platform[]) {
  const list = platforms.map((p) => results[p]?.status);
  if (list.some((s) => s === "publishing" || !s)) return "publishing";
  if (list.every((s) => s === "published")) return "published";
  return "failed";
}

/** Publishes a post (or advances pending platforms). Only marks published on platform confirmation. */
export async function processPost(admin: Admin, postId: string) {
  const { data: post } = await admin.from("social_posts").select("*").eq("id", postId).single();
  if (!post) return;
  const { data: accounts } = await admin
    .from("social_accounts")
    .select("platform, external_id, access_token")
    .eq("user_id", post.author_id);
  const byPlatform = new Map<string, any>((accounts ?? []).map((a: any) => [a.platform, a]));
  const results: Record<string, PlatformResult> = { ...(post.results ?? {}) };

  for (const platform of post.platforms as Platform[]) {
    const prev = results[platform];
    if (prev?.status === "published") continue;
    results[platform] =
      prev?.status === "publishing" && prev.pending
        ? await checkPending(platform, prev, byPlatform.get(platform))
        : await publishOne(platform, post as Post, byPlatform.get(platform));
  }
  await admin
    .from("social_posts")
    .update({ results, status: overall(results, post.platforms) })
    .eq("id", postId);
}
