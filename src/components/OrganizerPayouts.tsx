import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime, formatNaira } from "@/lib/format";
import {
  getPayoutSummary,
  listBanks,
  requestPayout,
  resolveBankAccount,
  saveBankAccount,
} from "@/lib/payouts.functions";

const errMsg = (e: unknown, f: string) => (e instanceof Error && e.message ? e.message : f);

export function OrganizerPayouts() {
  const qc = useQueryClient();
  const summaryFn = useServerFn(getPayoutSummary);
  const banksFn = useServerFn(listBanks);
  const resolveFn = useServerFn(resolveBankAccount);
  const saveFn = useServerFn(saveBankAccount);
  const requestFn = useServerFn(requestPayout);

  const [editing, setEditing] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [amount, setAmount] = useState("");

  const { data } = useQuery({ queryKey: ["payout-summary"], queryFn: () => summaryFn() });
  const showForm = editing || (data && !data.bank);
  const { data: banks } = useQuery({
    queryKey: ["paystack-banks"],
    enabled: !!showForm,
    staleTime: 3600_000,
    queryFn: () => banksFn(),
  });
  const bankName = banks?.find((b) => b.code === bankCode)?.name ?? "";

  const resolve = useMutation({
    mutationFn: () => resolveFn({ data: { accountNumber, bankCode } }),
    onSuccess: (r) => setResolvedName(r.accountName),
    onError: (e) => {
      setResolvedName(null);
      toast.error(errMsg(e, "Could not verify account."));
    },
  });
  const save = useMutation({
    mutationFn: () => saveFn({ data: { accountNumber, bankCode, bankName } }),
    onSuccess: () => {
      toast.success("Bank account saved.");
      setEditing(false);
      setResolvedName(null);
      void qc.invalidateQueries({ queryKey: ["payout-summary"] });
    },
    onError: (e) => toast.error(errMsg(e, "Could not save bank account.")),
  });
  const withdraw = useMutation({
    mutationFn: () => requestFn({ data: { amount: Number(amount) } }),
    onSuccess: () => {
      toast.success("Payout requested. VOTIX will process it shortly.");
      setAmount("");
      void qc.invalidateQueries({ queryKey: ["payout-summary"] });
    },
    onError: (e) => toast.error(errMsg(e, "Could not request payout.")),
  });

  const b = data?.balance;
  return (
    <section className="mb-8 space-y-4">
      <h2 className="font-display text-xl font-bold">Payouts</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Available to withdraw", value: b?.available ?? 0, accent: true },
          { label: "Pending payouts", value: b?.pending ?? 0 },
          { label: "Paid out", value: b?.paid ?? 0 },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <p className={`font-display text-xl font-bold ${s.accent ? "text-primary" : ""}`}>
              {formatNaira(s.value)}
            </p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Landmark className="size-5 text-primary" />
            <p className="font-semibold">Bank account</p>
          </div>
          {!showForm && data?.bank && (
            <div className="space-y-1 text-sm">
              <p className="font-semibold">{data.bank.account_name}</p>
              <p className="text-muted-foreground">
                {data.bank.bank_name} · {data.bank.account_number}
              </p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => setEditing(true)}>
                Change account
              </Button>
            </div>
          )}
          {showForm && (
            <div className="space-y-3">
              <Select
                value={bankCode}
                onValueChange={(v) => {
                  setBankCode(v);
                  setResolvedName(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={banks ? "Select your bank" : "Loading banks…"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(banks ?? []).map((bk) => (
                    <SelectItem key={bk.code} value={bk.code}>
                      {bk.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                inputMode="numeric"
                placeholder="10-digit account number"
                maxLength={10}
                value={accountNumber}
                onChange={(e) => {
                  setAccountNumber(e.target.value.replace(/\D/g, ""));
                  setResolvedName(null);
                }}
              />
              {resolvedName && (
                <p className="rounded-md bg-secondary p-2 text-sm">
                  Account name: <span className="font-semibold">{resolvedName}</span>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {!resolvedName ? (
                  <Button
                    size="sm"
                    disabled={!bankCode || accountNumber.length !== 10 || resolve.isPending}
                    onClick={() => resolve.mutate()}
                  >
                    {resolve.isPending ? "Verifying…" : "Verify account"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="votix-gradient-bg font-semibold text-primary-foreground"
                    disabled={save.isPending}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? "Saving…" : "Save bank account"}
                  </Button>
                )}
                {data?.bank && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <p className="font-semibold">Request a payout</p>
          <p className="text-xs text-muted-foreground">
            Minimum {formatNaira(data?.minPayout ?? 1000)}. Paid to your saved bank account after VOTIX review.
          </p>
          <div className="flex gap-2">
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Amount (₦)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Button variant="secondary" onClick={() => setAmount(String(b?.available ?? 0))}>
              Max
            </Button>
          </div>
          <Button
            className="votix-gradient-bg w-full font-semibold text-primary-foreground"
            disabled={!data?.bank || !Number(amount) || withdraw.isPending}
            onClick={() => withdraw.mutate()}
          >
            {withdraw.isPending ? "Submitting…" : "Withdraw"}
          </Button>
          {!data?.bank && <p className="text-xs text-muted-foreground">Save a bank account first.</p>}
        </Card>
      </div>

      {(data?.requests ?? []).length > 0 && (
        <div className="space-y-2">
          {data!.requests.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-semibold">{formatNaira(r.amount)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(r.created_at)} · {r.bank_name} · {r.account_number}
                </p>
                {r.admin_notes && <p className="text-xs text-muted-foreground">{r.admin_notes}</p>}
                {r.transfer_reference && (
                  <p className="font-mono text-[10px] text-muted-foreground">Ref: {r.transfer_reference}</p>
                )}
              </div>
              <PayoutBadge status={r.status} />
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

export function PayoutBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "paid" ? "default" : status === "rejected" ? "destructive" : "secondary"}>
      {status}
    </Badge>
  );
}
