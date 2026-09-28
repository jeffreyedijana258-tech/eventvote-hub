import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/social-publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processPost } = await import("@/lib/social.server");

        const nowIso = new Date().toISOString();
        const { data: due } = await supabaseAdmin
          .from("social_posts")
          .select("id")
          .eq("status", "scheduled")
          .lte("scheduled_at", nowIso)
          .limit(20);
        for (const p of due ?? []) {
          const { data: claimed } = await supabaseAdmin
            .from("social_posts")
            .update({ status: "publishing", results: {} })
            .eq("id", p.id)
            .eq("status", "scheduled")
            .select("id");
          if (claimed?.length) await processPost(supabaseAdmin, p.id);
        }

        const { data: pending } = await supabaseAdmin
          .from("social_posts")
          .select("id")
          .eq("status", "publishing")
          .lt("updated_at", new Date(Date.now() - 60_000).toISOString())
          .limit(20);
        for (const p of pending ?? []) await processPost(supabaseAdmin, p.id);

        // Expire adverts whose paid period ended.
        await supabaseAdmin
          .from("advertisements")
          .update({ status: "expired" })
          .in("status", ["approved", "paused"])
          .lt("paid_until", nowIso);

        return Response.json({ scheduled: due?.length ?? 0, checked: pending?.length ?? 0 });
      },
    },
  },
});
