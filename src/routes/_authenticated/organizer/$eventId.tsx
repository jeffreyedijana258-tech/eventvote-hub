import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, ScanLine, Trash2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_CATEGORIES, formatDateTime, formatNaira, splitCommission } from "@/lib/format";
import { checkInTicket } from "@/lib/tickets.functions";

export const Route = createFileRoute("/_authenticated/organizer/$eventId")({
  component: ManageEvent,
});

function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ManageEvent() {
  const { eventId } = Route.useParams();
  const queryClient = useQueryClient();
  const scan = useServerFn(checkInTicket);

  const { data: event, isLoading } = useQuery({
    queryKey: ["organizer-event", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: ticketTypes } = useQuery({
    queryKey: ["organizer-ticket-types", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_types")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: candidates } = useQuery({
    queryKey: ["organizer-candidates", eventId],
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

  const { data: orders } = useQuery({
    queryKey: ["organizer-event-orders", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_orders")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: votes } = useQuery({
    queryKey: ["organizer-event-votes", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("votes")
        .select("id, candidate_id, created_at")
        .eq("event_id", eventId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Awards",
    location: "",
    cover_image_url: "",
    starts_at: "",
    ends_at: "",
    voting_enabled: false,
    voting_starts_at: "",
    voting_ends_at: "",
    max_votes_per_user: 1,
    results_public: false,
  });

  useEffect(() => {
    if (!event) return;
    setForm({
      title: event.title,
      description: event.description ?? "",
      category: event.category,
      location: event.location ?? "",
      cover_image_url: event.cover_image_url ?? "",
      starts_at: toLocalInput(event.starts_at),
      ends_at: toLocalInput(event.ends_at),
      voting_enabled: event.voting_enabled,
      voting_starts_at: toLocalInput(event.voting_starts_at),
      voting_ends_at: toLocalInput(event.voting_ends_at),
      max_votes_per_user: event.max_votes_per_user,
      results_public: event.results_public,
    });
  }, [event]);

  const saveEvent = useMutation({
    mutationFn: async (status?: "draft" | "pending" | "approved" | "rejected" | "cancelled" | "completed") => {
      const { error } = await supabase
        .from("events")
        .update({
          title: form.title.trim(),
          description: form.description.trim() || null,
          category: form.category,
          location: form.location.trim() || null,
          cover_image_url: form.cover_image_url.trim() || null,
          starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
          ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
          voting_enabled: form.voting_enabled,
          voting_starts_at: form.voting_starts_at ? new Date(form.voting_starts_at).toISOString() : null,
          voting_ends_at: form.voting_ends_at ? new Date(form.voting_ends_at).toISOString() : null,
          max_votes_per_user: Math.max(1, Number(form.max_votes_per_user) || 1),
          results_public: form.results_public,
          ...(status ? { status } : {}),
        })
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event saved.");
      void queryClient.invalidateQueries({ queryKey: ["organizer-event", eventId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const [ticketForm, setTicketForm] = useState({ name: "", description: "", price: "0", quantity_total: "100" });
  const addTicketType = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ticket_types").insert({
        event_id: eventId,
        name: ticketForm.name.trim(),
        description: ticketForm.description.trim() || null,
        price: Number(ticketForm.price) || 0,
        quantity_total: Number(ticketForm.quantity_total) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTicketForm({ name: "", description: "", price: "0", quantity_total: "100" });
      toast.success("Ticket type added.");
      void queryClient.invalidateQueries({ queryKey: ["organizer-ticket-types", eventId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add ticket."),
  });

  const removeTicketType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ticket_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket type removed.");
      void queryClient.invalidateQueries({ queryKey: ["organizer-ticket-types", eventId] });
    },
    onError: () => toast.error("Tickets already sold for this type cannot be removed."),
  });

  const [candidateForm, setCandidateForm] = useState({ name: "", position: "", bio: "", image_url: "" });
  const addCandidate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("candidates").insert({
        event_id: eventId,
        name: candidateForm.name.trim(),
        position: candidateForm.position.trim() || null,
        bio: candidateForm.bio.trim() || null,
        image_url: candidateForm.image_url.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCandidateForm({ name: "", position: "", bio: "", image_url: "" });
      toast.success("Nominee added.");
      void queryClient.invalidateQueries({ queryKey: ["organizer-candidates", eventId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add nominee."),
  });

  const removeCandidate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candidates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organizer-candidates", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["organizer-event-votes", eventId] });
    },
  });

  const [code, setCode] = useState("");
  const checkIn = useMutation({
    mutationFn: () => scan({ data: { code } }),
    onSuccess: (res) => {
      setCode("");
      toast[res.alreadyUsed ? "warning" : "success"](
        res.alreadyUsed ? "This ticket was already used." : "Ticket checked in.",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Invalid ticket."),
  });

  if (isLoading) return <div className="px-4 py-24 text-center text-muted-foreground">Loading…</div>;
  if (!event)
    return (
      <div className="px-4 py-24 text-center text-muted-foreground">
        Event not found or not yours.
      </div>
    );

  const successful = (orders ?? []).filter((o) => o.status === "success");
  const gross = successful.reduce((s, o) => s + Number(o.gross_amount), 0);
  const { commission, organizer } = splitCommission(gross);
  const sold = successful.reduce((s, o) => s + o.quantity, 0);
  const voteCounts = new Map<string, number>();
  for (const v of votes ?? []) voteCounts.set(v.candidate_id, (voteCounts.get(v.candidate_id) ?? 0) + 1);
  const ranked = (candidates ?? [])
    .map((c) => ({ ...c, votes: voteCounts.get(c.id) ?? 0 }))
    .sort((a, b) => b.votes - a.votes);
  const totalVotes = ranked.reduce((s, c) => s + c.votes, 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <Link to="/organizer" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" /> Back to organizer hub
      </Link>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{event.title}</h1>
          <p className="text-sm text-muted-foreground">{formatDateTime(event.starts_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={event.status === "approved" ? "default" : "secondary"}>{event.status}</Badge>
          {(event.status === "draft" || event.status === "rejected") && (
            <Button size="sm" onClick={() => saveEvent.mutate("pending")}>
              Submit for approval
            </Button>
          )}
        </div>
      </div>

      {event.rejection_reason && event.status === "rejected" && (
        <Card className="mb-6 border-destructive/50 p-4 text-sm">
          Admin note: {event.rejection_reason}
        </Card>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Tickets sold", value: String(sold) },
          { label: "Gross sales", value: formatNaira(gross) },
          { label: "VOTIX fee (5%)", value: formatNaira(commission) },
          { label: "Your earnings", value: formatNaira(organizer) },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <p className="font-display text-xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="details">
        <TabsList className="flex-wrap">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="nominees">Nominees</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="results">Votes & results</TabsTrigger>
          <TabsTrigger value="checkin">Check-in</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <Card className="space-y-5 p-6">
            <div className="space-y-2">
              <Label>Event name</Label>
              <Input value={form.title} maxLength={150} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={5}
                maxLength={4000}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={form.location} maxLength={200} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Starts</Label>
                <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Ends</Label>
                <Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Cover image URL</Label>
                <Input
                  value={form.cover_image_url}
                  maxLength={500}
                  onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-border/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Voting enabled</p>
                <Switch
                  checked={form.voting_enabled}
                  onCheckedChange={(v) => setForm({ ...form, voting_enabled: v })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Voting opens</Label>
                  <Input type="datetime-local" value={form.voting_starts_at} onChange={(e) => setForm({ ...form, voting_starts_at: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Voting closes</Label>
                  <Input type="datetime-local" value={form.voting_ends_at} onChange={(e) => setForm({ ...form, voting_ends_at: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Votes per person</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={form.max_votes_per_user}
                    onChange={(e) => setForm({ ...form, max_votes_per_user: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm">Public results</p>
                  <Switch
                    checked={form.results_public}
                    onCheckedChange={(v) => setForm({ ...form, results_public: v })}
                  />
                </div>
              </div>
            </div>

            <Button
              className="votix-gradient-bg font-semibold text-primary-foreground"
              disabled={saveEvent.isPending}
              onClick={() => saveEvent.mutate(undefined)}
            >
              Save changes
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="tickets" className="mt-6 space-y-4">
          <Card className="space-y-4 p-6">
            <p className="font-display font-bold">Add a ticket type</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Name (e.g. Regular)"
                value={ticketForm.name}
                maxLength={60}
                onChange={(e) => setTicketForm({ ...ticketForm, name: e.target.value })}
              />
              <Input
                placeholder="Short description"
                value={ticketForm.description}
                maxLength={150}
                onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
              />
              <Input
                type="number"
                min={0}
                placeholder="Price (₦)"
                value={ticketForm.price}
                onChange={(e) => setTicketForm({ ...ticketForm, price: e.target.value })}
              />
              <Input
                type="number"
                min={1}
                placeholder="Quantity"
                value={ticketForm.quantity_total}
                onChange={(e) => setTicketForm({ ...ticketForm, quantity_total: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              On a {formatNaira(Number(ticketForm.price) || 0)} ticket you receive{" "}
              {formatNaira(splitCommission(Number(ticketForm.price) || 0).organizer)} after the 5% VOTIX fee.
            </p>
            <Button
              disabled={!ticketForm.name.trim() || addTicketType.isPending}
              onClick={() => addTicketType.mutate()}
            >
              <Plus className="mr-2 size-4" /> Add ticket type
            </Button>
          </Card>

          {(ticketTypes ?? []).map((tt) => (
            <Card key={tt.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="font-semibold">{tt.name}</p>
                <p className="text-xs text-muted-foreground">
                  {Number(tt.price) === 0 ? "Free" : formatNaira(tt.price)} · {tt.quantity_sold}/
                  {tt.quantity_total} sold
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeTicketType.mutate(tt.id)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="nominees" className="mt-6 space-y-4">
          <Card className="space-y-4 p-6">
            <p className="font-display font-bold">Add a nominee</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Full name"
                value={candidateForm.name}
                maxLength={100}
                onChange={(e) => setCandidateForm({ ...candidateForm, name: e.target.value })}
              />
              <Input
                placeholder="Category / position"
                value={candidateForm.position}
                maxLength={100}
                onChange={(e) => setCandidateForm({ ...candidateForm, position: e.target.value })}
              />
              <Input
                placeholder="Photo URL"
                value={candidateForm.image_url}
                maxLength={500}
                onChange={(e) => setCandidateForm({ ...candidateForm, image_url: e.target.value })}
              />
              <Textarea
                placeholder="Short bio"
                value={candidateForm.bio}
                maxLength={500}
                onChange={(e) => setCandidateForm({ ...candidateForm, bio: e.target.value })}
              />
            </div>
            <Button disabled={!candidateForm.name.trim() || addCandidate.isPending} onClick={() => addCandidate.mutate()}>
              <Plus className="mr-2 size-4" /> Add nominee
            </Button>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            {(candidates ?? []).map((c) => (
              <Card key={c.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.position}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeCandidate.mutate(c.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sales" className="mt-6 space-y-3">
          {(orders ?? []).length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">No orders yet.</Card>
          )}
          {(orders ?? []).map((o) => (
            <Card key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-mono text-xs">{o.reference}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}</p>
              </div>
              <div className="flex items-center gap-4">
                <span>{o.quantity} ×</span>
                <span>{formatNaira(o.gross_amount)}</span>
                <span className="text-muted-foreground">fee {formatNaira(o.commission_amount)}</span>
                <span className="font-semibold text-primary">{formatNaira(o.organizer_amount)}</span>
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

        <TabsContent value="results" className="mt-6">
          <Card className="space-y-4 p-6">
            <div className="flex items-center justify-between text-sm">
              <p className="font-display font-bold">Live results</p>
              <span className="text-muted-foreground">{totalVotes} total votes</span>
            </div>
            {ranked.length === 0 && <p className="text-sm text-muted-foreground">No nominees yet.</p>}
            {ranked.map((c, i) => (
              <div key={c.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    {i === 0 && c.votes > 0 && <Trophy className="size-4 text-primary" />} {c.name}
                  </span>
                  <span className="text-muted-foreground">{c.votes}</span>
                </div>
                <Progress value={totalVotes ? (c.votes / totalVotes) * 100 : 0} />
              </div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="checkin" className="mt-6">
          <Card className="space-y-4 p-6">
            <p className="font-display font-bold">Confirm a ticket</p>
            <p className="text-sm text-muted-foreground">
              Enter the ticket code shown in the attendee's dashboard.
            </p>
            <div className="flex gap-2">
              <Input
                value={code}
                placeholder="TKT-XXXX-XXXX"
                maxLength={40}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button disabled={!code.trim() || checkIn.isPending} onClick={() => checkIn.mutate()}>
                <ScanLine className="mr-2 size-4" /> Check in
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
