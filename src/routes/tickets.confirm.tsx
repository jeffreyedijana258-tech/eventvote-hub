import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { verifyTicketPayment } from "@/lib/tickets.functions";

export const Route = createFileRoute("/tickets/confirm")({
  validateSearch: z.object({
    t: z.string().optional(),
    reference: z.string().optional(),
    trxref: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Your tickets — VOTIX" },
      { name: "description", content: "Payment confirmation and your VOTIX ticket QR codes." },
      { property: "og:title", content: "Your tickets — VOTIX" },
      { property: "og:description", content: "Payment confirmation and your VOTIX ticket QR codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmPage,
});

type Result = Awaited<ReturnType<typeof verifyTicketPayment>>;

function ConfirmPage() {
  const search = Route.useSearch();
  const verify = useServerFn(verifyTicketPayment);
  const [state, setState] = useState<"checking" | "success" | "failed">("checking");
  const [message, setMessage] = useState("Confirming your payment…");
  const [result, setResult] = useState<Result | null>(null);
  const reference = search.reference ?? search.trxref;

  useEffect(() => {
    if (!reference || !search.t) {
      setState("failed");
      setMessage("This ticket link is incomplete.");
      return;
    }
    let active = true;
    void verify({ data: { reference, token: search.t } })
      .then((res) => {
        if (!active) return;
        setResult(res);
        if (res.status === "success") {
          setState("success");
          setMessage("Payment confirmed. Show a QR code below at the entrance.");
        } else {
          setState("failed");
          setMessage("The payment was not completed. No ticket was issued.");
        }
      })
      .catch((e: unknown) => {
        if (!active) return;
        setState("failed");
        setMessage(e instanceof Error ? e.message : "We could not verify this payment.");
      });
    return () => {
      active = false;
    };
  }, [reference, search.t, verify]);

  const ok = result && result.status === "success" && "codes" in result ? result : null;

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-16">
      <Card className="space-y-3 p-8 text-center">
        {state === "checking" && <Loader2 className="mx-auto size-10 animate-spin text-primary" />}
        {state === "success" && <CheckCircle2 className="mx-auto size-10 text-success" />}
        {state === "failed" && <XCircle className="mx-auto size-10 text-destructive" />}
        <h1 className="font-display text-xl font-bold">
          {state === "checking" ? "Verifying payment" : state === "success" ? "You're in!" : "Payment not completed"}
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        {ok?.buyerEmail && (
          <p className="text-xs text-muted-foreground">
            A copy is being sent to <span className="text-foreground">{ok.buyerEmail}</span>. Bookmark this page too.
          </p>
        )}
      </Card>

      {ok && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="font-display text-lg font-semibold">{ok.eventTitle}</p>
            <p className="text-sm text-muted-foreground">
              {ok.eventStartsAt ? formatDateTime(ok.eventStartsAt) : ""} {ok.eventLocation ? `· ${ok.eventLocation}` : ""}
            </p>
          </div>
          {ok.codes.map((code) => (
            <Card key={code} className="flex items-center gap-4 p-4">
              <div className="rounded-md bg-foreground p-2">
                <QRCodeSVG value={code} size={110} level="M" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-xs uppercase text-muted-foreground">{ok.tierName}</p>
                <p className="text-sm font-medium">{ok.buyerName}</p>
                <p className="break-all font-mono text-xs">{code}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {state !== "checking" && (
        <div className="flex justify-center">
          <Link to="/events">
            <Button variant="secondary">Browse events</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
