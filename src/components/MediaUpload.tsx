import { useRef, useState } from "react";
import { Film, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "ad-media";
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const LIMITS = { video: 50 * 1024 * 1024, image: 5 * 1024 * 1024 };

function checkVideoPlayable(file: File) {
  return new Promise<number>((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(v.duration);
    };
    v.onerror = () => reject(new Error("This video format can't be played in browsers. Use MP4 (H.264) or WebM."));
    v.src = URL.createObjectURL(file);
  });
}

type Props = { kind: "video" | "image"; value: string; onChange: (url: string) => void };

export function MediaUpload({ kind, value, onChange }: Props) {
  const { user } = useAuth();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const types = kind === "video" ? VIDEO_TYPES : IMAGE_TYPES;

  async function handle(file: File): Promise<void> {
    if (!user) { toast.error("Sign in to upload."); return; }
    if (!types.includes(file.type))
      { toast.error(kind === "video" ? "Upload an MP4, WebM or MOV video." : "Upload a JPG, PNG or WebP image."); return; }
    if (file.size > LIMITS[kind])
      { toast.error(kind === "video" ? "Videos must be 50MB or smaller." : "Images must be 5MB or smaller."); return; }
    setBusy(true);
    try {
      if (kind === "video") {
        const duration = await checkVideoPlayable(file);
        if (duration > 120) throw new Error("Videos must be 2 minutes or shorter.");
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? (kind === "video" ? "mp4" : "jpg");
      const path = `${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data, error: sErr } = await supabase.storage.from(BUCKET).createSignedUrl(path, TEN_YEARS);
      if (sErr || !data?.signedUrl) throw sErr ?? new Error("Could not link the file.");
      onChange(data.signedUrl);
      toast.success(kind === "video" ? "Video uploaded." : "Thumbnail uploaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative aspect-video overflow-hidden rounded-lg border border-dashed border-border bg-secondary/40">
        {value ? (
          kind === "video" ? (
            <video src={value} controls muted playsInline className="size-full object-contain" />
          ) : (
            <img src={value} alt="Thumbnail" className="size-full object-cover" />
          )
        ) : (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground hover:text-primary"
          >
            {kind === "video" ? <Film className="size-6" /> : <ImagePlus className="size-6" />}
            {kind === "video" ? "Upload video (MP4/WebM, max 50MB)" : "Upload thumbnail (optional)"}
          </button>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept={types.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
        }}
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => ref.current?.click()}>
          {value ? "Replace" : "Choose file"}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
            <Trash2 className="mr-1 size-4 text-destructive" /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}
