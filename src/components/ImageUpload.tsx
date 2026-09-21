import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "event-graphics";
const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
const MAX_BYTES = 10 * 1024 * 1024;

type Props = {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  aspect?: "wide" | "square";
};

export function ImageUpload({ value, onChange, label = "Graphic", aspect = "wide" }: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!user) {
      toast.error("Sign in to upload images.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Images must be 10MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, TEN_YEARS);
      if (signError || !data?.signedUrl) throw signError ?? new Error("Could not link the image.");
      onChange(data.signedUrl);
      toast.success("Image uploaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div
        className={`relative overflow-hidden rounded-lg border border-dashed border-border bg-secondary/40 ${
          aspect === "wide" ? "aspect-[21/9]" : "aspect-square max-w-40"
        }`}
      >
        {value ? (
          <img src={value} alt={label} className="size-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground hover:text-primary"
          >
            <ImagePlus className="size-6" />
            Upload {label.toLowerCase()}
          </button>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <ImagePlus className="mr-2 size-4" /> {value ? "Replace image" : "Choose image"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            <Trash2 className="mr-2 size-4 text-destructive" /> Remove
          </Button>
        )}
      </div>

      <Input
        placeholder="…or paste an image URL"
        value={value}
        maxLength={1000}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
