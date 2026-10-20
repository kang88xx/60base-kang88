# Design

## Source of truth
Active · 2026-10-20. User selected the EGO Alan-inspired 64-state board in file `mqLzAb8888THEKjqH3eA7G`, screenshot supplied in this session. Board `93:1820` is no longer returned by the connector; the surviving welcome `106:5518` and component library `89:2125` were read through design context. The archived final screenshots, source descriptions and refinement receipts in `../../output/ego-alan-redesign-20261019` retain the requested purple character, layout and later corrections. Do not use the surviving blue-character duplicate to override the user's purple reference.

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
Primary #5B59F2; warm #FFF4E6; peach #FEE1C4; lavender #EEF0FF; ink #29282D; muted #666779; divider #E9E9F1. Pretendard; hero 32/40px, title 28/36px, body15/23px, caption12/18px. Content inset20px. Card radius24px; action18px; field12px. Reuse local real activity photos and original purple mascot, with reduced-motion fallback.

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
- [ ] Latest live location of the64-screen Figma board; local final archive used unless user supplies newer changes.
- [ ] Physical-device beta results; cannot be replaced by browser or simulator checks.

## Implementation and verification plan
1. Preserve current service behavior and run access/direct-submission regressions before redesign.
2. Apply common tokens, original assets and responsive layouts across existing screen/modal renderers.
3. Compare reference screenshots and exercise filters, guides, forms, retries and account states.
4. Selectively sync native appearance, build1.1.5, and retain exact upload/processing receipts if available.

## Verification receipt · 2026-10-20
- Production web build and all 5 static checks passed. All 121 precached resources exist in dist.
- Browser flow/layout checks: 80/80 across 320/390/430px and landscape; no uncaught errors or local HTTP failures.
- Real camera controller with synthetic Chromium media: 16/16 ready/recording and simulated safe-area cases; no video submitted.
- Direct submission, account access, data-state distinctions, route aliases, MOV/M4V normalization, education, coupon test adapter and deletion receipt checks passed.
- Final reviewer approved focused fixes with no remaining finding. Native signing/distribution and physical iPhone validation are separately recorded in the private release repository.
- Coupon exchange remains an explicit test adapter; no real SMS, coupon fulfillment or point debit is introduced.
