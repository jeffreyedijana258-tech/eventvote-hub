export const TICKET_TIER_KINDS = [
  "regular",
  "vip",
  "vvip",
  "table",
  "platinum",
  "custom",
] as const;

export type TicketTierKind = (typeof TICKET_TIER_KINDS)[number];

export const TIER_LABELS: Record<TicketTierKind, string> = {
  regular: "Regular",
  vip: "VIP",
  vvip: "VVIP",
  table: "Table",
  platinum: "Premium / Platinum",
  custom: "Custom",
};

export function tierLabel(kind: string | null | undefined) {
  return TIER_LABELS[(kind ?? "regular") as TicketTierKind] ?? "Custom";
}

export type SaleWindow = {
  onSale: boolean;
  reason: "not_started" | "ended" | "inactive" | "sold_out" | null;
};

export function saleWindow(tt: {
  is_active: boolean;
  sales_starts_at: string | null;
  sales_ends_at: string | null;
  quantity_total: number;
  quantity_sold: number;
}): SaleWindow {
  const now = Date.now();
  if (!tt.is_active) return { onSale: false, reason: "inactive" };
  if (tt.sales_starts_at && new Date(tt.sales_starts_at).getTime() > now)
    return { onSale: false, reason: "not_started" };
  if (tt.sales_ends_at && new Date(tt.sales_ends_at).getTime() < now)
    return { onSale: false, reason: "ended" };
  if (tt.quantity_total - tt.quantity_sold <= 0) return { onSale: false, reason: "sold_out" };
  return { onSale: true, reason: null };
}
