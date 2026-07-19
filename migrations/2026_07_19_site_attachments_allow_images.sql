-- 2026-07-19: Allow image uploads in the `site-attachments` storage bucket.
--
-- The Budget Notes "Images / Files" tab stores pasted/selected images (and PDFs)
-- in the existing `site-attachments` bucket. That bucket was created with an
-- allowed_mime_types whitelist covering only PDF / Office docs (for holiday
-- calendars + PO attachments), so image uploads fail with:
--     "mime type image/png is not supported"
--
-- This appends the image MIME types (and PDF, to be safe) to the bucket's
-- existing whitelist without dropping any currently-allowed types.
--
-- If allowed_mime_types is NULL the bucket already allows everything, so nothing
-- needs to change (the WHERE clause skips it).
--
-- Idempotent (uses distinct union). Usage: paste into the Supabase SQL editor
-- and Run. Requires privileges on the storage schema (run as the project owner).

update storage.buckets
set allowed_mime_types = (
  select array(
    select distinct unnest(
      coalesce(allowed_mime_types, array[]::text[])
      || array[
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/gif',
        'image/webp',
        'application/pdf'
      ]
    )
  )
)
where id = 'site-attachments'
  and allowed_mime_types is not null;
