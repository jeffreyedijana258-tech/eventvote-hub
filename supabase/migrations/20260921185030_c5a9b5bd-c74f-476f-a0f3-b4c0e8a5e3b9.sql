
-- ROLES
CREATE TYPE public.app_role AS ENUM ('user','organizer','admin');
CREATE TYPE public.event_status AS ENUM ('draft','pending','approved','rejected','completed','cancelled');
CREATE TYPE public.payment_status AS ENUM ('pending','success','failed');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  username TEXT UNIQUE,
  avatar_url TEXT,
  phone TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE POLICY "profiles public read" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "roles read own or admin" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- EVENTS
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  cover_image_url TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status public.event_status NOT NULL DEFAULT 'draft',
  rejection_reason TEXT,
  voting_enabled BOOLEAN NOT NULL DEFAULT false,
  voting_starts_at TIMESTAMPTZ,
  voting_ends_at TIMESTAMPTZ,
  max_votes_per_user INT NOT NULL DEFAULT 1,
  results_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT SELECT ON public.events TO anon;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER events_touch BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "events public read approved" ON public.events FOR SELECT USING (status = 'approved' OR status = 'completed');
CREATE POLICY "events read own" ON public.events FOR SELECT TO authenticated USING (organizer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "events insert own" ON public.events FOR INSERT TO authenticated WITH CHECK (organizer_id = auth.uid() AND (public.has_role(auth.uid(),'organizer') OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "events update own" ON public.events FOR UPDATE TO authenticated USING (organizer_id = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (organizer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "events delete own" ON public.events FOR DELETE TO authenticated USING (organizer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.owns_event(_event_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND e.organizer_id = auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.event_is_public(_event_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND e.status IN ('approved','completed'));
$$;

-- CANDIDATES
CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bio TEXT,
  image_url TEXT,
  position TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidates TO authenticated;
GRANT SELECT ON public.candidates TO anon;
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "candidates public read" ON public.candidates FOR SELECT USING (public.event_is_public(event_id));
CREATE POLICY "candidates owner read" ON public.candidates FOR SELECT TO authenticated USING (public.owns_event(event_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "candidates owner write" ON public.candidates FOR INSERT TO authenticated WITH CHECK (public.owns_event(event_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "candidates owner update" ON public.candidates FOR UPDATE TO authenticated USING (public.owns_event(event_id) OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.owns_event(event_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "candidates owner delete" ON public.candidates FOR DELETE TO authenticated USING (public.owns_event(event_id) OR public.has_role(auth.uid(),'admin'));

-- VOTES
CREATE TABLE public.votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id, candidate_id)
);
GRANT SELECT, INSERT ON public.votes TO authenticated;
GRANT ALL ON public.votes TO service_role;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "votes read own" ON public.votes FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.owns_event(event_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "votes insert own" ON public.votes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- TICKET TYPES
CREATE TABLE public.ticket_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_total INT NOT NULL DEFAULT 100,
  quantity_sold INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_types TO authenticated;
GRANT SELECT ON public.ticket_types TO anon;
GRANT ALL ON public.ticket_types TO service_role;
ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_types public read" ON public.ticket_types FOR SELECT USING (public.event_is_public(event_id));
CREATE POLICY "ticket_types owner read" ON public.ticket_types FOR SELECT TO authenticated USING (public.owns_event(event_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ticket_types owner insert" ON public.ticket_types FOR INSERT TO authenticated WITH CHECK (public.owns_event(event_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ticket_types owner update" ON public.ticket_types FOR UPDATE TO authenticated USING (public.owns_event(event_id) OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.owns_event(event_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ticket_types owner delete" ON public.ticket_types FOR DELETE TO authenticated USING (public.owns_event(event_id) OR public.has_role(auth.uid(),'admin'));

-- ORDERS
CREATE TABLE public.ticket_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_type_id UUID NOT NULL REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  organizer_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.payment_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ticket_orders TO authenticated;
GRANT ALL ON public.ticket_orders TO service_role;
ALTER TABLE public.ticket_orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER orders_touch BEFORE UPDATE ON public.ticket_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "orders read own" ON public.ticket_orders FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.owns_event(event_id) OR public.has_role(auth.uid(),'admin'));

-- TICKETS
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.ticket_orders(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_type_id UUID NOT NULL REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_code TEXT NOT NULL UNIQUE,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tickets read own" ON public.tickets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.owns_event(event_id) OR public.has_role(auth.uid(),'admin'));

-- PAYMENTS
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.ticket_orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'paystack',
  reference TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.payment_status NOT NULL DEFAULT 'pending',
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments read own or admin" ON public.payments FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- FAVORITES
CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorites own" ON public.favorites FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications read own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications update own" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications delete own" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- REPORTS
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports insert own" ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reports read own or admin" ON public.reports FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "reports admin update" ON public.reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT UPDATE ON public.reports TO authenticated;

CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_organizer ON public.events(organizer_id);
CREATE INDEX idx_candidates_event ON public.candidates(event_id);
CREATE INDEX idx_votes_event ON public.votes(event_id);
CREATE INDEX idx_orders_event ON public.ticket_orders(event_id);
CREATE INDEX idx_tickets_user ON public.tickets(user_id);
