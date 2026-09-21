import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { verifyTicketPayment } from "@/lib/tickets.functions";

export const Route = createFileRoute("/_authenticated/payment/callback")({
  validateSearch: z.object({
    reference: z.string().optional(),
    trxref: z.string().optional(),
  }),
  component: PaymentCallback,
});

function PaymentCallback() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const verify = useServerFn(verifyTicketPayment);
  const [state, setState] = useState<"checking" | "success" | "failed">("checking");
  const [message, setMessage] = useState("Confirming your payment with the bank…");

  const reference = search.reference ?? search.trxref;

  useEffect(() => {
    if (!reference) {
      setState("failed");
      setMessage("No payment reference was provided.");
      return;
    }
    let active = true;
    void verify({ data: { reference } })
      .then((res) => {
        if (!active) return;
        if (res.status === "success") {
          setState("success");
          setMessage("Payment verified. Your tickets are ready.");
        } else {
          setState("failed");
          setMessage("The payment was not completed. You have not been charged for a ticket.");
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState("failed");
        setMessage(error instanceof Error ? error.message : "We could not verify this payment.");
      });
    return () => {
      active = false;
    };
  }, [reference, verify]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-24">
      <Card className="space-y-4 p-8 text-center">
        {state === "checking" && <Loader2 className="mx-auto size-10 animate-spin text-primary" />}
        {state === "success" && <CheckCircle2 className="mx-auto size-10 text-success" />}
        {state === "failed" && <XCircle className="mx-auto size-10 text-destructive" />}
        <h1 className="font-display text-xl font-bold">
          {state === "checking" ? "Verifying payment" : state === "success" ? "Payment confirmed" : "Payment not completed"}
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        {reference && <p className="text-xs text-muted-foreground">Reference: {reference}</p>}
        {state !== "checking" && (
          <div className="flex justify-center gap-2">
            <Button onClick={() => navigate({ to: "/dashboard" })}>Go to my tickets</Button>
            <Link to="/events">
              <Button variant="secondary">Browse events</Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
