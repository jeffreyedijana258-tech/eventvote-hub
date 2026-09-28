import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/social/callback/$provider")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const provider = params.provider === "tiktok" ? "tiktok" : params.provider === "meta" ? "meta" : null;
        const back = (path: string, msg: string) =>
          Response.redirect(`${url.origin}${path}${path.includes("?") ? "&" : "?"}social=${encodeURIComponent(msg)}`, 302);
        if (!provider) return new Response("Unknown provider", { status: 400 });

        const { readState, exchangeAndStore } = await import("@/lib/social.server");
        const state = readState(url.searchParams.get("state") ?? "");
        if (!state || state.p !== provider) return back("/organizer", "Connection expired, please try again.");
        const code = url.searchParams.get("code");
        if (!code) return back(state.r, url.searchParams.get("error_description") ?? "Connection cancelled.");

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await exchangeAndStore(
            supabaseAdmin,
            provider,
            code,
            `${url.origin}/api/public/social/callback/${provider}`,
            state.u,
          );
          return back(state.r, "connected");
        } catch (e) {
          console.error("social connect failed", e);
          return back(state.r, e instanceof Error ? e.message : "Connection failed.");
        }
      },
    },
  },
});
