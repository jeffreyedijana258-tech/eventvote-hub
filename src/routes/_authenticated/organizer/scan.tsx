import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Keyboard,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  Ticket,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { tierLabel, type TicketTierKind } from "@/lib/tiers";
import { scanTicket, type ScanResult } from "@/lib/scanner.functions";

export const Route = createFileRoute("/_authenticated/organizer/scan")({
  head: () => ({
    meta: [
      { title: "VOTIX Scanner — check attendees in at the gate" },
      {
        name: "description",
        content:
          "Scan VOTIX ticket QR codes with your phone camera, verify attendees instantly and keep a live check-in log for your event.",
      },
      { property: "og:title", content: "VOTIX Scanner — check attendees in at the gate" },
      {
        property: "og:description",
        content: "Verify VOTIX tickets at the door with secure camera scanning and a live attendance log.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ScannerPage,
});

type CameraState = "idle" | "starting" | "live" | "denied" | "unavailable";

const RESULT_UI: Record<
  ScanResult["result"],
  { label: string; tone: string; icon: typeof CheckCircle2; note: string }
> = {
  valid: {
    label: "VALID TICKET",
    tone: "border-emerald-500/60 bg-emerald-500/10 text-emerald-300",
    icon: CheckCircle2,
    note: "Checked in just now. Let them through.",
  },
  already_used: {
    label: "TICKET ALREADY USED",
    tone: "border-amber-500/60 bg-amber-500/10 text-amber-300",
    icon: ShieldAlert,
    note: "This ticket was already checked in.",
  },
  wrong_event: {
    label: "INVALID TICKET",
    tone: "border-destructive/60 bg-destructive/10 text-destructive",
    icon: XCircle,
    note: "This ticket belongs to a different event.",
  },
  invalid: {
    label: "INVALID TICKET",
    tone: "border-destructive/60 bg-destructive/10 text-destructive",
    icon: XCircle,
    note: "No ticket matches this code.",
  },
};

function ScannerPage() {
  const { user, isOrganizer, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const runScan = useServerFn(scanTicket);

  const [eventId, setEventId] = useState<string>("");
  const [camera, setCamera] = useState<CameraState>("idle");
  const [manualCode, setManualCode] = useState("");
  const [last, setLast] = useState<ScanResult | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopLoopRef = useRef<(() => void) | null>(null);
  const busyRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const { data: events } = useQuery({
    queryKey: ["scanner-events", user?.id, isAdmin],
    enabled: !!user && (isOrganizer || isAdmin),
    queryFn: async () => {
      let query = supabase
        .from("events")
        .select("id, title, starts_at, location, status")
        .order("starts_at", { ascending: true });
      if (!isAdmin) query = query.eq("organizer_id", user!.id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!eventId && events && events.length > 0) setEventId(events[0]!.id);
  }, [events, eventId]);

  const { data: history } = useQuery({
    queryKey: ["ticket-scans", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_scans")
        .select("id, scanned_code, result, created_at, scanned_by")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["scanner-counts", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const [{ count: total }, { count: used }] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", eventId),
        supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("is_used", true),
      ]);
      return { total: total ?? 0, used: used ?? 0 };
    },
  });

  const scan = useMutation({
    mutationFn: (code: string) => runScan({ data: { code, eventId } }),
    onSuccess: async (result) => {
      setLast(result);
      if (result.result === "valid") toast.success("Valid ticket — checked in.");
      else if (result.result === "already_used") toast.warning("This ticket was already used.");
      else toast.error("Invalid ticket.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ticket-scans", eventId] }),
        queryClient.invalidateQueries({ queryKey: ["scanner-counts", eventId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Could not check this ticket."),
  });

  const submitCode = useCallback(
    (code: string) => {
      const clean = code.trim().toUpperCase();
      if (!clean || !eventId || busyRef.current) return;
      const now = Date.now();
      if (lastCodeRef.current.code === clean && now - lastCodeRef.current.at < 3000) return;
      lastCodeRef.current = { code: clean, at: now };
      busyRef.current = true;
      scan.mutate(clean, { onSettled: () => (busyRef.current = false) });
    },
    [eventId, scan],
  );

  const stopCamera = useCallback(() => {
    stopLoopRef.current?.();
    stopLoopRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("idle");
  }, []);

  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setCamera("live");

      const AnyWindow = window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
        };
      };

      if (AnyWindow.BarcodeDetector) {
        const detector = new AnyWindow.BarcodeDetector({ formats: ["qr_code"] });
        let active = true;
        stopLoopRef.current = () => {
          active = false;
        };
        const loop = async () => {
          while (active) {
            try {
              const found = await detector.detect(video);
              if (found[0]?.rawValue) submitCode(found[0].rawValue);
            } catch {
              /* frame not ready */
            }
            await new Promise((r) => setTimeout(r, 350));
          }
        };
        void loop();
      } else {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) submitCode(result.getText());
        });
        stopLoopRef.current = () => controls.stop();
      }
    } catch (error) {
      const name = (error as { name?: string }).name;
      setCamera(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [submitCode]);

  useEffect(() => stopCamera, [stopCamera]);

  if (!isOrganizer && !isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <ShieldAlert className="mx-auto mb-4 size-8 text-primary" />
        <h1 className="font-display text-2xl font-bold">Scanner is for organizers</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only the organizer of an event (or a VOTIX admin) can check attendees in.
        </p>
        <Link to="/organizer">
          <Button className="mt-6" variant="secondary">
            Back to organizer hub
          </Button>
        </Link>
      </div>
    );
  }

  const selectedEvent = (events ?? []).find((e) => e.id === eventId);
  const ResultIcon = last ? RESULT_UI[last.result].icon : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link to="/organizer" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Organizer hub
      </Link>

      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">
          <span className="votix-gradient-text">VOTIX</span> Scanner
        </h1>
        <p className="text-sm text-muted-foreground">
          Point your camera at an attendee's ticket QR code to check them in.
        </p>
      </div>

      <Card className="mb-5 p-5">
        <Label className="text-xs uppercase tracking-widest text-muted-foreground">Checking in for</Label>
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="mt-2">
            <SelectValue placeholder="Choose an event" />
          </SelectTrigger>
          <SelectContent>
            {(events ?? []).map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedEvent && (
          <p className="mt-3 text-xs text-muted-foreground">
            {formatDateTime(selectedEvent.starts_at)} · {selectedEvent.location ?? "Online"}
          </p>
        )}
        <p className="mt-2 text-sm">
          <span className="font-display font-bold">{counts?.used ?? 0}</span>
          <span className="text-muted-foreground"> / {counts?.total ?? 0} tickets checked in</span>
        </p>
      </Card>

      <Card className="mb-5 overflow-hidden">
        <div className="relative aspect-[4/3] w-full bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`size-full object-cover ${camera === "live" ? "" : "opacity-0"}`}
          />
          {camera === "live" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="size-48 rounded-2xl border-2 border-primary/80 shadow-[0_0_40px_rgba(0,0,0,0.6)]" />
            </div>
          )}
          {camera !== "live" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              {camera === "denied" ? (
                <>
                  <CameraOff className="size-8 text-destructive" />
                  <p className="text-sm font-semibold">Camera access was blocked</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Allow camera access for this site in your browser settings, then try again. You can
                    still type ticket codes below.
                  </p>
                </>
              ) : camera === "unavailable" ? (
                <>
                  <CameraOff className="size-8 text-muted-foreground" />
                  <p className="text-sm font-semibold">No camera available</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Use the manual ticket code entry below.
                  </p>
                </>
              ) : (
                <>
                  <ScanLine className="size-8 text-primary" />
                  <p className="text-sm font-semibold">Ready to scan</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Start the camera and hold the attendee's QR code inside the frame.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          {camera === "live" ? (
            <Button variant="secondary" onClick={stopCamera} className="flex-1">
              <CameraOff className="mr-2 size-4" /> Stop camera
            </Button>
          ) : (
            <Button
              className="votix-gradient-bg flex-1 font-semibold text-primary-foreground"
              disabled={camera === "starting" || !eventId}
              onClick={() => void startCamera()}
            >
              <Camera className="mr-2 size-4" />
              {camera === "starting" ? "Starting…" : "Start camera"}
            </Button>
          )}
          {camera === "denied" && (
            <Button variant="outline" onClick={() => void startCamera()}>
              <RefreshCw className="mr-2 size-4" /> Retry
            </Button>
          )}
        </div>
      </Card>

      {last && ResultIcon && (
        <Card className={`mb-5 border-2 p-5 ${RESULT_UI[last.result].tone}`}>
          <div className="flex items-center gap-3">
            <ResultIcon className="size-7" />
            <div>
              <p className="font-display text-lg font-bold">{RESULT_UI[last.result].label}</p>
              <p className="text-xs opacity-80">{RESULT_UI[last.result].note}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-sm text-foreground sm:grid-cols-2">
            <Detail label="Attendee" value={last.attendeeName ?? "—"} />
            <Detail label="Event" value={last.eventTitle ?? "—"} />
            <Detail
              label="Ticket type"
              value={
                last.tierName
                  ? `${last.tierName}${last.tierKind ? ` · ${tierLabel(last.tierKind as TicketTierKind)}` : ""}`
                  : "—"
              }
            />
            <Detail label="Ticket ID" value={last.ticketCode} mono />
            <Detail
              label="Event date"
              value={last.eventStartsAt ? formatDateTime(last.eventStartsAt) : "—"}
            />
            <Detail label="Venue" value={last.eventLocation ?? "—"} />
            <Detail
              label="Check-in time"
              value={last.checkedInAt ? formatDateTime(last.checkedInAt) : "—"}
            />
          </div>
        </Card>
      )}

      <Card className="mb-5 p-5">
        <Label htmlFor="manual" className="flex items-center gap-2 text-sm font-semibold">
          <Keyboard className="size-4 text-primary" /> Manual ticket code
        </Label>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitCode(manualCode);
            setManualCode("");
          }}
        >
          <Input
            id="manual"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="TKT-XXXXXX-XXXXXXXXXXXXXX"
            className="font-mono uppercase"
          />
          <Button type="submit" disabled={!manualCode.trim() || !eventId || scan.isPending}>
            Check
          </Button>
        </form>
      </Card>

      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
        <Clock className="size-4 text-primary" /> Scan history
      </h2>
      <div className="space-y-2">
        {(history ?? []).length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No scans yet.</Card>
        )}
        {(history ?? []).map((row) => (
          <Card key={row.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-mono text-xs">{row.scanned_code}</p>
              <p className="text-[11px] text-muted-foreground">
                {formatDateTime(row.created_at)} · scanned by{" "}
                {row.scanned_by === user?.id ? "you" : "a team member"}
              </p>
            </div>
            <Badge
              variant={
                row.result === "valid"
                  ? "default"
                  : row.result === "already_used"
                    ? "secondary"
                    : "destructive"
              }
            >
              {row.result === "valid"
                ? "Valid"
                : row.result === "already_used"
                  ? "Already used"
                  : row.result === "wrong_event"
                    ? "Wrong event"
                    : "Invalid"}
            </Badge>
          </Card>
        ))}
      </div>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Ticket className="size-3.5" /> Tickets are verified and checked in on the VOTIX server — a code
        can only be used once, for its own event.
      </p>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm ${mono ? "break-all font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}

