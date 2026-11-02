-- Create the 'expedientes' storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('expedientes', 'expedientes', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the 'expedientes' bucket
-- Allow authenticated users to upload files to their own folder
CREATE POLICY "Allow authenticated upload to expedientes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'expedientes');

-- Allow authenticated users to read their own files
CREATE POLICY "Allow authenticated read from expedientes"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'expedientes');

-- Allow authenticated users to update their own files
CREATE POLICY "Allow authenticated update to expedientes"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'expedientes')
  WITH CHECK (bucket_id = 'expedientes');

-- Allow authenticated users to delete their own files
CREATE POLICY "Allow authenticated delete from expedientes"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'expedientes');
