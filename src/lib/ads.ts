import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const AD_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  pending_approval: "Pending approval",
  approved: "Live",
  rejected: "Rejected",
  paused: "Paused",
  archived: "Archived",
  expired: "Expired",
};

export function useAdStats(ids: string[]) {
  return useQuery({
    queryKey: ["ad-stats", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ad_stats", { _ad_ids: ids });
      if (error) throw error;
      return new Map((data ?? []).map((s) => [s.ad_id, s]));
    },
  });
}
