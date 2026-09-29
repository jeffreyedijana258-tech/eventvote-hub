import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime, formatNaira } from "@/lib/format";
import { adminAdAction, adminSavePlan } from "@/lib/ads.functions";
import { AD_STATUS_LABEL, useAdStats } from "@/lib/ads";

type Action = "approve" | "reject" | "pause" | "resume" | "archive" | "edit";

export function AdminAds() {
  const qc = useQueryClient();
  const act = useServerFn(adminAdAction);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, { title: string; description: string; destinationUrl: string }>>({});
  const { data: ads } = useQuery({
    queryKey: ["admin-ads"],
    queryFn: async () => {
      const { data } = await supabase.from("advertisements").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const stats = useAdStats((ads ?? []).map((a) => a.id));
  const mutate = useMutation({
    mutationFn: (i: { adId: string; action: Action; reason?: string; fields?: { title: string; description: string; destinationUrl: string } }) =>
      act({ data: i }),
    onSuccess: () => {
      toast.success("Advert updated.");
      setEditing({});
      void qc.invalidateQueries({ queryKey: ["admin-ads"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });
  const order = ["pending_approval", "approved", "paused", "pending_payment", "rejected", "expired", "archived"];
  const sorted = [...(ads ?? [])].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap gap-6 p-4 text-sm">
        <span>Pending approval: {(ads ?? []).filter((a) => a.status === "pending_approval").length}</span>
        <span>Live: {(ads ?? []).filter((a) => a.status === "approved").length}</span>
        <span>Total views: {[...(stats.data?.values() ?? [])].reduce((s, x) => s + Number(x.impressions), 0)}</span>
        <span>Total clicks: {[...(stats.data?.values() ?? [])].reduce((s, x) => s + Number(x.clicks), 0)}</span>
      </Card>
      {sorted.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No adverts yet.</Card>}
      {sorted.map((ad) => {
        const s = stats.data?.get(ad.id);
        const e = editing[ad.id];
        return (
          <Card key={ad.id} className="grid gap-4 p-4 md:grid-cols-[240px_1fr]">
            <video src={ad.video_url} poster={ad.thumbnail_url ?? undefined} controls muted preload="metadata" className="aspect-video w-full rounded bg-secondary object-cover" />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display font-bold">{ad.title}</p>
                <Badge variant={ad.status === "approved" ? "default" : ad.status === "rejected" ? "destructive" : "secondary"}>
                  {AD_STATUS_LABEL[ad.status] ?? ad.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{ad.description}</p>
              <p className="break-all text-xs text-muted-foreground">
                Link: {ad.event_id ? `/events/${ad.event_id}` : ad.destination_url ?? "—"} · Paid until {ad.paid_until ? formatDate(ad.paid_until) : "unpaid"}
              </p>
              <p className="text-xs">
                {Number(s?.impressions ?? 0)} views · {Number(s?.plays ?? 0)} plays · {Number(s?.clicks ?? 0)} clicks
              </p>
              {e ? (
                <div className="space-y-2">
                  <Input value={e.title} maxLength={80} onChange={(v) => setEditing({ ...editing, [ad.id]: { ...e, title: v.target.value } })} />
                  <Input value={e.description} maxLength={300} placeholder="Description" onChange={(v) => setEditing({ ...editing, [ad.id]: { ...e, description: v.target.value } })} />
                  <Input value={e.destinationUrl} maxLength={1000} placeholder="https://…" onChange={(v) => setEditing({ ...editing, [ad.id]: { ...e, destinationUrl: v.target.value } })} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => mutate.mutate({ adId: ad.id, action: "edit", fields: e })}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing({})}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {ad.status === "pending_approval" && (
                    <>
                      <Button size="sm" onClick={() => mutate.mutate({ adId: ad.id, action: "approve" })}>Approve</Button>
                      <Input className="h-8 max-w-48" placeholder="Rejection reason" maxLength={300} value={reason[ad.id] ?? ""} onChange={(v) => setReason({ ...reason, [ad.id]: v.target.value })} />
                      <Button size="sm" variant="destructive" onClick={() => mutate.mutate({ adId: ad.id, action: "reject", reason: reason[ad.id] ?? "" })}>Reject</Button>
                    </>
                  )}
                  {ad.status === "approved" && <Button size="sm" variant="secondary" onClick={() => mutate.mutate({ adId: ad.id, action: "pause" })}>Pause</Button>}
                  {ad.status === "paused" && <Button size="sm" onClick={() => mutate.mutate({ adId: ad.id, action: "resume" })}>Resume</Button>}
                  <Button size="sm" variant="secondary" onClick={() => setEditing({ [ad.id]: { title: ad.title, description: ad.description ?? "", destinationUrl: ad.destination_url ?? "" } })}>Edit</Button>
                  {ad.status !== "archived" && <Button size="sm" variant="ghost" onClick={() => mutate.mutate({ adId: ad.id, action: "archive" })}>Archive</Button>}
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function AdminAdPlans() {
  const qc = useQueryClient();
  const save = useServerFn(adminSavePlan);
  const blank = { name: "", description: "", price: 10000, durationDays: 30, isActive: true };
  const [draft, setDraft] = useState(blank);
  const { data: plans } = useQuery({
    queryKey: ["admin-ad-plans"],
    queryFn: async () => (await supabase.from("ad_plans").select("*").order("sort_order").order("price")).data ?? [],
  });
  const m = useMutation({
    mutationFn: (i: typeof blank & { id?: string }) => save({ data: i }),
    onSuccess: () => {
      toast.success("Plan saved.");
      setDraft(blank);
      void qc.invalidateQueries({ queryKey: ["admin-ad-plans"] });
      void qc.invalidateQueries({ queryKey: ["ad-plans-active"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed."),
  });
  return (
    <div className="space-y-3">
      {(plans ?? []).map((p) => (
        <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">{p.name}</p>
            <p className="text-xs text-muted-foreground">{formatNaira(Number(p.price))} · {p.duration_days} days</p>
          </div>
          <label className="flex items-center gap-2 text-xs">
            Active
            <Switch
              checked={p.is_active}
              onCheckedChange={(v) => m.mutate({ id: p.id, name: p.name, description: p.description ?? "", price: Number(p.price), durationDays: p.duration_days, isActive: v })}
            />
          </label>
        </Card>
      ))}
      <Card className="grid gap-2 p-4 sm:grid-cols-5">
        <Input placeholder="Plan name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <Input placeholder="Description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <Input type="number" min={0} placeholder="Price ₦" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
        <Input type="number" min={1} placeholder="Days" value={draft.durationDays} onChange={(e) => setDraft({ ...draft, durationDays: Number(e.target.value) })} />
        <Button disabled={draft.name.trim().length < 2 || m.isPending} onClick={() => m.mutate(draft)}>Add plan</Button>
      </Card>
    </div>
  );
}

export function AdminAdPayments() {
  const { data } = useQuery({
    queryKey: ["admin-ad-payments"],
    queryFn: async () => (await supabase.from("ad_payments").select("id, reference, amount, status, created_at, verified_at").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const total = (data ?? []).filter((p) => p.status === "success").reduce((s, p) => s + Number(p.amount), 0);
  return (
    <div className="space-y-3">
      <Card className="p-4 text-sm">Advertising revenue: <span className="font-bold">{formatNaira(total)}</span></Card>
      {(data ?? []).map((p) => (
        <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div>
            <p className="font-mono text-xs">{p.reference}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(p.created_at)}</p>
          </div>
          <div className="flex items-center gap-3">
            <span>{formatNaira(Number(p.amount))}</span>
            <Badge variant={p.status === "success" ? "default" : p.status === "pending" ? "secondary" : "destructive"}>{p.status}</Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function AdminSocialPosts() {
  const { data } = useQuery({
    queryKey: ["admin-social-posts"],
    queryFn: async () => (await supabase.from("social_posts").select("id, caption, platforms, status, scheduled_at, created_at, results").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <div className="space-y-3">
      {(data ?? []).length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No social posts yet.</Card>}
      {(data ?? []).map((p) => (
        <Card key={p.id} className="space-y-1 p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="line-clamp-1 font-semibold">{p.caption || "(no caption)"}</p>
            <Badge variant={p.status === "published" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>{p.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {p.platforms.join(", ")} · {p.scheduled_at ? `scheduled ${formatDateTime(p.scheduled_at)}` : formatDateTime(p.created_at)}
          </p>
          {Object.entries((p.results ?? {}) as Record<string, { status: string; error?: string }>).map(([k, r]) => (
            <p key={k} className="text-xs"><span className="capitalize">{k}</span>: {r.status}{r.error ? ` — ${r.error}` : ""}</p>
          ))}
        </Card>
      ))}
    </div>
  );
}
