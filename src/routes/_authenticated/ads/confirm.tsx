import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { verifyAdPayment } from "@/lib/ads.functions";

export const Route = createFileRoute("/_authenticated/ads/confirm")({
  validateSearch: z.object({ reference: z.string().optional(), trxref: z.string().optional() }),
  head: () => ({ meta: [{ title: "Advert payment — VOTIX" }] }),
  component: ConfirmAd,
});

function ConfirmAd() {
  const { reference, trxref } = Route.useSearch();
  const ref = reference ?? trxref ?? "";
  const verify = useServerFn(verifyAdPayment);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["verify-ad", ref],
    enabled: !!ref,
    retry: 1,
    queryFn: () => verify({ data: { reference: ref } }),
  });

  let icon = <Clock className="mx-auto size-12 text-primary" />;
  let title = "Checking your payment…";
  let text = "Please wait while Paystack confirms your payment.";
  if (!ref || error || data?.status === "failed") {
    icon = <XCircle className="mx-auto size-12 text-destructive" />;
    title = "Payment not confirmed";
    text = error instanceof Error ? error.message : "Your payment wasn't completed. You can try again from My advertisements.";
  } else if (data?.status === "success") {
    icon = <CheckCircle2 className="mx-auto size-12 text-primary" />;
    title = "Payment confirmed";
    text = "Your advert is now pending VOTIX approval. You'll get a notification once it's live.";
  } else if (data?.status === "pending") {
    title = "Payment still processing";
    text = "Paystack hasn't confirmed this payment yet.";
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <Card className="space-y-4 p-8 text-center">
        {icon}
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{text}</p>
        <div className="flex justify-center gap-2">
          {data?.status === "pending" && (
            <Button variant="secondary" disabled={isLoading} onClick={() => void refetch()}>Check again</Button>
          )}
          <Link to="/ads"><Button className="votix-gradient-bg text-primary-foreground">My advertisements</Button></Link>
        </div>
      </Card>
    </div>
  );
}
