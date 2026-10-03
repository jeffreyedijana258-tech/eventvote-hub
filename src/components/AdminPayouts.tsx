import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PayoutBadge } from "@/components/OrganizerPayouts";
import { formatDateTime, formatNaira } from "@/lib/format";
import { adminListPayouts, adminUpdatePayout } from "@/lib/payouts.functions";

export function AdminPayouts() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPayouts);
  const updateFn = useServerFn(adminUpdatePayout);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [refs, setRefs] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({ queryKey: ["admin-payouts"], queryFn: () => listFn() });
  const update = useMutation({
    mutationFn: (input: { id: string; status: "approved" | "paid" | "rejected" }) =>
      updateFn({
        data: {
          ...input,
          ...(notes[input.id] ? { notes: notes[input.id] } : {}),
          ...(refs[input.id] ? { transferReference: refs[input.id] } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Payout updated.");
      void qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update payout."),
  });

  const open = (data ?? []).filter((r) => r.status === "pending" || r.status === "approved");
  const owed = open.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap gap-6 p-4 text-sm">
        <span>Open requests: {open.length}</span>
        <span>Amount owed: {formatNaira(owed)}</span>
      </Card>
      {isLoading && <Card className="p-8 text-center text-sm text-muted-foreground">Loading…</Card>}
      {!isLoading && (data ?? []).length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">No payout requests yet.</Card>
      )}
      {(data ?? []).map((r) => {
        const closed = r.status === "paid" || r.status === "rejected";
        return (
          <Card key={r.id} className="space-y-3 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-bold">{formatNaira(r.amount)}</p>
                <p className="text-xs text-muted-foreground">
                  {r.organizer_name ?? "Organizer"} · {formatDateTime(r.created_at)}
                </p>
                <p className="text-xs">
                  {r.account_name} · {r.bank_name} · <span className="font-mono">{r.account_number}</span>
                </p>
                {r.transfer_reference && (
                  <p className="font-mono text-[10px] text-muted-foreground">Ref: {r.transfer_reference}</p>
                )}
              </div>
              <PayoutBadge status={r.status} />
            </div>
            {!closed && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="max-w-[200px]"
                  placeholder="Note (optional)"
                  maxLength={500}
                  value={notes[r.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                />
                <Input
                  className="max-w-[200px]"
                  placeholder="Transfer reference"
                  maxLength={120}
                  value={refs[r.id] ?? ""}
                  onChange={(e) => setRefs({ ...refs, [r.id]: e.target.value })}
                />
                {r.status === "pending" && (
                  <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: r.id, status: "approved" })}>
                    Approve
                  </Button>
                )}
                <Button size="sm" onClick={() => update.mutate({ id: r.id, status: "paid" })}>
                  Mark paid
                </Button>
                <Button size="sm" variant="destructive" onClick={() => update.mutate({ id: r.id, status: "rejected" })}>
                  Reject
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
