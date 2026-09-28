import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const platformEnum = z.enum(["facebook", "instagram", "tiktok"]);

export const getSocialStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { providerConfigured } = await import("./social.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("social_accounts")
      .select("platform, display_name, expires_at")
      .eq("user_id", context.userId);
    return {
      configured: { meta: providerConfigured("meta"), tiktok: providerConfigured("tiktok") },
      accounts: (data ?? []).map((a) => ({
        platform: a.platform,
        name: a.display_name,
        expiresAt: a.expires_at,
      })),
    };
  });

export const getSocialConnectUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ provider: z.enum(["meta", "tiktok"]), origin: z.string().url(), returnTo: z.string().max(200) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { providerConfigured, makeState, authorizeUrl } = await import("./social.server");
    if (!providerConfigured(data.provider))
      throw new Error(
        data.provider === "meta"
          ? "Facebook/Instagram publishing isn't configured yet."
          : "TikTok publishing isn't configured yet.",
      );
    const origin = new URL(data.origin).origin;
    const returnTo = data.returnTo.startsWith("/") ? data.returnTo : "/organizer";
    const redirectUri = `${origin}/api/public/social/callback/${data.provider}`;
    return { url: authorizeUrl(data.provider, redirectUri, makeState(context.userId, data.provider, returnTo)) };
  });

export const disconnectSocial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ platform: platformEnum }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("social_accounts")
      .delete()
      .eq("user_id", context.userId)
      .eq("platform", data.platform);
    return { ok: true };
  });

/** Starts publishing a saved post right now. Status only becomes "published" on platform confirmation. */
export const publishSocialPostNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: post } = await context.supabase
      .from("social_posts")
      .select("id, author_id, status, platforms")
      .eq("id", data.postId)
      .maybeSingle();
    if (!post || post.author_id !== context.userId) throw new Error("Post not found.");
    if (post.status === "publishing" || post.status === "published")
      throw new Error("This post is already being published.");
    if (post.platforms.length === 0) throw new Error("Choose at least one platform.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processPost } = await import("./social.server");
    await supabaseAdmin
      .from("social_posts")
      .update({ status: "publishing", results: {} })
      .eq("id", post.id);
    await processPost(supabaseAdmin, post.id);
    const { data: after } = await supabaseAdmin
      .from("social_posts")
      .select("status, results")
      .eq("id", post.id)
      .single();
    return after;
  });
