-- Enforce upload limits before an object reaches the application layer.
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf']::text[]
where id = 'client-documents';
