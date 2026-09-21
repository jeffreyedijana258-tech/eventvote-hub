import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_CATEGORIES } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/organizer/new")({
  component: CreateEvent,
});

function CreateEvent() {
  const { user, isOrganizer } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
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

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent, status: "draft" | "pending") {
    e.preventDefault();
    if (!user) return;
    if (!form.title.trim()) {
      toast.error("Give your event a name.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("events")
      .insert({
        organizer_id: user.id,
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
        status,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      status === "pending" ? "Submitted for approval." : "Draft saved. Add tickets and nominees.",
    );
    void navigate({ to: "/organizer/$eventId", params: { eventId: data.id } });
  }

  if (!isOrganizer) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center text-sm text-muted-foreground">
        You need organizer access to create events.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl font-bold">Create an event</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Submit for approval when you're ready — a VOTIX admin reviews every event before it goes live.
      </p>

      <Card className="p-6">
        <form className="space-y-5" onSubmit={(e) => submit(e, "pending")}>
          <div className="space-y-2">
            <Label htmlFor="title">Event name</Label>
            <Input id="title" value={form.title} maxLength={150} onChange={(e) => set("title", e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={5}
              maxLength={4000}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
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
              <Label htmlFor="location">Location</Label>
              <Input id="location" value={form.location} maxLength={200} onChange={(e) => set("location", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="starts_at">Starts</Label>
              <Input id="starts_at" type="datetime-local" value={form.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ends_at">Ends</Label>
              <Input id="ends_at" type="datetime-local" value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cover">Cover image URL</Label>
            <Input
              id="cover"
              value={form.cover_image_url}
              maxLength={500}
              placeholder="https://…"
              onChange={(e) => set("cover_image_url", e.target.value)}
            />
          </div>

          <div className="space-y-4 rounded-lg border border-border/70 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Enable voting</p>
                <p className="text-xs text-muted-foreground">Let people vote for nominees.</p>
              </div>
              <Switch checked={form.voting_enabled} onCheckedChange={(v) => set("voting_enabled", v)} />
            </div>
            {form.voting_enabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vs">Voting opens</Label>
                  <Input id="vs" type="datetime-local" value={form.voting_starts_at} onChange={(e) => set("voting_starts_at", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ve">Voting closes</Label>
                  <Input id="ve" type="datetime-local" value={form.voting_ends_at} onChange={(e) => set("voting_ends_at", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mv">Votes per person</Label>
                  <Input
                    id="mv"
                    type="number"
                    min={1}
                    max={50}
                    value={form.max_votes_per_user}
                    onChange={(e) => set("max_votes_per_user", Number(e.target.value))}
                  />
                </div>
                <div className="flex items-center justify-between sm:col-span-2">
                  <p className="text-sm">Show live results publicly</p>
                  <Switch checked={form.results_public} onCheckedChange={(v) => set("results_public", v)} />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy} className="votix-gradient-bg font-semibold text-primary-foreground">
              {busy ? "Saving…" : "Submit for approval"}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={(e) => submit(e, "draft")}>
              Save as draft
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
