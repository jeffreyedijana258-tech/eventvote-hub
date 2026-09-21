import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Casts a vote, enforcing the event's voting window and per-user vote limit server-side. */
export const castVote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ candidateId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: candidate } = await supabaseAdmin
      .from("candidates")
      .select("id, event_id, name")
      .eq("id", data.candidateId)
      .maybeSingle();
    if (!candidate) throw new Error("Candidate not found.");

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, status, voting_enabled, voting_starts_at, voting_ends_at, max_votes_per_user")
      .eq("id", candidate.event_id)
      .maybeSingle();
    if (!event || event.status !== "approved") throw new Error("Voting is not open for this event.");
    if (!event.voting_enabled) throw new Error("Voting is not enabled for this event.");

    const now = Date.now();
    if (event.voting_starts_at && now < new Date(event.voting_starts_at).getTime())
      throw new Error("Voting has not started yet.");
    if (event.voting_ends_at && now > new Date(event.voting_ends_at).getTime())
      throw new Error("Voting has closed.");

    const { data: existing } = await supabaseAdmin
      .from("votes")
      .select("id, candidate_id")
      .eq("event_id", event.id)
      .eq("user_id", context.userId);

    const votes = existing ?? [];
    if (votes.some((v) => v.candidate_id === candidate.id))
      throw new Error("You already voted for this candidate.");
    if (votes.length >= event.max_votes_per_user)
      throw new Error(
        `You have used all your ${event.max_votes_per_user} vote(s) for this event.`,
      );

    const { error } = await supabaseAdmin.from("votes").insert({
      event_id: event.id,
      candidate_id: candidate.id,
      user_id: context.userId,
    });
    if (error) throw new Error(error.message);

    return { ok: true as const, remaining: event.max_votes_per_user - votes.length - 1 };
  });

/** Public results for one event (only when the organizer made results public, or voting closed). */
export const getEventResults = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, status, results_public, voting_ends_at")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!event || (event.status !== "approved" && event.status !== "completed")) {
      return { visible: false as const, results: [] };
    }
    const closed = event.voting_ends_at ? Date.now() > new Date(event.voting_ends_at).getTime() : false;
    if (!event.results_public && !closed) return { visible: false as const, results: [] };

    const { data: candidates } = await supabaseAdmin
      .from("candidates")
      .select("id, name, image_url, position")
      .eq("event_id", data.eventId);
    const { data: votes } = await supabaseAdmin
      .from("votes")
      .select("candidate_id")
      .eq("event_id", data.eventId);

    const counts = new Map<string, number>();
    for (const vote of votes ?? []) {
      counts.set(vote.candidate_id, (counts.get(vote.candidate_id) ?? 0) + 1);
    }

    const results = (candidates ?? [])
      .map((c) => ({ ...c, votes: counts.get(c.id) ?? 0 }))
      .sort((a, b) => b.votes - a.votes);

    return { visible: true as const, results };
  });
