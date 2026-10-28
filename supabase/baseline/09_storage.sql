-- Baseline 2026-10-26, Teil 09: Storage-Buckets + storage.objects-Policies (21). UNGETESTET.
-- Setzt das Supabase-Storage-Schema voraus (storage.buckets, storage.objects, storage.foldername()).
-- Hinweis: Bucket "avatars" (public) existiert live zusaetzlich zu den genannten 5 App-Buckets.
-- Hinweis: Fuer bucket "belege" gibt es live nur INSERT + SELECT Policies (kein UPDATE/DELETE) -- absichtlich unveraendert uebernommen.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('athena-uploads', 'athena-uploads', false, 52428800, ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','text/plain','text/csv','text/markdown','application/json']),
  ('avatars', 'avatars', true, NULL, NULL),
  ('belege', 'belege', false, NULL, NULL),
  ('reports', 'reports', false, NULL, NULL),
  ('valuable-documents', 'valuable-documents', false, 15728640, ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('valuables', 'valuables', false, 10485760, ARRAY['image/webp','image/png','image/jpeg','image/avif','image/gif','image/heic','image/heif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read avatars" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'avatars'::text));
CREATE POLICY "Users can update own avatar" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users can upload own avatar" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "athena uploads delete own" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'athena-uploads'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "athena uploads insert own" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'athena-uploads'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "athena uploads read own" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'athena-uploads'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "athena uploads update own" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'athena-uploads'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "belege insert own" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'belege'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "belege read own" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'belege'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "reports delete own" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "reports insert own" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "reports read own" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "reports update own" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'reports'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "valuable documents delete own" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'valuable-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "valuable documents insert own" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'valuable-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "valuable documents read own" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'valuable-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "valuable documents update own" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'valuable-documents'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
CREATE POLICY "valuables delete own" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'valuables'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "valuables insert own" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'valuables'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "valuables read own" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'valuables'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "valuables update own" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'valuables'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
