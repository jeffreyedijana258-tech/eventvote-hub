export const COMMISSION_RATE = 0.05;

export function formatNaira(amount: number | string | null | undefined) {
  const value = Number(amount ?? 0);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Date to be announced";
  return new Date(value).toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "TBA";
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export const EVENT_CATEGORIES = [
  "Awards",
  "Concert",
  "Conference",
  "Pageant",
  "Festival",
  "Sports",
  "Comedy",
  "Faith",
  "Tech",
  "General",
] as const;

export function splitCommission(gross: number) {
  const commission = Math.round(gross * COMMISSION_RATE * 100) / 100;
  return { commission, organizer: Math.round((gross - commission) * 100) / 100 };
}
