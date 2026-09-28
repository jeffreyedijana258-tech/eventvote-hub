import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type LiveAd = {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  destination_url: string | null;
  event_id: string | null;
};

function viewerKey() {
  try {
    let k = localStorage.getItem("votix-viewer");
    if (!k) {
      k = crypto.randomUUID();
      localStorage.setItem("votix-viewer", k);
    }
    return k;
  } catch {
    return "anon-session-viewer";
  }
}

function track(adId: string, kind: "impression" | "play" | "click", placement: string) {
  void supabase.rpc("record_ad_event", {
    _ad_id: adId,
    _kind: kind,
    _viewer_key: viewerKey(),
    _placement: placement,
  });
}

function AdCard({ ad, placement }: { ad: LiveAd; placement: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const seen = useRef(false);
  const href = ad.event_id ? `/events/${ad.event_id}` : ad.destination_url ?? "#";
  const external = !ad.event_id && !!ad.destination_url;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!seen.current) {
            seen.current = true;
            track(ad.id, "impression", placement);
          }
          if (!reduce) void el.play().catch(() => {});
        } else el.pause();
      },
      { threshold: [0, 0.5] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ad.id, placement]);

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="relative aspect-video bg-secondary">
        <video
          ref={ref}
          src={ad.video_url}
          poster={ad.thumbnail_url ?? undefined}
          muted
          loop
          playsInline
          controls
          preload="none"
          onPlay={() => track(ad.id, "play", placement)}
          className="size-full object-cover"
        />
        <span className="absolute left-2 top-2 rounded bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          Sponsored
        </span>
      </div>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer sponsored" : undefined}
        onClick={() => track(ad.id, "click", placement)}
        className="group flex items-start justify-between gap-3 p-4"
      >
        <div className="min-w-0">
          <p className="truncate font-display font-bold group-hover:text-primary">{ad.title}</p>
          {ad.description && <p className="line-clamp-2 text-xs text-muted-foreground">{ad.description}</p>}
        </div>
        <ExternalLink className="mt-1 size-4 shrink-0 text-primary" />
      </a>
    </div>
  );
}

export function SponsoredAds({ placement, limit = 3 }: { placement: string; limit?: number }) {
  const { data } = useQuery({
    queryKey: ["live-ads", placement, limit],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_live_ads", { _limit: limit });
      if (error) throw error;
      return (data ?? []) as LiveAd[];
    },
  });
  if (!data || data.length === 0) return null;
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex items-center gap-2">
        <Megaphone className="size-4 text-primary" />
        <h2 className="font-display text-lg font-bold">Sponsored</h2>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((ad) => (
          <AdCard key={ad.id} ad={ad} placement={placement} />
        ))}
      </div>
    </section>
  );
}
