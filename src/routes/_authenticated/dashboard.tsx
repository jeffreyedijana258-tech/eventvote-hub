import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, Heart, Sparkles, Ticket, Vote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventCard, type EventCardData } from "@/components/EventCard";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, formatNaira } from "@/lib/format";
import { becomeOrganizer } from "@/lib/roles.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user, profile, isOrganizer, refresh } = useAuth();
  const queryClient = useQueryClient();
  const upgrade = useServerFn(becomeOrganizer);

  const { data: tickets } = useQuery({
    queryKey: ["my-tickets", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, events(title, starts_at, location), ticket_types(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["my-orders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_orders")
        .select("*, events(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: votes } = useQuery({
    queryKey: ["my-vote-history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("votes")
        .select("id, created_at, candidates(name), events(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: favorites } = useQuery({
    queryKey: ["my-favorites", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("id, events(id, title, category, cover_image_url, location, starts_at, voting_enabled)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: notifications } = useQuery({
    queryKey: ["my-notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const becomeOrg = useMutation({
    mutationFn: () => upgrade({}),
    onSuccess: async () => {
      await refresh();
      toast.success("Organizer access unlocked. Head to the organizer hub.");
    },
    onError: () => toast.error("Could not unlock organizer access."),
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-notifications", user?.id] }),
  });

  const stats = [
    { label: "Tickets", value: tickets?.length ?? 0, icon: Ticket },
    { label: "Votes cast", value: votes?.length ?? 0, icon: Vote },
    { label: "Favourites", value: favorites?.length ?? 0, icon: Heart },
    { label: "Alerts", value: (notifications ?? []).filter((n) => !n.is_read).length, icon: Bell },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">
            Hi {profile?.full_name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="text-sm text-muted-foreground">Your tickets, votes and saved events.</p>
        </div>
        {isOrganizer ? (
          <Link to="/organizer">
            <Button variant="secondary">
              <Sparkles className="mr-2 size-4" /> Organizer hub
            </Button>
          </Link>
        ) : (
          <Button
            className="votix-gradient-bg font-semibold text-primary-foreground"
            disabled={becomeOrg.isPending}
            onClick={() => becomeOrg.mutate()}
          >
            <Sparkles className="mr-2 size-4" /> Become an organizer
          </Button>
        )}
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="flex items-center gap-4 p-5">
            <Icon className="size-6 text-primary" />
            <div>
              <p className="font-display text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="tickets">
        <TabsList className="flex-wrap">
          <TabsTrigger value="tickets">My tickets</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="votes">Voting history</TabsTrigger>
          <TabsTrigger value="favorites">Favourites</TabsTrigger>
          <TabsTrigger value="alerts">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="mt-6 grid gap-4 sm:grid-cols-2">
          {(tickets ?? []).length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground sm:col-span-2">
              No tickets yet. <Link to="/events" className="text-primary">Find an event</Link>.
            </Card>
          )}
          {(tickets ?? []).map((t) => {
            const ev = t.events as unknown as { title: string; starts_at: string | null; location: string | null };
            const tt = t.ticket_types as unknown as { name: string };
            return (
              <Card key={t.id} className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display font-bold">{ev?.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(ev?.starts_at)}</p>
                    <p className="text-xs text-muted-foreground">{ev?.location}</p>
                  </div>
                  <Badge variant={t.is_used ? "secondary" : "default"}>
                    {t.is_used ? "Used" : "Valid"}
                  </Badge>
                </div>
                <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {tt?.name} · ticket code
                  </p>
                  <p className="font-display text-lg font-bold tracking-wider text-primary">
                    {t.ticket_code}
                  </p>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="orders" className="mt-6 space-y-3">
          {(orders ?? []).map((o) => (
            <Card key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-semibold">
                  {(o.events as unknown as { title: string })?.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {o.reference} · {formatDateTime(o.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span>{o.quantity} ×</span>
                <span className="font-semibold">{formatNaira(o.gross_amount)}</span>
                <Badge
                  variant={
                    o.status === "success" ? "default" : o.status === "pending" ? "secondary" : "destructive"
                  }
                >
                  {o.status}
                </Badge>
              </div>
            </Card>
          ))}
          {(orders ?? []).length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">No orders yet.</Card>
          )}
        </TabsContent>

        <TabsContent value="votes" className="mt-6 space-y-3">
          {(votes ?? []).map((v) => (
            <Card key={v.id} className="flex items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-semibold">
                  {(v.candidates as unknown as { name: string })?.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(v.events as unknown as { title: string })?.title}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{formatDateTime(v.created_at)}</span>
            </Card>
          ))}
          {(votes ?? []).length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              You haven't voted yet.
            </Card>
          )}
        </TabsContent>

        <TabsContent value="favorites" className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(favorites ?? []).map((f) => {
            const ev = f.events as unknown as EventCardData | null;
            return ev ? <EventCard key={f.id} event={ev} /> : null;
          })}
          {(favorites ?? []).length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
              No saved events yet.
            </Card>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="mt-6 space-y-3">
          {(notifications ?? []).map((n) => (
            <Card key={n.id} className="flex items-start justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(n.created_at)}</p>
              </div>
              {!n.is_read && (
                <Button variant="ghost" size="sm" onClick={() => markRead.mutate(n.id)}>
                  Mark read
                </Button>
              )}
            </Card>
          ))}
          {(notifications ?? []).length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">No notifications.</Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
