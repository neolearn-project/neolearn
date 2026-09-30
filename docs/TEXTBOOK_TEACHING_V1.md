# Textbook Teaching V1

## Setup

1. Back up the target database and inspect the existing `subjects.id`, `chapters.id`, and `topics.id` types. The migration expects their deployed types to be `bigint`, matching the current application’s numeric IDs. Review any existing Storage policies for the `textbook-pdfs` bucket name.
2. Review and apply `supabase/migrations/20260929_textbook_teaching_v1.sql` to the intended Supabase project. It runs in one transaction and creates a private `textbook-pdfs` bucket, restrictive client-deny Storage policy, server-only tables, foreign keys, durable processing checkpoints, and atomic processing/publication RPCs. Do not make the bucket public.
3. Verify the configured Supabase project permits signed uploads up to 25 MB and allows the application origin in its Storage/CORS configuration. The PDF is uploaded directly to private Storage; it does not traverse the hosting provider’s function request-body limit.
4. Deploy with the existing `ADMIN_PASSWORD`, Supabase URL, anon key, and service-role key settings. No new model, billing, subscription, or credit settings are required.
5. Install dependencies with `npm install`, then run `npx tsc --noEmit`, `npm test`, and `npm run build`.
6. Open `/admin/textbooks`. Application code falls back to existing `topics.content` only when the new mapping table is not installed or a topic has never had a published textbook mapping. Withdrawn material remains tombstoned.

## Rollback implications

- Roll back application code before dropping database objects. Older application code ignores the new tables.
- Unpublishing is the safe content rollback: it preserves the private PDF, reviewed pages, publication history, and tombstone while immediately removing the source from new teaching requests.
- Do not drop mappings for withdrawn sources unless intentionally restoring legacy `topics.content`; mappings are the withdrawal tombstone.
- Dropping `textbook_sources` cascades to pages, checkpoints, and mappings and is destructive. Removing the bucket deletes or strands original PDFs depending on the Storage operation used. Export both database rows and Storage objects first.
- The migration updates an existing bucket named `textbook-pdfs` to private with the V1 size/type limits and installs a restrictive client-deny policy. If that bucket name already serves another workflow, resolve the collision before applying the migration.

## Short upload guide

1. Enter the existing admin password.
2. Enter the exact book metadata. For the pilot use CBSE, Class 7, English, Poorvi, and the edition printed in the real PDF.
3. Choose `gepr101.pdf` and **Upload as draft**. PDFs must be valid, no larger than 25 MB, and no longer than 250 pages.
4. Choose the draft and click **Process / Retry**. Processing is an awaited, retry-bounded request; failed attempts are recorded and may be retried up to five times. A stale claim can be recovered after ten minutes.
5. Open **Review original PDF** to compare diagrams, tables, and page layout. Pages with very little readable text are flagged for OCR/manual correction. Every page inside a mapped range must be explicitly approved; unrelated pages may remain unreviewed.
6. Select existing subjects, chapters, and topics, set the inclusive page ranges, use **Add topic mapping** for each, then **Save all draft mappings**. IDs come from the live curriculum catalog; the server validates every relationship and range.
7. Click **Publish** only after mapped pages are approved. Publishing a source that overlaps an existing publication replaces that entire source, so the candidate must also map every other topic served by each source it would withdraw. Partial replacements are rejected. **Unpublish** removes teaching access immediately without deleting the PDF or reviewed text.

## Preview checklist

- [ ] Confirm the source is the real `gepr101.pdf`; do not infer content from filenames or catalog labels.
- [ ] Confirm metadata and edition exactly match the PDF.
- [ ] Confirm page count and review every page used by “The Day the River Spoke,” including diagrams and tables in the signed original-PDF preview.
- [ ] Correct or flag unreadable/scanned pages; verify publication is blocked for unreadable/unapproved pages inside mapped ranges while unrelated unmapped pages may remain unreviewed.
- [ ] Map only the existing CBSE Class 7 English → Poorvi → Learning Together Jahnavi topics shown by the catalog. Do not invent IDs.
- [ ] Save as draft and confirm students cannot access it.
- [ ] Publish, then test generate-lesson, teacher-math, and topic-test with a real entitled student selecting the mapped subject/chapter/topic.
- [ ] Confirm source facts match reviewed pages, examples are clearly examples, source instructions are ignored, and insufficient material does not create invented facts or padded questions.
- [ ] Confirm replay identity changes when the published source/version changes.
- [ ] Unpublish and confirm all three routes stop using the source; republish only after re-review.

Live success must not be claimed until the real PDF has been reviewed, published, and exercised through all three student routes in the target environment.
