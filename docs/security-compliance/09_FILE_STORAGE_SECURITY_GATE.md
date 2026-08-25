# 09 — File Storage Security Gate (before 4C / document storage)

**Status:** No file storage exists. This document is a requirements baseline for a
feature that has not been built, written before it is built, per the checkpoint's
explicit scope. Nothing here is implemented; nothing here should be read as a
progress report.

**Classification of this whole document: NOT BUILT.** Every requirement below is
a decision to make and enforce when 4C (or whichever skive introduces document
storage) starts — not a description of current behavior.

## 0. What triggered this section

`ARKITEKTUR.md`/`CLAUDE.md` describe a Storage region check as part of the
already-closed "Låst rækkefølge" point 2 ("DEV og PROD som to Firebase-projekter
… Storage-regionen verificeret 7. august 2026"). That is a **region reservation**,
not a storage feature — no bucket is actively used by the application today (no
`firebase/storage` import in `src/`, no Storage rules file in the repo, no upload
UI). Treat the region check as evidence that *if* Storage is enabled, it will
default to the correct region — nothing more.

## 1. Tenant isolation

- **Object paths must carry the tenant ID as a real path segment**, the same
  pattern RTDB already uses (`tenants/$tenantId/...`) — e.g.
  `tenants/$tenantId/sager/$sagId/dokumenter/$fileId`. Storage Security Rules
  (a separate rules language from RTDB rules) must independently enforce
  `request.auth.token.tenant == tenantId` at the object-path level, mirroring
  `firebase.rules.json`'s per-node tenant gate. **A Storage bucket is a single
  flat namespace by default — nothing stops a client from requesting
  `tenants/other-tenant/...` unless the rule explicitly checks it on every
  read/write.**
- Do not rely on "the client only shows its own tenant's files" as an isolation
  control — that is a UI convenience, not a security boundary (the same
  principle CLAUDE.md states repeatedly for RTDB: a control that lives only in
  the frontend is not access control).
- Decide before building: is the bucket single-region multi-tenant (current
  RTDB pattern), or does classification (Section 4 below) require a separate,
  more restricted bucket/prefix for sensitive documents?

## 2. Upload permission

- Upload must go through a **Cloud Function issuing a signed upload URL** (or
  an equivalent server-mediated path), gated on the same `perms.includes(...)`
  pattern the Cloud Functions in `functions/index.js` already use — never a
  bare client-side `uploadBytes()` against an open bucket path.
- The Cloud Function must independently verify **which sag/opgave/objekt** the
  upload is being attached to, and that the object belongs to the caller's
  tenant — the same "fetch and verify" pattern `sagAfslut`/`sagBeskedSkriv`
  use for `sagId` today (verified this session: both re-fetch the sag from the
  DB and check `sag.tilstand`/tenant before allowing a write, rather than
  trusting client-asserted state).
- Decide the permission model up front: is document upload gated on the same
  `sag.skriv` bundle sag messages use, or does it need its own
  `sag.dokumentSkriv`-style permission? Given `test/laeseadgang.test.mjs`'s
  existing rule ("a write permission needs a matching read permission, or an
  explicit documented exception" — CLAUDE.md, beslutning 104), any new
  `*.dokumentSkriv` permission needs a paired `*.dokumentLaes` from day one.

## 3. Download permission

- Same server-mediated pattern: short-lived signed download URLs issued by a
  Cloud Function that re-checks tenant + permission at issuance time, not a
  permanently-public or permanently-authenticated-any-user object URL.
- **Signed URL leakage**: a signed URL is a bearer credential — anyone who has
  the link can download until it expires, regardless of their own permissions.
  Decide the TTL policy (minutes, not days) and whether download links are
  logged (who requested a link to which document, not just who downloaded).

## 4. Sensitive / classified documents

- FleetControl already has a `sensitive/` node-family convention (a sibling
  node with its own stricter read permission, e.g. `sensitive/sager`,
  `sensitive/indberetninger`) and a documented (though currently unwired —
  see doc 04) `securityLevel` enum (`normal`/`internal`/`confidential`/
  `restricted`) on `sager`. Before building document storage, decide: do
  uploaded documents inherit their parent sag's classification, or do they
  need their own per-document classification? If a sag is `normal` but a
  single attached document is a driver's medical certificate, per-document
  classification is very likely required — do not assume parent classification
  is sufficient without an explicit decision.
- If per-document classification is chosen, the **object path or metadata
  must encode it in a way Storage Rules can evaluate without a database
  round-trip** (Storage Rules cannot query RTDB directly in most setups) —
  this is a real design constraint, not a detail to defer.

## 5. MIME / type validation

- Server-side MIME validation is required — a client-declared `Content-Type`
  header is not trustworthy. Decide an explicit allowlist (e.g. PDF, JPEG,
  PNG) rather than a denylist.
- Do not trust file extension alone; validate actual file signature/magic
  bytes server-side if malware scanning (Section 6) doesn't already cover
  this.

## 6. File size limits

- Both a per-file limit and a per-sag/per-tenant aggregate limit should be
  decided before launch — an unlimited upload path is a cost and availability
  risk (a single tenant filling the bucket), independent of any confidentiality
  concern.

## 7. Malware scanning

- **Not built, and no existing pattern in this codebase to extend** — this is
  a new capability (e.g. Cloud Storage + a virus-scanning extension, or a
  scanning step before an uploaded object is marked "available" to other
  users). Decide whether unscanned uploads are held in a quarantine prefix
  until scanned, mirroring the `sager.karantaene` UI pattern already built for
  inbound mail matching (beslutning 20) — the product already has a "hold
  until verified, never render as normal content" pattern; document storage
  should reuse that shape rather than invent a new one.

## 8. Immutable / hash evidence

- If documents will ever be referenced as evidence in an audit trail (RA
  readiness, doc 15), consider recording a content hash (SHA-256) in the
  audit log at upload time — the same `LOGBARE_FELTER` allowlist discipline
  used elsewhere (log the hash and metadata, never the file content itself in
  the audit entry).

## 9. Filename handling

- Uploaded filenames are free text from a potentially untrusted source
  (attachment names in a future inbound-mail flow, or direct upload) — do not
  use the raw filename as a storage path segment or display it unescaped.
  Generate an internal ID (the same `push()`-key pattern used everywhere else
  in this codebase) and store the original filename only as a metadata field.

## 10. Retention, deletion, legal hold

- Must plug into the *existing* retention/legal-hold model (see doc 06)
  rather than build a second one. `retentionErAfgjort()` / legal-hold
  functions already distinguish "technically deletable" from "legally
  cleared to delete" for RTDB data — a document store needs the same
  distinction, and ideally the same functions/flags, not a parallel system.
- Document deletion must be soft/status-based by default, matching the
  explicit prohibition elsewhere in this codebase against building a
  `slet()`/hard-delete path for anything accounting- or audit-adjacent
  (CLAUDE.md: "Der skal heller ikke findes en vej til det i klienten").

## 11. Backup

- See doc 06 — no backup mechanism is currently verified for RTDB either.
  Cloud Storage has different native versioning/backup characteristics than
  RTDB; this needs its own explicit decision, not an assumption that "Storage
  is safer by default."

## 12. Audit of upload / download / delete

- Every upload, download-link issuance, and deletion must go through the
  existing `logXxx()` / `AUDIT` pattern in `functions/index.js` — an
  admin-SDK-only, append-only write, not a client-triggered log call. This
  session's audit trail check (doc 05) found that server-side mutation
  logging is reliably enforced when it goes through a Cloud Function; that
  discipline must extend to storage operations from day one rather than be
  retrofitted.

## 13. Region / data residency

- Confirm at build time that the Storage bucket is provisioned in the same
  region as the RTDB instances (`europe-west1`, per the existing region
  verification) for both DEV and PROD projects. Do not assume the default
  bucket region matches — Firebase Storage buckets are provisioned
  independently and can silently default to a US region if not set
  explicitly.

## What must be decided BEFORE 4C / document storage

This list feeds Gate B in `12_FINDINGS_AND_REMEDIATION_PLAN.md`:

1. Object path scheme with mandatory tenant segment + Storage Rules that
   enforce it server-side (not just RTDB rules).
2. Upload/download permission model — reuse `sag.skriv`-style bundles or
   introduce paired `*.dokumentSkriv`/`*.dokumentLaes` permissions.
3. Classification model for documents (inherit from parent sag, or
   per-document) and how Storage Rules evaluate it without an RTDB round-trip.
4. MIME allowlist and file size limits (per-file and per-tenant).
5. Malware-scanning / quarantine strategy, reusing the existing
   `karantaene` UI pattern rather than inventing a new one.
6. Filename handling (internal ID + metadata, never raw filename as path).
7. Retention/legal-hold integration with the existing `retention-regler.js`
   system, not a parallel one.
8. Audit coverage for upload/download-link-issuance/delete, server-side only.
9. Explicit bucket region confirmation for DEV and PROD.

None of this is built. None of it should be inferred as "mostly ready because
the RTDB patterns exist" — the patterns are a good template, not a
substitute for building and testing the Storage-specific rules layer.
