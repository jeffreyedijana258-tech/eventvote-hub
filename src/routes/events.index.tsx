import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EventCard, type EventCardData } from "@/components/EventCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_CATEGORIES } from "@/lib/format";

export const Route = createFileRoute("/events/")({
  head: () => ({
    meta: [
      { title: "Explore events — VOTIX" },
      {
        name: "description",
        content: "Search and filter live events, awards and pageants with tickets and voting on VOTIX.",
      },
      { property: "og:title", content: "Explore events — VOTIX" },
      {
        property: "og:description",
        content: "Search and filter live events, awards and pageants with tickets and voting.",
      },
    ],
  }),
  component: ExploreEvents,
});

function ExploreEvents() {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("soonest");
  const [onlyVoting, setOnlyVoting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["public-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, description, category, cover_image_url, location, starts_at, voting_enabled, created_at")
        .eq("status", "approved")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const events = useMemo(() => {
    let list = (data ?? []) as (EventCardData & { description: string | null; created_at: string })[];
    if (term.trim()) {
      const q = term.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.location ?? "").toLowerCase().includes(q) ||
          (e.description ?? "").toLowerCase().includes(q),
      );
    }
    if (category !== "all") list = list.filter((e) => e.category === category);
    if (onlyVoting) list = list.filter((e) => e.voting_enabled);
    if (sort === "newest") {
      list = [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
    return list;
  }, [data, term, category, sort, onlyVoting]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-8 space-y-2">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">
          Explore <span className="votix-gradient-text">events</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Concerts, awards, pageants and conferences — buy a ticket or cast your vote.
        </p>
      </div>

      <div className="mb-8 grid gap-3 rounded-xl border border-border/70 bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search events, cities…"
            className="pl-9"
            maxLength={100}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {EVENT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="soonest">Soonest first</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={onlyVoting ? "default" : "secondary"}
            onClick={() => setOnlyVoting((v) => !v)}
            className="shrink-0"
          >
            Voting
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-16 text-center text-muted-foreground">
          No events match your search yet.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
