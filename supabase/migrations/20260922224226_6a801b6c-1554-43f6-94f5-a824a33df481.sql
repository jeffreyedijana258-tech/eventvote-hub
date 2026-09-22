CREATE OR REPLACE FUNCTION public.enforce_event_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  allowed public.event_status[] := ARRAY['draft','pending','cancelled']::public.event_status[];
BEGIN
  -- Service role / internal jobs and admins may set any status.
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT (NEW.status = ANY(allowed)) THEN
      RAISE EXCEPTION 'Only an administrator can set event status to %', NEW.status;
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (NEW.status = ANY(allowed)) THEN
      RAISE EXCEPTION 'Only an administrator can set event status to %', NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_event_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS events_enforce_status ON public.events;
CREATE TRIGGER events_enforce_status
BEFORE INSERT OR UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.enforce_event_status();