# Textbook Teaching V1

## Setup

1. Back up the target database and inspect the existing `subjects.id`, `chapters.id`, and `topics.id` types. The migration expects their deployed types to be `bigint`, matching the current application’s numeric IDs. Review any existing Storage policies for the `textbook-pdfs` bucket name.
2. Review and apply `supabase/migrations/20260929_textbook_teaching_v1.sql` to the intended Supabase project. It runs in one transaction and creates a private `textbook-pdfs` bucket, restrictive client-deny Storage policy, server-only tables, foreign keys, durable processing checkpoints, and atomic processing/publication RPCs. Do not make the bucket public.
3. Review and apply `supabase/migrations/20261007_textbook_mapping_suggestion_identity.sql`. It adds `processing_revision`, increments it on every completed processing pass (including identical bytes), moves replacement-version allocation into a service-role-only RPC, and adds an overloaded suggestion save RPC. Replacement creation and suggestion saving take the same transaction-level book-identity advisory lock. The original manual-mapping RPC remains intact.
4. Verify the configured Supabase project permits signed uploads up to 25 MB and allows the application origin in its Storage/CORS configuration. The PDF is uploaded directly to private Storage; it does not traverse the hosting provider’s function request-body limit.
5. Deploy with the existing `ADMIN_PASSWORD`, Supabase URL, anon key, and service-role key settings. No new model, billing, subscription, or credit settings are required.
6. Install dependencies with `npm install`, then run `npx tsc --noEmit`, `npm test`, and `npm run build`.
7. Open `/admin/textbooks`. Application code falls back to existing `topics.content` only when the new mapping table is not installed or a topic has never had a published textbook mapping. Withdrawn material remains tombstoned.

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
6. After processing, click **Generate mapping suggestions**. The server compares headings near the start of each extracted PDF page with existing topics under the source's selected board, class, and subject. It uses exact or conservatively normalized title matching only; it does not call an AI provider and never creates or renames curriculum entries.
7. Review the evidence and reason shown for each proposal, edit its inclusive PDF page range if needed, deselect uncertain rows, then click **Accept selected into draft**. This does not save anything. Unresolved topics remain visible and must be mapped manually when appropriate. A chapter heading by itself never assigns every topic in that chapter.
8. Use the existing manual subject/chapter/topic controls as a fallback or to supplement proposals, then click **Save all draft mappings**. Saving replaces this source's prior draft mapping set only after the existing server validation succeeds. Regenerating proposals does not change saved mappings, unsaved draft mappings, or the identity captured when older proposals were accepted. Stale accepted proposals are rejected if source version, SHA-256, processing revision, or latest book version changed.
9. Click **Publish** only after mapped pages are approved. Suggested mappings do not approve pages or publish a source. Publishing a source that overlaps an existing publication replaces that entire source, so the candidate must also map every other topic served by each source it would withdraw. Partial replacements are rejected. **Unpublish** removes teaching access immediately without deleting the PDF or reviewed text.

## Mapping suggestion limitations

- V1 suggestion matching is intentionally conservative and deterministic. Processing preserves PDF.js line endings, and a topic must occupy its own bounded extracted line on a page marked as layout-preserved. Arbitrary prose mentions, contents/index pages, flattened legacy extraction, repeated running headers, duplicate normalized curriculum titles, missing/weak headings, OCR damage, and ambiguous matches remain unresolved.
- Normalization handles Unicode compatibility, case, whitespace, punctuation, and common leading chapter/unit/lesson numbering. It does not use semantic similarity, translations, aliases, or AI inference.
- Ranges use PDF page numbers, never printed textbook page numbers. A range extends only to the PDF page before the next uniquely detected topic or chapter boundary. Without a later boundary, only the heading page is proposed. Multiple detected topics may legitimately share a page/range.
- Chapter evidence helps explain unresolved topics but never supplies topic evidence. Admins must compare proposals with the signed original PDF, adjust ranges, and use manual mapping where the extraction does not expose reliable boundaries.
- Proposals are transient and are not persisted separately. Admin working state is retained in-browser per processed-source identity while switching sources and while approving pages; work from a changed identity is retained separately and never reused automatically.
- Accepted rows travel through an overloaded draft-mapping RPC that atomically checks source version, SHA-256, processing revision, and latest book version before delegating to the existing relationship/range validator. A shared book-identity advisory lock serializes this check with replacement creation. Manual mappings continue to use the original RPC when no suggestions are accepted.
- Offline regressions cover matching logic and static route/SQL/UI contracts. They do not prove PostgreSQL blocking behavior; actual concurrent replacement/save serialization must be verified against a disposable local database before deployment.

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
