CREATE POLICY "ad media insert own folder" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ad-media' AND (storage.foldername(name))[1] = auth.uid()::text
  AND lower(storage.extension(name)) IN ('mp4','webm','mov','jpg','jpeg','png','webp'));
CREATE POLICY "ad media read own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ad-media' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "ad media delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ad-media' AND (storage.foldername(name))[1] = auth.uid()::text);