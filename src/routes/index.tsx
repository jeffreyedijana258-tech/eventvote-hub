import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BadgeCheck, CalendarCheck, Ticket, Vote } from "lucide-react";
import heroImage from "@/assets/hero-crowd.jpg";
import { EventCard, type EventCardData } from "@/components/EventCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VOTIX — Tickets. Votes. Experiences." },
      {
        name: "description",
        content:
          "Discover live events, buy verified tickets and vote for your favourite nominees on VOTIX.",
      },
      { property: "og:title", content: "VOTIX — Tickets. Votes. Experiences." },
      {
        property: "og:description",
        content: "Discover live events, buy verified tickets and vote for your favourite nominees.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { data, isLoading } = useQuery({
    queryKey: ["featured-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, category, cover_image_url, location, starts_at, voting_enabled")
        .eq("status", "approved")
        .order("starts_at", { ascending: true })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as EventCardData[];
    },
  });

  return (
    <div>
      <section className="relative overflow-hidden">
        <img
          src={heroImage}
          alt="Crowd celebrating at a live event"
          width={1600}
          height={1008}
          className="absolute inset-0 size-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
            <BadgeCheck className="size-3.5" /> Verified tickets · Secure voting
          </p>
          <h1 className="max-w-3xl font-display text-4xl font-extrabold leading-tight sm:text-6xl">
            Tickets. Votes. <span className="votix-gradient-text">Experiences.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            VOTIX is where you discover the events that matter, get your ticket in seconds and vote
            for the nominees you believe in.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/events">
              <Button size="lg" className="votix-gradient-bg font-semibold text-primary-foreground">
                Explore events <ArrowRight className="ml-1 size-4" />
              </Button>
            </Link>
            <Link to="/organizer">
              <Button size="lg" variant="secondary">
                Host an event
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-14 sm:grid-cols-3 sm:px-6">
        {[
          { icon: Ticket, title: "Buy tickets safely", text: "Every payment is verified before your ticket code is issued." },
          { icon: Vote, title: "Vote for nominees", text: "One secure vote per person, exactly as the organizer set it." },
          { icon: CalendarCheck, title: "Track everything", text: "Tickets, votes, favourites and alerts in your dashboard." },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border border-border/70 bg-card p-6">
            <Icon className="mb-3 size-6 text-primary" />
            <h3 className="font-display text-lg font-bold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold sm:text-3xl">Happening soon</h2>
            <p className="text-sm text-muted-foreground">Fresh events approved on VOTIX.</p>
          </div>
          <Link to="/events">
            <Button variant="ghost" className="text-primary">
              View all <ArrowRight className="ml-1 size-4" />
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full rounded-xl" />
            ))}
          </div>
        ) : (data ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-16 text-center text-muted-foreground">
            No live events yet — check back shortly, or host the first one.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(data ?? []).map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
