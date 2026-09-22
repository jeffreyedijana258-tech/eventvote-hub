import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Heart, MapPin, Minus, Plus, Trophy, Vote as VoteIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, formatNaira } from "@/lib/format";
import { saleWindow, tierLabel } from "@/lib/tiers";
import { startTicketPurchase } from "@/lib/tickets.functions";
import { castVote, getEventResults } from "@/lib/votes.functions";

export const Route = createFileRoute("/events/$eventId")({
  head: () => ({
    meta: [
      { title: "Event details — VOTIX" },
      { name: "description", content: "Event details, tickets and voting on VOTIX." },
      { property: "og:title", content: "Event details — VOTIX" },
      { property: "og:description", content: "Event details, tickets and voting on VOTIX." },
    ],
  }),
  component: EventDetail,
});

function EventDetail() {
  const { eventId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const purchase = useServerFn(startTicketPurchase);
  const vote = useServerFn(castVote);
  const results = useServerFn(getEventResults);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const { data: event, isLoading } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: organizerProfile } = useQuery({
    queryKey: ["organizer-profile", event?.id],
    enabled: !!event?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("event_organizer_name", { _event_id: event!.id });
      return { full_name: (data as string | null) ?? null };
    },
  });


  const { data: ticketTypes } = useQuery({
    queryKey: ["ticket-types", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_types")
        .select("*")
        .eq("event_id", eventId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("price", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: candidates } = useQuery({
    queryKey: ["candidates", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: myVotes } = useQuery({
    queryKey: ["my-votes", eventId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("votes")
        .select("candidate_id")
        .eq("event_id", eventId);
      if (error) throw error;
      return (data ?? []).map((v) => v.candidate_id);
    },
  });

  const { data: resultData } = useQuery({
    queryKey: ["results", eventId],
    queryFn: () => results({ data: { eventId } }),
  });

  const { data: favorite } = useQuery({
    queryKey: ["favorite", eventId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("event_id", eventId)
        .maybeSingle();
      return data?.id ?? null;
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      if (favorite) {
        await supabase.from("favorites").delete().eq("id", favorite);
      } else {
        await supabase.from("favorites").insert({ event_id: eventId, user_id: user.id });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorite", eventId, user?.id] });
      toast.success(favorite ? "Removed from favourites" : "Saved to favourites");
    },
    onError: () => toast.error("Sign in to save favourites."),
  });

  const buy = useMutation({
    mutationFn: async (ticketTypeId: string) => {
      const result = await purchase({
        data: {
          ticketTypeId,
          quantity: quantities[ticketTypeId] ?? 1,
          callbackUrl: `${window.location.origin}/payment/callback`,
        },
      });
      return result;
    },
    onSuccess: (result) => {
      if (result.free) {
        toast.success("Ticket issued! Check your dashboard.");
        void navigate({ to: "/dashboard" });
        return;
      }
      if (result.authorizationUrl) window.location.href = result.authorizationUrl;
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not start payment."),
  });

  const submitVote = useMutation({
    mutationFn: (candidateId: string) => vote({ data: { candidateId } }),
    onSuccess: (res) => {
      toast.success(`Vote counted. ${res.remaining} vote(s) left.`);
      void queryClient.invalidateQueries({ queryKey: ["my-votes", eventId, user?.id] });
      void queryClient.invalidateQueries({ queryKey: ["results", eventId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Vote failed."),
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Event unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This event may be unpublished or removed.
        </p>
        <Link to="/events" className="mt-6 inline-block">
          <Button>Back to events</Button>
        </Link>
      </div>
    );
  }


  const organizerName = organizerProfile?.full_name ?? null;
  const totalVotes = (resultData?.results ?? []).reduce((sum, r) => sum + r.votes, 0);
  const votesUsed = myVotes?.length ?? 0;
  const votesLeft = Math.max((event.max_votes_per_user ?? 1) - votesUsed, 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="relative aspect-[21/9] w-full bg-secondary">
          {event.cover_image_url ? (
            <img src={event.cover_image_url} alt={event.title} className="size-full object-cover" />
          ) : (
            <div className="votix-gradient-bg flex size-full items-center justify-center text-4xl font-black text-primary-foreground">
              VOTIX
            </div>
          )}
        </div>
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{event.category}</Badge>
            {event.voting_enabled && (
              <Badge className="votix-gradient-bg text-primary-foreground">Voting open</Badge>
            )}
          </div>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{event.title}</h1>
          <div className="flex flex-wrap gap-5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4 text-primary" /> {formatDateTime(event.starts_at)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 text-primary" /> {event.location ?? "Online"}
            </span>
            <span>Hosted by {organizerName ?? "a VOTIX organizer"}</span>
          </div>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => (user ? toggleFavorite.mutate() : navigate({ to: "/auth" }))}
            >
              <Heart className={`mr-2 size-4 ${favorite ? "fill-primary text-primary" : ""}`} />
              {favorite ? "Saved" : "Save event"}
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="about" className="mt-8">
        <TabsList className="flex-wrap">
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          {event.voting_enabled && <TabsTrigger value="vote">Vote</TabsTrigger>}
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="about" className="mt-6">
          <Card className="p-6">
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {event.description ?? "The organizer hasn't added a description yet."}
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="tickets" className="mt-6 space-y-4">
          {(ticketTypes ?? []).length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No tickets on sale for this event.
            </Card>
          )}
          {(ticketTypes ?? []).map((tt) => {
            const remaining = tt.quantity_total - tt.quantity_sold;
            const window = saleWindow(tt);
            const qty = quantities[tt.id] ?? 1;
            const isTable = tt.tier_kind === "table";
            const maxQty = Math.max(1, Math.min(10, remaining));
            return (
              <Card key={tt.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-lg font-bold">{tt.name}</p>
                    <Badge variant="secondary">{tierLabel(tt.tier_kind)}</Badge>
                    {!window.onSale && (
                      <Badge variant="outline">
                        {window.reason === "sold_out"
                          ? "Sold out"
                          : window.reason === "not_started"
                            ? "Not on sale yet"
                            : "Sales closed"}
                      </Badge>
                    )}
                  </div>
                  {tt.description && (
                    <p className="text-sm text-muted-foreground">{tt.description}</p>
                  )}
                  <p className="mt-1 text-sm">
                    <span className="font-semibold text-primary">
                      {Number(tt.price) === 0 ? "Free" : formatNaira(tt.price)}
                    </span>{" "}
                    · {remaining > 0 ? `${remaining} ${isTable ? "table(s)" : "left"}` : "Sold out"}
                  </p>
                  {isTable && (
                    <p className="text-xs text-muted-foreground">
                      {tt.table_label ? `${tt.table_label} · ` : ""}
                      Seats {tt.seats_per_table ?? 0} guests per table
                    </p>
                  )}
                  {tt.sales_starts_at && window.reason === "not_started" && (
                    <p className="text-xs text-muted-foreground">
                      Opens {formatDateTime(tt.sales_starts_at)}
                    </p>
                  )}
                  {tt.sales_ends_at && window.onSale && (
                    <p className="text-xs text-muted-foreground">
                      Sales close {formatDateTime(tt.sales_ends_at)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 rounded-md border border-border">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!window.onSale}
                      onClick={() => setQuantities((q) => ({ ...q, [tt.id]: Math.max(1, qty - 1) }))}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-8 text-center text-sm">{qty}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!window.onSale}
                      onClick={() => setQuantities((q) => ({ ...q, [tt.id]: Math.min(maxQty, qty + 1) }))}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  <Button
                    disabled={!window.onSale || buy.isPending}
                    className="votix-gradient-bg font-semibold text-primary-foreground"
                    onClick={() =>
                      user
                        ? buy.mutate(tt.id)
                        : navigate({ to: "/auth", search: { redirect: `/events/${eventId}` } })
                    }
                  >
                    {window.reason === "sold_out"
                      ? "Sold out"
                      : !window.onSale
                        ? "Unavailable"
                        : buy.isPending
                          ? "Processing…"
                          : isTable
                            ? "Book table"
                            : "Buy ticket"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </TabsContent>


        {event.voting_enabled && (
          <TabsContent value="vote" className="mt-6 space-y-4">
            <Card className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <span className="text-muted-foreground">
                Voting {event.voting_ends_at ? `closes ${formatDateTime(event.voting_ends_at)}` : "is open"}
              </span>
              <Badge variant="secondary">
                {user ? `${votesLeft} of ${event.max_votes_per_user} vote(s) left` : "Sign in to vote"}
              </Badge>
            </Card>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(candidates ?? []).map((c) => {
                const voted = myVotes?.includes(c.id);
                return (
                  <Card key={c.id} className="overflow-hidden p-0">
                    <div className="aspect-square w-full bg-secondary">
                      {c.image_url ? (
                        <img src={c.image_url} alt={c.name} loading="lazy" className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center text-3xl font-black text-muted-foreground">
                          {c.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-4">
                      <p className="font-display font-bold">{c.name}</p>
                      {c.position && <p className="text-xs text-primary">{c.position}</p>}
                      <p className="line-clamp-2 text-xs text-muted-foreground">{c.bio}</p>
                      <Button
                        className="w-full"
                        variant={voted ? "secondary" : "default"}
                        disabled={voted || submitVote.isPending}
                        onClick={() =>
                          user
                            ? submitVote.mutate(c.id)
                            : navigate({ to: "/auth", search: { redirect: `/events/${eventId}` } })
                        }
                      >
                        <VoteIcon className="mr-2 size-4" /> {voted ? "Voted" : "Vote"}
                      </Button>
                    </div>
                  </Card>
                );
              })}
              {(candidates ?? []).length === 0 && (
                <Card className="p-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
                  Nominees haven't been published yet.
                </Card>
              )}
            </div>
          </TabsContent>
        )}

        <TabsContent value="results" className="mt-6">
          <Card className="space-y-4 p-6">
            {!resultData?.visible ? (
              <p className="text-sm text-muted-foreground">
                Results are hidden until the organizer publishes them or voting closes.
              </p>
            ) : (
              (resultData.results ?? []).map((r, index) => (
                <div key={r.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      {index === 0 && <Trophy className="size-4 text-primary" />} {r.name}
                    </span>
                    <span className="text-muted-foreground">{r.votes} vote(s)</span>
                  </div>
                  <Progress value={totalVotes ? (r.votes / totalVotes) * 100 : 0} />
                </div>
              ))
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
