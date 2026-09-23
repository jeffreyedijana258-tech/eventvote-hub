CREATE TYPE public.scan_result AS ENUM ('valid','invalid','already_used','wrong_event');

CREATE TABLE public.ticket_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  scanned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scanned_code text NOT NULL,
  result public.scan_result NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ticket_scans TO authenticated;
GRANT ALL ON public.ticket_scans TO service_role;

ALTER TABLE public.ticket_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scans read organizer or admin" ON public.ticket_scans
  FOR SELECT TO authenticated
  USING (public.owns_event(event_id) OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX ticket_scans_event_created_idx ON public.ticket_scans (event_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.check_in_ticket(_code text, _event_id uuid)
RETURNS TABLE (
  result public.scan_result,
  ticket_id uuid,
  ticket_code text,
  attendee_name text,
  event_title text,
  event_starts_at timestamptz,
  event_location text,
  tier_name text,
  tier_kind public.ticket_tier_kind,
  checked_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(btrim(_code));
  v_authorized boolean;
  t record;
  v_result public.scan_result;
  v_checked timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to scan tickets.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = _event_id AND e.organizer_id = auth.uid()
  ) OR public.has_role(auth.uid(), 'admin') INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'You are not allowed to scan tickets for this event.';
  END IF;

  SELECT tk.id, tk.event_id, tk.ticket_code, tk.is_used, tk.used_at, tk.user_id, tk.ticket_type_id
    INTO t
  FROM public.tickets tk
  WHERE tk.ticket_code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.ticket_scans (ticket_id, event_id, scanned_by, scanned_code, result)
    VALUES (NULL, _event_id, auth.uid(), v_code, 'invalid');
    RETURN QUERY SELECT 'invalid'::public.scan_result, NULL::uuid, v_code, NULL::text, NULL::text,
      NULL::timestamptz, NULL::text, NULL::text, NULL::public.ticket_tier_kind, NULL::timestamptz;
    RETURN;
  END IF;

  IF t.event_id IS DISTINCT FROM _event_id THEN
    v_result := 'wrong_event';
  ELSIF t.is_used THEN
    v_result := 'already_used';
    v_checked := t.used_at;
  ELSE
    v_result := 'valid';
    v_checked := now();
    UPDATE public.tickets SET is_used = true, used_at = v_checked WHERE id = t.id;
  END IF;

  INSERT INTO public.ticket_scans (ticket_id, event_id, scanned_by, scanned_code, result)
  VALUES (t.id, _event_id, auth.uid(), v_code, v_result);

  RETURN QUERY
  SELECT v_result,
         t.id,
         t.ticket_code,
         p.full_name,
         e.title,
         e.starts_at,
         e.location,
         tt.name,
         tt.tier_kind,
         v_checked
  FROM public.events e
  LEFT JOIN public.profiles p ON p.id = t.user_id
  LEFT JOIN public.ticket_types tt ON tt.id = t.ticket_type_id
  WHERE e.id = t.event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_ticket(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_in_ticket(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(text, uuid) TO service_role;