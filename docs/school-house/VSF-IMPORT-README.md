# VSF Course Import

The six Google Docs requested by the company were read and exported on November 1, 2026. `VSF-SOURCE-INDEX.json` preserves their exact titles, URLs, IDs and source modification dates. The original PDFs and extracted text are under `private/school/vsf/`. They are originals, not reconstructed PDFs.

## Published Learning Path

`school-vsf-dispatch-pathway` is Dispatch-only (`department-1`), required for new department members, and excluded from cross-training discovery. Its three units stay in one course so `requiresPrevious` enforces the requested progression. It has nine reading lessons, three knowledge-check lessons (10, 6 and 9 source-matched questions), and one manually graded scenario lesson.

The five scenario criteria come from the original Unit 3 rubric: Professionalism, Authority, Empathy, Knowledge of Rules & Procedures, and Customer Service. Each is worth five points. Submitted text requires instructor grading; it must not produce an automatic passing grade. The course certificate is internal company training, not a state license or approved TDLR continuing-education credit.

The initial 80% passing score and three-attempt limit are implementation defaults, editable by authorized course makers. They are not represented as a policy the company previously adopted. The original Unit 3 multiple-choice score table treats 75% as passing and 68.75% as failing; that original table remains in the source document.

## Original Exams and Review

The complete original exams remain three Draft courses, with 53, 33 and 16 multiple-choice questions respectively. They carry `reviewRequired` flags. Original answer keys are preserved in instructor-only question metadata, not trusted as current production scoring. Unit 1 explicitly calls its key Outdated and omits question 53; there are other visible question/key mismatches. Unit 2 questions 1 and 21 also have mismatched keys. Full findings and authoritative reference URLs are in `VSF-SOURCE-REVIEW.json`.

The published pathway uses selected source-matched terms, systems, evidence and customer-care topics. It does not silently teach every regulatory statement in the older material as current law. The original PDF assets are instructor-only through the authenticated School House source endpoint. Course makers can correct the original draft content and publish through the course editor.

## Integrity and Dependencies

`lib/school/private/vsf-courses.ts` exports `vsfCourses`. `lib/school/private/vsf-source-assets.ts` exports `vsfSourceAssets`; every original PDF is marked `instructorOnly: true`. Do not import either server-only answer-key/source module into a client component. The PDFs total approximately 7.5 MB; verify the compressed Worker build size or migrate these seeded files to protected R2 storage if the host limit is exceeded.

The PDF files were opened successfully: Exam 1 has 10 pages; Exam 2, 6; Exam 3, 8; Study Guide 1, 15; Study Guide 2, 11; Study Guide 3, 21. Question IDs and answer indices were validated. No source Google Doc was modified.
