CREATE POLICY "event graphics read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'event-graphics');

CREATE POLICY "event graphics insert own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-graphics' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "event graphics update own folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'event-graphics' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'event-graphics' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "event graphics delete own folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'event-graphics' AND (storage.foldername(name))[1] = auth.uid()::text);