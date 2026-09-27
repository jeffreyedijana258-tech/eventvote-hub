CREATE TYPE public.ad_status AS ENUM ('pending_payment','pending_approval','approved','rejected','paused','archived','expired');
CREATE TYPE public.ad_event_kind AS ENUM ('impression','play','click');
CREATE TYPE public.social_platform AS ENUM ('facebook','instagram','tiktok');
CREATE TYPE public.social_post_status AS ENUM ('draft','scheduled','publishing','published','failed');

CREATE TABLE public.ad_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price numeric NOT NULL CHECK (price >= 0),
  duration_days integer NOT NULL DEFAULT 30 CHECK (duration_days > 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ad_plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ad_plans TO authenticated;
GRANT ALL ON public.ad_plans TO service_role;
ALTER TABLE public.ad_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad plans read active" ON public.ad_plans FOR SELECT USING (is_active OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ad plans admin insert" ON public.ad_plans FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ad plans admin update" ON public.ad_plans FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER ad_plans_touch BEFORE UPDATE ON public.ad_plans FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.ad_plans (name, description, price, duration_days, sort_order)
VALUES ('Video Advert — Monthly', 'Your video advert on VOTIX for 30 days', 10000, 30, 0);

CREATE TABLE public.advertisements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.ad_plans(id),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  video_url text NOT NULL,
  thumbnail_url text,
  destination_url text,
  status public.ad_status NOT NULL DEFAULT 'pending_payment',
  paid_until timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX advertisements_advertiser_idx ON public.advertisements(advertiser_id);
CREATE INDEX advertisements_status_idx ON public.advertisements(status);
GRANT SELECT, INSERT, UPDATE ON public.advertisements TO authenticated;
GRANT ALL ON public.advertisements TO service_role;
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ads read own or admin" ON public.advertisements FOR SELECT TO authenticated USING (advertiser_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ads insert own" ON public.advertisements FOR INSERT TO authenticated WITH CHECK (advertiser_id = auth.uid() AND status = 'pending_payment');
CREATE POLICY "ads admin update" ON public.advertisements FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER advertisements_touch BEFORE UPDATE ON public.advertisements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ad_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES public.advertisements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.ad_plans(id),
  reference text NOT NULL UNIQUE,
  amount numeric NOT NULL,
  duration_days integer NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'pending',
  raw_response jsonb,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ad_payments TO authenticated;
GRANT ALL ON public.ad_payments TO service_role;
ALTER TABLE public.ad_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad payments read own or admin" ON public.ad_payments FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.ad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES public.advertisements(id) ON DELETE CASCADE,
  kind public.ad_event_kind NOT NULL,
  viewer_key text NOT NULL,
  placement text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_events_ad_idx ON public.ad_events(ad_id, kind);
CREATE INDEX ad_events_dedupe_idx ON public.ad_events(ad_id, kind, viewer_key, created_at);
GRANT SELECT ON public.ad_events TO authenticated;
GRANT ALL ON public.ad_events TO service_role;
ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad events read owner or admin" ON public.ad_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.advertisements a WHERE a.id = ad_id AND a.advertiser_id = auth.uid()));

-- Live ads (public)
CREATE OR REPLACE FUNCTION public.get_live_ads(_limit integer DEFAULT 6)
RETURNS TABLE(id uuid, title text, description text, video_url text, thumbnail_url text, destination_url text, event_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.title, a.description, a.video_url, a.thumbnail_url, a.destination_url, a.event_id
  FROM public.advertisements a
  WHERE a.status = 'approved' AND a.paid_until IS NOT NULL AND a.paid_until > now()
  ORDER BY random()
  LIMIT LEAST(GREATEST(_limit,1), 12);
$$;
GRANT EXECUTE ON FUNCTION public.get_live_ads(integer) TO anon, authenticated, service_role;

-- Record analytics with dedupe (30 min per viewer/kind)
CREATE OR REPLACE FUNCTION public.record_ad_event(_ad_id uuid, _kind public.ad_event_kind, _viewer_key text, _placement text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _viewer_key IS NULL OR length(_viewer_key) < 8 OR length(_viewer_key) > 80 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.advertisements WHERE id = _ad_id AND status = 'approved' AND paid_until > now()) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.ad_events WHERE ad_id = _ad_id AND kind = _kind AND viewer_key = _viewer_key AND created_at > now() - interval '30 minutes') THEN RETURN; END IF;
  INSERT INTO public.ad_events (ad_id, kind, viewer_key, placement) VALUES (_ad_id, _kind, _viewer_key, left(_placement, 40));
END; $$;
GRANT EXECUTE ON FUNCTION public.record_ad_event(uuid, public.ad_event_kind, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ad_stats(_ad_ids uuid[])
RETURNS TABLE(ad_id uuid, impressions bigint, plays bigint, clicks bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.ad_id,
    count(*) FILTER (WHERE e.kind='impression'),
    count(*) FILTER (WHERE e.kind='play'),
    count(*) FILTER (WHERE e.kind='click')
  FROM public.ad_events e
  JOIN public.advertisements a ON a.id = e.ad_id
  WHERE e.ad_id = ANY(_ad_ids) AND (a.advertiser_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  GROUP BY e.ad_id;
$$;
GRANT EXECUTE ON FUNCTION public.ad_stats(uuid[]) TO authenticated, service_role;

-- Social
CREATE TABLE public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  platform public.social_platform NOT NULL,
  external_id text,
  display_name text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);
GRANT ALL ON public.social_accounts TO service_role;
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER social_accounts_touch BEFORE UPDATE ON public.social_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  platforms public.social_platform[] NOT NULL DEFAULT '{}',
  caption text NOT NULL DEFAULT '',
  hashtags text,
  image_url text,
  video_url text,
  link_url text,
  status public.social_post_status NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
GRANT ALL ON public.social_posts TO service_role;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "social posts read" ON public.social_posts FOR SELECT TO authenticated USING (author_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "social posts insert" ON public.social_posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.owns_event(event_id) AND status IN ('draft','scheduled'));
CREATE POLICY "social posts update draft" ON public.social_posts FOR UPDATE TO authenticated USING (author_id = auth.uid() AND status IN ('draft','scheduled','failed')) WITH CHECK (author_id = auth.uid() AND status IN ('draft','scheduled'));
CREATE POLICY "social posts delete" ON public.social_posts FOR DELETE TO authenticated USING (author_id = auth.uid() AND status <> 'publishing');
CREATE TRIGGER social_posts_touch BEFORE UPDATE ON public.social_posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();