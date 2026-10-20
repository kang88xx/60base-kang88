# Design

## Source of truth
Active · 2026-10-20. The restored Figma board `137:2484` in file `mqLzAb8888THEKjqH3eA7G` is authoritative. All 64 frame nodes were retrieved through high-fidelity design context and read-only layer extraction. Node `93:1820` and previous screenshots are historical evidence only. Actual text, image fills, bounds, type, spacing and fixed action/navigation regions are recorded in `../../output/ego-figma-audit-20261020`. Source coordinates include a 40px system status area; web comparisons subtract 40px and native uses the real safe-area inset.

## Brand
Warm, approachable, precise. Purple 3D mascot and the supplied original ego wordmark. White, peach and lavender surfaces; no heavy blue gradients. Installed app icon alternatives remain unselected.

## Product goals
Apply the approved design to the functioning participant web/iOS app. Preserve authenticated service access, direct filming/import-to-consent, authoritative rewards and account boundaries. Design sample balances and submitted videos are never production fixtures.

## Personas and jobs
Korean participants record everyday hand activities, submit with consent, check review outcomes and rewards. Owner and teammates validate the beta on physical iPhones through TestFlight.

## Information architecture
Home, filming activities, rewards and profile. Activity → three guide steps → camera/import → explicit submission consent → upload/review. Education is supplementary. Existing support, legal, account deletion, referral and coupon states stay available. The board's 64 items include modal/error states, not 64 independent routes.

## Design principles
Clear primary actions, truthful real data, compact repeated rows, unobscured scroll content, no imitation system status bars. Keep current provider availability and error recovery.

## Visual language
Primary #5B59F2; warm #FFF4E6; peach #FEE1C4; lavender #EEF0FF; ink #29282D; muted #666779; divider #E9E9F1. Pretendard; welcome 32/40px, title 28/36px at weight600, hero card heading20/28px, body15/23px, caption12/18px. Content inset20px. Card radius24px; action18px; field12px. Reuse local real activity photos and original purple mascot, with reduced-motion fallback.

## Components
Existing renderers, buttons, dialogs, fields, category filters and four navigation links. `app/ego-alan-theme.css` owns shared tokens and screen presentation; `app/ego-alan-forms.css` owns scoped modal presentation. Reuse existing handlers and icon assets.

## Accessibility
Visible focus, descriptive labels, real buttons, min44px controls, text reflow, reduced motion, semantic status/error announcements. Do not hide mandatory consents or error text to match a screenshot.

## Responsive behavior
390×844 reference with320/430px and landscape checks. Real safe-area insets. Scroll long forms and reserve footer space. Full-width landscape camera with centered zoom/timer and shutter over preview.

## Interaction states
Keep loading, empty, invalid, submitting, disabled, retry, offline, account change and successful outcomes distinct. Coupon verification remains explicitly a local test adapter, without SMS or actual issue/debit.

## Content voice
Short, friendly Korean; final approval is required for points. Preserve current 60-second capture and60–90-second whole-file upload policy.

## Implementation constraints
Plain JavaScript/CSS within Capacitor. Reconcile October17 service fixes with deployed October19 mascot motion. No dependencies added. Selectively mirror to native overlays; never overwrite native provider/camera bridges. Verify web build, runtime regressions, responsive screenshots, native bundle and archive before claiming distribution.

## Open questions
- [x] Restored source located and all64 high-fidelity contexts captured; actual node137:2484 supersedes the archive.
- [ ] Physical-device beta results; cannot be replaced by browser or simulator checks.

## Implementation and verification plan
1. Preserve current service behavior and run access/direct-submission regressions before redesign.
2. Apply common tokens, original assets and responsive layouts across existing screen/modal renderers.
3. Compare reference screenshots and exercise filters, guides, forms, retries and account states.
4. Selectively sync native appearance, build1.1.5, and retain exact upload/processing receipts if available.

## Previous functional verification · before restored-node audit
- Production web build and all 5 static checks passed. All 121 precached resources exist in dist.
- Browser flow/layout checks: 80/80 across 320/390/430px and landscape; no uncaught errors or local HTTP failures.
- Real camera controller with synthetic Chromium media: 16/16 ready/recording and simulated safe-area cases; no video submitted.
- Direct submission, account access, data-state distinctions, route aliases, MOV/M4V normalization, education, coupon test adapter and deletion receipt checks passed.
- Final reviewer approved focused fixes with no remaining finding. Native signing/distribution and physical iPhone validation are separately recorded in the private release repository.
- Coupon exchange remains an explicit test adapter; no real SMS, coupon fulfillment or point debit is introduced.


## Restored-node repair plan · 2026-10-20
1. Compare all64 node properties and runtime state mappings; retain actual context/screenshots and reference assets.
2. Correct shared geometry and missing standalone surfaces: first filming, ranking, ledger, referral states, notice detail and support history; separate training and submission steps.
3. Verify source-anchored DOM geometry, responsive layouts, actual guards and browser interaction, followed by selective native integration.
4. Publish only after focused checks pass; record exact deployed source and distribution receipts separately.

## Explicit product adaptations
- Dynamic balances, activity catalogue, review outcomes and legal text come from the service, not example Figma values.
- Current direct recording/import to explicit consent is preserved; obsolete save-first wording is updated to the actual flow.
- Apple sign-in remains available when configured. Real device permission prompts, safe areas and keyboards replace design system chrome.
- Coupon phone/fulfilment remains a clearly identified test adapter without SMS, debit or coupon issuance.
- Welcome source layer is a video fill omitted by Figma screenshot rendering; the existing transparent character motion implements it, with reduced-motion fallback.

## Restored-node verification receipt · 2026-10-20
- All 64 source frames have high-fidelity Figma context and mapped runtime evidence. Named geometry/type/component anchors pass; no known failures remain in those measured checks. This is bounded coverage, not full pixel parity for every descendant.
- Browser interaction/responsive matrix: 100/100 checks; separate actual API catalogue/reward/navigation checks cover 39 route layouts with no uncaught JavaScript or unexpected external requests.
- Camera controller: 16/16 landscape checks. MOV/MP4/WebM original upload, consent, byte-range serving, spoof rejection and retry regressions pass.
- Production build and all five static checks pass. Tests and the pinned, read-only 64-frame fixture are documented in `tests/FIGMA-AUDIT.md`.
- Physical iPhone camera, operating-system prompts, keyboard behavior and TestFlight installation remain separate device checks. Deployment and signing receipts are recorded after distribution.
- Actual user entry now covers upload selection/consent/transfer/validation/error/receipt and review/deletion/reconsideration screens. Uploaded and rejected originals pass real isolated API/SQL resubmission: two submit requests, zero new uploads, unchanged file/hash and incremented revisions.
- Education stages 19–21 and submission/review stages 27–32/35–39 were rechecked after replacing remaining legacy dialog/layout presentation. Five unchecked consents still block submission, and a failed receipt retry reuses the completed original.
