import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Megaphone, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MediaUpload } from "@/components/MediaUpload";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatNaira } from "@/lib/format";
import { startAdPayment } from "@/lib/ads.functions";
import { AD_STATUS_LABEL, useAdStats } from "@/lib/ads";

export const Route = createFileRoute("/_authenticated/ads/")({
  head: () => ({ meta: [{ title: "My advertisements — VOTIX" }] }),
  component: AdsPage,
});

function AdsPage() {
  const { user } = useAuth();
  const pay = useServerFn(startAdPayment);
  const [form, setForm] = useState({ title: "", description: "", videoUrl: "", thumbnailUrl: "", destinationUrl: "", eventId: "" });
  const [planId, setPlanId] = useState("");

  const { data: plans } = useQuery({
    queryKey: ["ad-plans-active"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_plans").select("*").eq("is_active", true).order("sort_order");
      return data ?? [];
    },
  });
  const { data: events } = useQuery({
    queryKey: ["ad-event-options"],
    queryFn: async () => {
      const { data } = await supabase.from("events").select("id, title").eq("status", "approved").order("starts_at");
      return data ?? [];
    },
  });
  const { data: ads, refetch } = useQuery({
    queryKey: ["my-ads", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("advertisements")
        .select("*")
        .eq("advertiser_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const stats = useAdStats((ads ?? []).map((a) => a.id));
  const chosenPlan = planId || plans?.[0]?.id || "";

  const checkout = useMutation({
    mutationFn: (input: { adId?: string }) =>
      pay({
        data: {
          planId: chosenPlan,
          origin: window.location.origin,
          ...(input.adId ? { adId: input.adId } : { ad: form }),
        },
      }),
    onSuccess: (r) => {
      if (r.free || !r.authorizationUrl) {
        toast.success("Advert is live — no payment needed for admins.");
        setForm({ title: "", description: "", videoUrl: "", thumbnailUrl: "", destinationUrl: "", eventId: "" });
        void refetch();
        return;
      }
      window.location.href = r.authorizationUrl;
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not start payment.");
      void refetch();
    },
  });

  const canSubmit = form.title.trim().length >= 3 && form.videoUrl && chosenPlan && (form.eventId || form.destinationUrl);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
        <Megaphone className="size-7 text-primary" /> My advertisements
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Put your video in front of VOTIX visitors. Adverts go live after payment and VOTIX approval.
      </p>

      <Card className="mb-10 space-y-5 p-5 sm:p-6">
        <h2 className="font-display text-xl font-bold">Create a video advert</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Video</Label>
            <MediaUpload kind="video" value={form.videoUrl} onChange={(v) => setForm({ ...form, videoUrl: v })} />
          </div>
          <div className="space-y-2">
            <Label>Thumbnail</Label>
            <MediaUpload kind="image" value={form.thumbnailUrl} onChange={(v) => setForm({ ...form, thumbnailUrl: v })} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ad-title">Title</Label>
            <Input id="ad-title" maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ad-event">Link to a VOTIX event (optional)</Label>
            <select
              id="ad-event"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.eventId}
              onChange={(e) => setForm({ ...form, eventId: e.target.value })}
            >
              <option value="">— None —</option>
              {(events ?? []).map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.title}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ad-desc">Description</Label>
            <Textarea id="ad-desc" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {!form.eventId && (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ad-link">Destination link</Label>
              <Input id="ad-link" placeholder="https://…" maxLength={1000} value={form.destinationUrl} onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })} />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label>Plan</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {(plans ?? []).map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setPlanId(p.id)}
                className={`rounded-lg border p-4 text-left transition-colors ${chosenPlan === p.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
              >
                <p className="font-display text-lg font-bold">{formatNaira(Number(p.price))}</p>
                <p className="text-xs text-muted-foreground">{p.name} · {p.duration_days} days</p>
              </button>
            ))}
          </div>
        </div>
        <Button
          className="votix-gradient-bg font-semibold text-primary-foreground"
          disabled={!canSubmit || checkout.isPending}
          onClick={() => checkout.mutate({})}
        >
          {checkout.isPending ? "Opening Paystack…" : "Pay & submit for approval"}
        </Button>
      </Card>

      <h2 className="mb-4 font-display text-xl font-bold">My campaigns</h2>
      <div className="space-y-3">
        {(ads ?? []).length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No adverts yet.</Card>}
        {(ads ?? []).map((ad) => {
          const s = stats.data?.get(ad.id);
          const expired = ad.paid_until && new Date(ad.paid_until) < new Date();
          const status = expired && ["approved", "paused"].includes(ad.status) ? "expired" : ad.status;
          return (
            <Card key={ad.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-4">
                <video src={ad.video_url} poster={ad.thumbnail_url ?? undefined} muted preload="none" className="h-16 w-28 shrink-0 rounded object-cover" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{ad.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {ad.starts_at ? `${formatDate(ad.starts_at)} → ${formatDate(ad.paid_until)}` : "Not started"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Number(s?.impressions ?? 0)} views · {Number(s?.plays ?? 0)} plays · {Number(s?.clicks ?? 0)} clicks
                  </p>
                  {ad.status === "rejected" && ad.rejection_reason && (
                    <p className="text-xs text-destructive">{ad.rejection_reason}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary"}>
                  {AD_STATUS_LABEL[status] ?? status}
                </Badge>
                {!["rejected", "archived"].includes(ad.status) && (
                  <Button size="sm" variant="secondary" disabled={checkout.isPending} onClick={() => checkout.mutate({ adId: ad.id })}>
                    <RefreshCw className="mr-1 size-3.5" />
                    {ad.status === "pending_payment" ? "Pay now" : "Renew"}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
