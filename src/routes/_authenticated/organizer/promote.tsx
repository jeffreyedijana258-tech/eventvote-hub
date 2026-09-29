import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MediaUpload } from "@/components/MediaUpload";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import {
  disconnectSocial,
  getSocialConnectUrl,
  getSocialStatus,
  publishSocialPostNow,
} from "@/lib/social.functions";

export const Route = createFileRoute("/_authenticated/organizer/promote")({
  validateSearch: z.object({ eventId: z.string().optional(), social: z.string().optional() }),
  head: () => ({ meta: [{ title: "Promote event — VOTIX" }] }),
  component: PromotePage,
});

type Platform = "facebook" | "instagram" | "tiktok";
const PLATFORMS: { id: Platform; label: string; provider: "meta" | "tiktok" }[] = [
  { id: "facebook", label: "Facebook", provider: "meta" },
  { id: "instagram", label: "Instagram", provider: "meta" },
  { id: "tiktok", label: "TikTok", provider: "tiktok" },
];

function PromotePage() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const statusFn = useServerFn(getSocialStatus);
  const connectFn = useServerFn(getSocialConnectUrl);
  const disconnectFn = useServerFn(disconnectSocial);
  const publishFn = useServerFn(publishSocialPostNow);

  const [eventId, setEventId] = useState(search.eventId ?? "");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("#VOTIX #Nigeria");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [scheduleAt, setScheduleAt] = useState("");

  useEffect(() => {
    if (search.social) {
      if (search.social === "connected") toast.success("Account connected.");
      else toast.error(search.social);
    }
  }, [search.social]);

  const { data: events } = useQuery({
    queryKey: ["promote-events", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("events").select("id, title").eq("organizer_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: status } = useQuery({ queryKey: ["social-status"], queryFn: () => statusFn() });
  const { data: posts } = useQuery({
    queryKey: ["social-posts", user?.id],
    enabled: !!user,
    refetchInterval: (q) => ((q.state.data ?? []).some((p) => p.status === "publishing") ? 10_000 : false),
    queryFn: async () => {
      const { data } = await supabase.from("social_posts").select("*").eq("author_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const connected = new Set((status?.accounts ?? []).map((a) => a.platform));
  const linkUrl = eventId ? `${typeof window !== "undefined" ? window.location.origin : ""}/events/${eventId}` : "";

  const save = useMutation({
    mutationFn: async (mode: "draft" | "schedule" | "now") => {
      if (!eventId) throw new Error("Choose an event.");
      if (mode !== "draft" && platforms.length === 0) throw new Error("Choose at least one platform.");
      const missing = platforms.filter((p) => !connected.has(p));
      if (mode !== "draft" && missing.length) throw new Error(`Connect ${missing.join(", ")} first.`);
      if (mode === "schedule" && (!scheduleAt || new Date(scheduleAt) <= new Date()))
        throw new Error("Pick a future date and time.");
      const { data, error } = await supabase
        .from("social_posts")
        .insert({
          author_id: user!.id,
          event_id: eventId,
          platforms,
          caption,
          hashtags,
          image_url: imageUrl || null,
          video_url: videoUrl || null,
          link_url: linkUrl,
          status: mode === "schedule" ? "scheduled" : "draft",
          scheduled_at: mode === "schedule" ? new Date(scheduleAt).toISOString() : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (mode === "now") await publishFn({ data: { postId: data.id } });
      return mode;
    },
    onSuccess: (mode) => {
      toast.success(mode === "draft" ? "Draft saved." : mode === "schedule" ? "Post scheduled." : "Publishing started — see status below.");
      void qc.invalidateQueries({ queryKey: ["social-posts"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not save.");
      void qc.invalidateQueries({ queryKey: ["social-posts"] });
    },
  });

  const republish = useMutation({
    mutationFn: (postId: string) => publishFn({ data: { postId } }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["social-posts"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not publish."),
  });

  async function connect(provider: "meta" | "tiktok") {
    try {
      const r = await connectFn({ data: { provider, origin: window.location.origin, returnTo: `/organizer/promote${eventId ? `?eventId=${eventId}` : ""}` } });
      window.location.href = r.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold">
        <Share2 className="size-7 text-primary" /> Social promotion
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">Prepare and publish posts for your events on Facebook, Instagram and TikTok.</p>

      <Card className="mb-6 space-y-3 p-5">
        <h2 className="font-display text-lg font-bold">Connected accounts</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PLATFORMS.map((p) => {
            const configured = status?.configured[p.provider];
            const acct = status?.accounts.find((a) => a.platform === p.id);
            return (
              <div key={p.id} className="rounded-lg border border-border p-3">
                <p className="font-semibold">{p.label}</p>
                <p className="mb-2 truncate text-xs text-muted-foreground">
                  {acct ? acct.name ?? "Connected" : configured ? "Not connected" : "Not configured yet"}
                </p>
                {acct ? (
                  <Button size="sm" variant="ghost" onClick={async () => { await disconnectFn({ data: { platform: p.id } }); void qc.invalidateQueries({ queryKey: ["social-status"] }); }}>
                    Disconnect
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" disabled={!configured} onClick={() => void connect(p.provider)}>
                    Connect
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {status && (!status.configured.meta || !status.configured.tiktok) && (
          <p className="text-xs text-muted-foreground">
            Publishing turns on once VOTIX's official Facebook/Instagram and TikTok developer apps are approved. You can prepare and save drafts now.
          </p>
        )}
        <p className="text-xs text-muted-foreground">Instagram needs a Business account linked to a Facebook Page. TikTok needs a video.</p>
      </Card>

      <Card className="mb-10 space-y-5 p-5">
        <h2 className="font-display text-lg font-bold">Promote event</h2>
        <div className="space-y-2">
          <Label htmlFor="pe-event">Event</Label>
          <select id="pe-event" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Choose an event…</option>
            {(events ?? []).map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
          </select>
          {linkUrl && <p className="break-all text-xs text-muted-foreground">Event link: {linkUrl}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="pe-caption">Caption</Label>
          <Textarea id="pe-caption" maxLength={2000} value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pe-tags">Hashtags</Label>
          <Input id="pe-tags" maxLength={300} value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2"><Label>Image</Label><MediaUpload kind="image" value={imageUrl} onChange={setImageUrl} /></div>
          <div className="space-y-2"><Label>Video</Label><MediaUpload kind="video" value={videoUrl} onChange={setVideoUrl} /></div>
        </div>
        <div className="flex flex-wrap gap-5">
          {PLATFORMS.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={platforms.includes(p.id)}
                onCheckedChange={(v) => setPlatforms(v ? [...platforms, p.id] : platforms.filter((x) => x !== p.id))}
              />
              {p.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate("draft")}>Save draft</Button>
          <Button className="votix-gradient-bg text-primary-foreground" disabled={save.isPending} onClick={() => save.mutate("now")}>Post now</Button>
          <div className="space-y-1">
            <Label htmlFor="pe-when" className="text-xs">Schedule for</Label>
            <Input id="pe-when" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
          </div>
          <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate("schedule")}>Schedule post</Button>
        </div>
      </Card>

      <h2 className="mb-4 font-display text-xl font-bold">My posts</h2>
      <div className="space-y-3">
        {(posts ?? []).length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No posts yet.</Card>}
        {(posts ?? []).map((post) => {
          const results = (post.results ?? {}) as Record<string, { status: string; error?: string }>;
          return (
            <Card key={post.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="line-clamp-1 text-sm font-semibold">{post.caption || "(no caption)"}</p>
                <Badge variant={post.status === "published" ? "default" : post.status === "failed" ? "destructive" : "secondary"}>{post.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {post.platforms.join(", ") || "No platforms"} · {post.scheduled_at ? `scheduled ${formatDateTime(post.scheduled_at)}` : `created ${formatDateTime(post.created_at)}`}
              </p>
              {Object.entries(results).map(([p, r]) => (
                <p key={p} className="text-xs">
                  <span className="font-semibold capitalize">{p}:</span> {r.status}
                  {r.error && <span className="text-destructive"> — {r.error}</span>}
                </p>
              ))}
              {(post.status === "draft" || post.status === "failed") && post.platforms.length > 0 && (
                <Button size="sm" variant="secondary" disabled={republish.isPending} onClick={() => republish.mutate(post.id)}>
                  {post.status === "failed" ? "Retry" : "Post now"}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
