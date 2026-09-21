import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTime, formatNaira } from "@/lib/format";
import {
  adminListReports,
  adminModerateEvent,
  adminOverview,
  adminSetRole,
} from "@/lib/roles.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();
  const overview = useServerFn(adminOverview);
  const setRole = useServerFn(adminSetRole);
  const moderate = useServerFn(adminModerateEvent);
  const listReports = useServerFn(adminListReports);
  const [reason, setReason] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    enabled: isAdmin,
    queryFn: () => overview({}),
  });

  const { data: reports } = useQuery({
    queryKey: ["admin-reports"],
    enabled: isAdmin,
    queryFn: () => listReports({}),
  });

  const changeRole = useMutation({
    mutationFn: (input: { userId: string; role: "organizer" | "admin"; grant: boolean }) =>
      setRole({ data: input }),
    onSuccess: () => {
      toast.success("Role updated.");
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update role."),
  });

  const moderateEvent = useMutation({
    mutationFn: (input: { eventId: string; status: "approved" | "rejected"; reason?: string }) =>
      moderate({ data: input as { eventId: string; status: "approved" | "rejected" } }),
    onSuccess: () => {
      toast.success("Event updated.");
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update event."),
  });

  if (loading) return <div className="px-4 py-24 text-center text-muted-foreground">Loading…</div>;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <Shield className="mx-auto mb-4 size-10 text-muted-foreground" />
        <h1 className="font-display text-2xl font-bold">Super admin only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have permission to view this area.
        </p>
      </div>
    );
  }

  const rolesByUser = new Map<string, string[]>();
  for (const r of data?.roles ?? []) {
    rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.role]);
  }
  const eventTitles = new Map((data?.events ?? []).map((e) => [e.id, e.title]));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Super admin</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Platform-wide events, users, transactions and commission.
      </p>

      {error && (
        <Card className="mb-6 p-4 text-sm text-destructive">Could not load admin data.</Card>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Gross ticket sales", value: formatNaira(data?.totals.gross ?? 0) },
          { label: "VOTIX commission (5%)", value: formatNaira(data?.totals.commission ?? 0) },
          { label: "Organizer earnings", value: formatNaira(data?.totals.organizer ?? 0) },
          { label: "Tickets sold", value: String(data?.totals.tickets ?? 0) },
          { label: "Users", value: String(data?.counts.users ?? 0) },
          { label: "Events", value: String(data?.counts.events ?? 0) },
          { label: "Awaiting approval", value: String(data?.counts.pending ?? 0) },
          { label: "Total votes", value: String(data?.counts.votes ?? 0) },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <p className="font-display text-xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="events">
        <TabsList className="flex-wrap">
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="users">Users & roles</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-6 space-y-3">
          {isLoading && <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>}
          {(data?.events ?? []).map((e) => (
            <Card key={e.id} className="space-y-3 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-display font-bold">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.category} · {formatDateTime(e.starts_at)}
                  </p>
                </div>
                <Badge
                  variant={
                    e.status === "approved" ? "default" : e.status === "rejected" ? "destructive" : "secondary"
                  }
                >
                  {e.status}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Reason (for rejection)"
                  className="max-w-xs"
                  maxLength={300}
                  value={reason[e.id] ?? ""}
                  onChange={(ev) => setReason({ ...reason, [e.id]: ev.target.value })}
                />
                <Button
                  size="sm"
                  disabled={e.status === "approved"}
                  onClick={() => moderateEvent.mutate({ eventId: e.id, status: "approved" })}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={e.status === "rejected"}
                  onClick={() =>
                    moderateEvent.mutate({
                      eventId: e.id,
                      status: "rejected",
                      ...(reason[e.id] ? { reason: reason[e.id]! } : {}),
                    })
                  }
                >
                  Reject
                </Button>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="users" className="mt-6 space-y-3">
          {(data?.users ?? []).map((u) => {
            const userRoles = rolesByUser.get(u.id) ?? [];
            return (
              <Card key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold">{u.full_name ?? u.username ?? "Unnamed user"}</p>
                  <p className="text-xs text-muted-foreground">Joined {formatDateTime(u.created_at)}</p>
                  <div className="mt-1 flex gap-1">
                    {userRoles.map((r) => (
                      <Badge key={r} variant="secondary" className="text-[10px]">
                        {r === "admin" ? "super admin" : r}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      changeRole.mutate({
                        userId: u.id,
                        role: "organizer",
                        grant: !userRoles.includes("organizer"),
                      })
                    }
                  >
                    {userRoles.includes("organizer") ? "Remove organizer" : "Make organizer"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      changeRole.mutate({
                        userId: u.id,
                        role: "admin",
                        grant: !userRoles.includes("admin"),
                      })
                    }
                  >
                    {userRoles.includes("admin") ? "Remove admin" : "Make admin"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="transactions" className="mt-6 space-y-3">
          <Card className="flex flex-wrap gap-6 p-4 text-sm">
            <span>Successful: {(data?.orders ?? []).filter((o) => o.status === "success").length}</span>
            <span>Pending: {data?.counts.pendingPayments ?? 0}</span>
            <span>Failed: {data?.counts.failed ?? 0}</span>
          </Card>
          {(data?.orders ?? []).map((o) => (
            <Card key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-mono text-xs">{o.reference}</p>
                <p className="text-xs text-muted-foreground">
                  {eventTitles.get(o.event_id) ?? "Event"} · {formatDateTime(o.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span>{formatNaira(o.gross_amount)}</span>
                <span className="text-primary">fee {formatNaira(o.commission_amount)}</span>
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
        </TabsContent>

        <TabsContent value="reports" className="mt-6 space-y-3">
          {(reports ?? []).length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">No reports filed.</Card>
          )}
          {(reports ?? []).map((r) => (
            <Card key={r.id} className="p-4 text-sm">
              <p className="font-semibold">{r.reason}</p>
              <p className="text-xs text-muted-foreground">{r.details}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(r.created_at)}</p>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
