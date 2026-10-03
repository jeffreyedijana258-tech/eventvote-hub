CREATE TYPE public.payout_status AS ENUM ('pending','approved','paid','rejected');

CREATE TABLE public.organizer_bank_accounts (
  user_id uuid PRIMARY KEY,
  bank_name text NOT NULL,
  bank_code text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organizer_bank_accounts TO authenticated;
GRANT ALL ON public.organizer_bank_accounts TO service_role;
ALTER TABLE public.organizer_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or admin reads bank account" ON public.organizer_bank_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER organizer_bank_accounts_touch BEFORE UPDATE ON public.organizer_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  status public.payout_status NOT NULL DEFAULT 'pending',
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  admin_notes text,
  transfer_reference text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payout_requests_organizer_idx ON public.payout_requests (organizer_id, created_at DESC);
GRANT SELECT ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or admin reads payouts" ON public.payout_requests
  FOR SELECT TO authenticated USING (auth.uid() = organizer_id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER payout_requests_touch BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();