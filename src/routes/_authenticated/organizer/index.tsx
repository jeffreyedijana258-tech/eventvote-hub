import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BarChart3, Plus, ScanLine, Ticket, Vote, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatNaira } from "@/lib/format";
import { becomeOrganizer } from "@/lib/roles.functions";

export const Route = createFileRoute("/_authenticated/organizer/")({
  component: OrganizerHome,
});

function OrganizerHome() {
  const { user, isOrganizer, refresh } = useAuth();
  const upgrade = useServerFn(becomeOrganizer);

  const becomeOrg = useMutation({
    mutationFn: () => upgrade({}),
    onSuccess: async () => {
      await refresh();
      toast.success("You're an organizer now.");
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "Could not unlock organizer access.",
      ),
  });

  const { data: events } = useQuery({
    queryKey: ["organizer-events", user?.id],
    enabled: !!user && isOrganizer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("organizer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["organizer-orders", user?.id],
    enabled: !!user && isOrganizer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_orders")
        .select("id, status, gross_amount, commission_amount, organizer_amount, quantity, event_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: voteCount } = useQuery({
    queryKey: ["organizer-votes", user?.id],
    enabled: !!user && isOrganizer,
    queryFn: async () => {
      const { count } = await supabase.from("votes").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  if (!isOrganizer) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Host events on VOTIX</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Unlock the organizer hub to create events, sell tickets and run voting. VOTIX keeps 5% of
          each ticket sale.
        </p>
        <Button
          className="votix-gradient-bg mt-6 font-semibold text-primary-foreground"
          disabled={becomeOrg.isPending}
          onClick={() => becomeOrg.mutate()}
        >
          Become an organizer
        </Button>
      </div>
    );
  }

  const successful = (orders ?? []).filter((o) => o.status === "success");
  const gross = successful.reduce((s, o) => s + Number(o.gross_amount), 0);
  const commission = successful.reduce((s, o) => s + Number(o.commission_amount), 0);
  const earnings = successful.reduce((s, o) => s + Number(o.organizer_amount), 0);
  const ticketsSold = successful.reduce((s, o) => s + o.quantity, 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Organizer hub</h1>
          <p className="text-sm text-muted-foreground">Your events, sales and voting results.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/organizer/scan">
            <Button variant="secondary" className="font-semibold">
              <ScanLine className="mr-2 size-4" /> Votix Scanner
            </Button>
          </Link>
          <Link to="/organizer/new">
            <Button className="votix-gradient-bg font-semibold text-primary-foreground">
              <Plus className="mr-2 size-4" /> Create event
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Gross sales", value: formatNaira(gross), icon: BarChart3 },
          { label: "Your earnings (95%)", value: formatNaira(earnings), icon: Wallet },
          { label: "VOTIX fee (5%)", value: formatNaira(commission), icon: Wallet },
          { label: "Tickets sold", value: String(ticketsSold), icon: Ticket },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-5">
            <Icon className="mb-2 size-5 text-primary" />
            <p className="font-display text-xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-8 flex items-center gap-3 p-5">
        <Vote className="size-5 text-primary" />
        <p className="text-sm">
          <span className="font-semibold">{voteCount ?? 0}</span> total votes across your events
        </p>
      </Card>

      <h2 className="mb-4 font-display text-xl font-bold">My events</h2>
      <div className="space-y-3">
        {(events ?? []).length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            You haven't created an event yet.
          </Card>
        )}
        {(events ?? []).map((event) => {
          const evOrders = successful.filter((o) => o.event_id === event.id);
          return (
            <Card key={event.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="font-display font-bold">{event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {event.category} · {formatDate(event.starts_at)} · {event.location ?? "Online"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {evOrders.reduce((s, o) => s + o.quantity, 0)} sold ·{" "}
                  {formatNaira(evOrders.reduce((s, o) => s + Number(o.organizer_amount), 0))} earned
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    event.status === "approved"
                      ? "default"
                      : event.status === "rejected" || event.status === "cancelled"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {event.status}
                </Badge>
                <Link to="/organizer/$eventId" params={{ eventId: event.id }}>
                  <Button variant="secondary">Manage</Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
