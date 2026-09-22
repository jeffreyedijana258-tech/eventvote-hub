-- 1. Profiles: remove blanket public read
DROP POLICY IF EXISTS "profiles public read" ON public.profiles;

CREATE POLICY "profiles read own or admin"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::app_role));

REVOKE SELECT ON public.profiles FROM anon;

-- Safe public lookup of an organizer's display name for public events
CREATE OR REPLACE FUNCTION public.event_organizer_name(_event_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.full_name
  FROM public.events e
  JOIN public.profiles p ON p.id = e.organizer_id
  WHERE e.id = _event_id
    AND e.status IN ('approved','completed');
$$;

REVOKE ALL ON FUNCTION public.event_organizer_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_organizer_name(uuid) TO anon, authenticated, service_role;

-- 2. Storage: bind event-graphics reads to the uploader (signed URLs still work)
DROP POLICY IF EXISTS "event graphics read" ON storage.objects;

CREATE POLICY "event graphics read own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'event-graphics'
  AND (
    owner_id = (select auth.uid()::text)
    OR (storage.foldername(name))[1] = (select auth.uid()::text)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);
