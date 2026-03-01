-- 009: Storage RLS policies for the "reports" bucket
--
-- Run this in the Supabase SQL editor if you get:
--   "new row violates row-level security policy" when uploading PDF reports.
--
-- Alternatively, ensure your backend (Modal) uses SUPABASE_SERVICE_ROLE_KEY
-- (not the anon key); the service role bypasses RLS and no policy is needed.

-- Allow INSERT into the reports bucket (required for upload)
CREATE POLICY "Reports bucket: allow insert"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'reports');

-- Allow SELECT so files can be read (e.g. public URL or signed URL)
CREATE POLICY "Reports bucket: allow select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'reports');

-- Allow UPDATE so upsert (overwrite) works
CREATE POLICY "Reports bucket: allow update"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'reports');
