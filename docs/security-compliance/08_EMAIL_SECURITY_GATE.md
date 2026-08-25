# 08 — Outbound Email Security Gate (before Skive 3D)

**Status:** No outbound mail transport exists. `Sagsvisning.jsx`'s
"Tilføj besked til sagen" writes an internal, in-app note only
(`sagBeskedSkriv` → `sensitive/sager/$sagId/beskeder`) — confirmed this
session by reading the deployed function and by the dialog's own on-screen
text: *"Der sendes ingen mail herfra. FleetControl har endnu ingen udgående
mailtransport."* This document is a requirements gate for the feature that
will change that, written before it is built.

**This document does not describe anything implemented.** Every requirement
below is a decision to enforce when Skive 3D starts.

## 0. Relationship to the existing (also unbuilt) inbound-mail design

Beslutning 20 in `BESLUTNINGER.md` already designed an **inbound** mail
matching scheme in detail — DMARC-aligned envelope-sender validation against
a sag's `parter[]`, a three-way outcome (`kendt` / `karantaene` / `afvist`),
subject-only sag-number extraction (never the body, since a body can quote
older threads with other sag numbers), and `audit.adgangNaegtet` on
rejection. Per `CLAUDE.md`'s "Kendte huller": **that design is fase 0 — only
the UI surface for viewing quarantine exists, no inbound transport is
built.** Skive 3D is the outbound side, a related but separate problem: who
is allowed to make FleetControl send a real email, to whom, and what gets
logged. The two should share infrastructure (sender identity, tenant
binding, audit shape) but are not the same gate.

## 1. Server-side transport only

- The provider call (SMTP relay, SendGrid, Postmark, Graph API, whatever is
  chosen) must happen **exclusively inside a Cloud Function**, called via the
  existing `kaldFunktion()` callable-function pattern every other mutation in
  this app uses (`sagplan.js` is the template: thin client wrapper, `try {}
  catch (fejl) {}`, never a direct write). No provider SDK, no provider
  credential, may ever ship in the client bundle.
- Concretely: grep the future implementation for the provider package name in
  `src/` — it must appear ONLY under `functions/`. This is mechanically
  testable the same way `test/functions-delt.test.mjs` already guards against
  drift between `src/` and `functions/delt/` — a similar test should assert
  the mail SDK/import never appears client-side.

## 2. No provider secret in the client

- Provider API key/secret must be a Cloud Functions environment
  variable/secret (Firebase Secret Manager or `functions.config()`
  equivalent for the current Functions v2 setup), never a `VITE_*` variable
  — `VITE_*` variables are bundled into the client and are public by
  construction (this is exactly why the client Firebase config's `apiKey` is
  safe to expose but a mail-provider key would not be: one identifies a
  project, the other authorizes sending mail as FleetControl).
- This session's read-only secrets sweep (doc 07) should be re-run
  specifically against the 3D implementation branch before merge, not just
  once at design time.

## 3. Tenant binding

- Every outbound send must be tied to a `tenantId` derived from
  `auth.token.tenant`, exactly like every existing Cloud Function in
  `functions/index.js` — never from a client-supplied tenant field. The sag
  (or opgave, or whatever the mail is about) must be re-fetched server-side
  and its tenant compared against the caller's token tenant before sending —
  the same "fetch and verify, don't trust client state" pattern `sagAfslut`
  and `sagBeskedSkriv` already use for `sagId`/`sag.tilstand`.

## 4. Permission gate

- Reuse or extend the existing `sag.skriv` + `sag.sensitiveLaes` bundle
  `sagBeskedSkriv` requires today — sending a real email is at least as
  privileged as writing an internal note, arguably more (it leaves the
  tenant boundary). Consider whether a **separate** permission
  (`sag.mailSend`, following the established `<domæne>.<handling>` naming
  convention in `permissions.js`) is warranted so a tenant can grant
  "internal notes" without granting "external send" — this mirrors the
  existing separation between `sag.skriv` and `sag.karantaeneFrigiv`/
  `sag.aftaleBekraeft` (three distinct permissions for three distinct sag
  actions, not one combined flag — a distinction this session's own bugfix
  had to re-learn was necessary).
- If a new permission is introduced, it needs a paired read permission per
  the `test/laeseadgang.test.mjs` discipline (a write permission without a
  matching read permission is a documented, tracked exception, not a
  default).

## 5. Recipient validation — the highest-risk item

- **The recipient address must be resolved server-side from the sag's own
  `parter[]`/`modpartEmail`, never accepted as a free client-supplied
  field on the send call.** This is the single most important control in
  this document: a compromised or careless client must not be able to
  redirect an outbound email to an arbitrary address by manipulating the
  callable's payload. The existing `sagOpret` already validates and stores
  `modpartEmail` server-side (`kortStreng(d.modpartEmail, 254)`); the send
  function should read the recipient from the stored sag data, not accept a
  `to:` field from the client at send time. If the UI needs to let a
  user pick among multiple known parties, the client sends a **reference**
  (which stored party) and the server resolves the actual address.
- Corollary: any UI that *does* need a free-text recipient (e.g. CC'ing a new
  address not yet on the sag) must first go through the same `parter[]`
  addition path `sagKarantaeneFrigiv`/`sagOpret` use — added as data, then
  referenced, never passed straight through to the send call in the same
  request.

## 6. Allow/deny policy

- Decide whether a domain/address allowlist or denylist is needed at launch
  (e.g. blocking sends to obviously-invalid or role-account-only domains),
  or whether recipient validation (Section 5) is considered sufficient on
  its own initially. Either way, this is a decision to write down, not to
  silently default.

## 7. Header injection

- Subject and any header-adjacent field (reply-to, display name) must be
  stripped of CR/LF and other header-injection sequences server-side before
  being handed to the mail provider SDK — this is the email-specific
  analogue of the path-injection concern already flagged for RTDB keys in
  doc 07. Use a dedicated sanitizer, not `kortStreng()` alone (which caps
  length but was not designed for header-safety).

## 8. Subject / body input validation

- Reuse `kortStreng()`-style length capping at minimum; decide an explicit
  max length for subject and body appropriate to email (RTDB's existing
  10,000-character cap on `sagBeskedSkriv`'s `tekst` field is a reasonable
  starting reference, not necessarily the right number for an email body).

## 9. HTML escaping / sanitization

- If the outbound mail body is ever rendered from user-authored rich text
  (not just the current plain internal notes), it must be sanitized against
  script/HTML injection before being placed in an HTML email body — the same
  category of risk as XSS, but the "victim" is the external recipient's mail
  client rather than FleetControl's own UI. If v1 of 3D is plain-text-only
  (recommended for the first cut), this requirement is moot until HTML
  bodies are introduced — but the decision should be explicit, not
  accidental.

## 10. Rate limiting

- No application-level rate limiting exists anywhere in this codebase today
  (confirmed in doc 07) — Cloud Functions/Cloud Run platform quotas are the
  only current backstop, and this session's own deploys hit that platform
  quota ("Write requests per minute" exceeded) as an incidental illustration
  that platform limits are real but coarse and not security-purposed.
  Outbound mail needs its own explicit per-tenant and per-user send-rate
  limit before launch — an uncapped send path is both an abuse vector
  (spam relay via a compromised account) and a cost/reputation risk
  (provider deliverability, domain blocklisting).

## 11. Idempotency / double-send protection

- This session found and fixed a real bug where `sagOpret` could be
  triggered twice by a retried request in a way that silently duplicated
  work before the fix (the ancestor-path crash actually *prevented*
  duplicate sag creation by failing loudly — but the general lesson holds:
  a send function must be idempotent against retries). Use a client-supplied
  idempotency key (or derive one from `sagId` + a monotonic sequence) so a
  network retry of a "send" call cannot cause two emails to go out for one
  user action. Do not rely on "the UI only lets you click once" — the same
  category of assumption already cost real DEV-verification time this
  session when a client-side click-state mismatch was mistaken for a
  reopened dialog.

## 12. Audit — attempted / accepted / failed

- Every send attempt must produce an audit entry via the existing
  `logSager()`/`AUDIT` pattern, server-side, regardless of outcome — not
  just successful sends. At minimum: attempted (who, when, sag, recipient
  reference — not full address if that's considered sensitive), accepted by
  provider, failed (with a non-sensitive failure reason), and later
  bounced/rejected if the provider reports it asynchronously (Section 14).
- **Correlation**: the audit entry (and any provider-side message ID) must
  be linkable back to the sag/order it was sent from — reuse the existing
  `objekt`/`objektId` shape `logSager` already writes, do not invent a
  parallel correlation ID scheme.
- **Sender identity/domain**: log which verified sending domain/address was
  used, since a future audit or RA-readiness question ("who could this have
  looked like it came from") depends on it.
- **Provider secrets**: never appear in an audit entry — this follows the
  same `LOGBARE_FELTER` allowlist discipline already enforced for every
  other audit call in this codebase (confirmed this session:
  `afslutningsAarsag`, a free-text field, is deliberately excluded from
  `sagAfslut`'s audit payload; the same discipline extends naturally to
  provider credentials and full email bodies).
- **Don't over-log**: do not copy the full mail body into the audit entry by
  default — an audit log that contains the sensitive content it's supposed
  to be tracking access to becomes itself a sensitive-data sprawl problem
  (mirrors the existing `sensitive/` vs `audit/` separation principle: the
  log records that an action happened, not a full copy of the content).

## 13. Bounce / failure handling

- Decide (before building) whether bounce/delivery-failure handling is
  in scope for 3D v1 or deferred. If deferred, the sag's UI must not claim
  or imply delivery success beyond "accepted by provider" — this is the
  same honesty requirement Skive 3C already enforced for internal notes
  ("never say sent when nothing was sent"); it applies with equal force to
  "never say delivered when only accepted-for-delivery is known."

## 14. Retries

- If the provider call fails transiently, decide the retry policy
  (immediate retry inside the function vs. a queued retry) and ensure it
  composes correctly with the idempotency key from Section 11 — a retry
  must not become a duplicate send.

## Attachments

**Explicitly out of scope for the first cut of 3D**, per the user's own
framing of this checkpoint, unless the existing product plan states
otherwise (not found in `CLAUDE.md`/`README.md`/`BESLUTNINGER.md` as a
requirement for 3D specifically — the file-storage gate, doc 09, is the
right place for attachment handling once it becomes relevant).

## BLOCKER BEFORE 3D

These are not optional hardening for later — they are preconditions for
introducing outbound mail at all, because their absence turns "FleetControl
sends email" into "FleetControl can be made to send email as whoever
attacks it":

1. **Recipient resolved server-side from the sag's stored `parter[]`, never
   from a client-supplied address at send time** (Section 5). This is the
   single highest-severity requirement in this document.
2. **Provider secret lives only in Cloud Functions config/secret manager,
   never in a `VITE_*` client variable** (Section 2).
3. **Permission gate enforced server-side** on the send callable, following
   the existing `perms.includes(...)` pattern — not just a UI button hidden
   by role (Section 4).
4. **Tenant re-verified server-side** against the sag being sent from,
   not trusted from client input (Section 3).
5. **Audit entry written server-side for every attempt**, success or
   failure (Section 12) — matching the standard this codebase already holds
   every other sag mutation to.
6. **Header injection sanitization** on subject/reply-to (Section 7) —
   cheap to build, catastrophic to skip (a classic, well-understood
   vulnerability class).
7. **Idempotency key on the send callable** (Section 11) — prevents a retry
   from becoming a duplicate external communication, which is a much worse
   failure mode for email than for an internal note.

These seven feed Gate A in `12_FINDINGS_AND_REMEDIATION_PLAN.md` directly.
Everything else in this document (rate limiting, allow/deny policy, bounce
handling, HTML sanitization) is real and should be decided, but is not
individually a reason 3D cannot start — they should be resolved during
3D's implementation, not necessarily before its first line of code.
