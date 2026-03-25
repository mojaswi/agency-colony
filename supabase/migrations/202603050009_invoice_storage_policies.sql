-- Storage policies for invoices bucket

-- Allow employees to upload to their own folder
CREATE POLICY storage_invoices_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'invoices' 
    AND (storage.foldername(name))[1] = (SELECT id::text FROM app.employees WHERE auth_user_id = auth.uid())
  );

-- Allow employees to read their own files
CREATE POLICY storage_invoices_select_own ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoices' 
    AND (storage.foldername(name))[1] = (SELECT id::text FROM app.employees WHERE auth_user_id = auth.uid())
  );

-- Allow invoice viewers to read all files
CREATE POLICY storage_invoices_select_viewer ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoices' 
    AND app.is_invoice_viewer()
  );

-- Allow employees to delete their own files
CREATE POLICY storage_invoices_delete_own ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'invoices' 
    AND (storage.foldername(name))[1] = (SELECT id::text FROM app.employees WHERE auth_user_id = auth.uid())
  );
