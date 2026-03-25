-- Storage bucket for client analytics files
INSERT INTO storage.buckets (id, name, public) VALUES ('client-analytics', 'client-analytics', false);

-- Authenticated users can upload
CREATE POLICY analytics_storage_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'client-analytics' AND auth.role() = 'authenticated');

-- Everyone authenticated can read
CREATE POLICY analytics_storage_select ON storage.objects
  FOR SELECT USING (bucket_id = 'client-analytics' AND auth.role() = 'authenticated');

-- Authenticated users can delete (app-level permission check handles who)
CREATE POLICY analytics_storage_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'client-analytics' AND auth.role() = 'authenticated');
