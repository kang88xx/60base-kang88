# Selected home, loading and intro motion review — 2026-09-17

- User selection: home 3 (`home-c.png`), intro 2 (`intro-b.png`), loading 1 (`loading-a.png`). Original concepts remain in `../design_previews/app-concepts-20260917/`. Intro production motion awaits selection among the three interactive demos.
- Combined source/render evidence: `../.omx/reviews/app-responsiveness-20260917/visual/home-comparison.png` and `loading-comparison.png`. Reference 853×1844 normalized to390×844; actual390 CSS px at density1. Full views show hierarchy, spacing and all controls without cropping.
- Home: navy canvas, large rounded actual-footage image, left-aligned two-line Korean title, approval-only catalog points, lime capture CTA and four tabs. 320/390/1440 widths have no horizontal overflow; photo and capture button target the same real activity. Original owned footage replaces generated reference imagery. The exact existing brand/icons remain authoritative.
- Loading: original orange geometry progressively reveals counterclockwise from12 o'clock through the left side to its approximately5 o'clock endpoint (216°), resets and repeats in1.9s. Main screen uses a176px image box; source SVG padding gives a100px visible mark. Named waiting copy replaces a fake progress percentage/bar. Private pages retain route navigation and browse access, so this is an in-context adaptation of the full-screen concept. Reduced motion displays the whole static symbol. Ready content is never delayed for animation.
- Responsive feedback: small nonblocking waiting status for background actions; avoid duplicate status when the main loading view already explains the wait. Recording hides this layer and retains the full camera viewport.
- Intro motion review: selected intro2's navy, left logo, rounded imagery and two-line lower-left typography; three real CSS motions, pause/replay/reduced controls and independent offscreen/hidden/user pause. Owned stills replace generated concept images. Browser captures: `../.omx/reviews/app-intro-motion-20260917/intro-layout-{320,390,1440}-qa.png`; final verification report and offline HTML pair are retained there / in the design preview folder.
- Iterations: removed duplicated waiting text, enlarged the initial small loading mark, matched preview mark size to production, corrected manual pause preservation across visibility/offscreen transitions. Reference/render review has no remaining blocking visual findings in this scope.
- Interaction evidence: responsiveness6 (including fresh explicit refresh and failure retry), account9, app filming/submission9, Studio account12, points submission/receipt, worker cache/update, syntax/assets/build. Synthetic account/API/camera fixtures are isolated. User confirmed Google signup on their device; automated checks do not claim a fresh real Google authentication or physical-device timing measurement.

final result: passed. Production85 asset hashes,64 route/viewport checks and offline app checks passed with0 application page errors; deployment dpl_DjMLKjLkwfXzhBg8wz1XJsT6Xy7C.

---

# App web-feature parity — design QA · 2026-09-17

- Source visual truth: today's Numo source screenshots and the accepted app comparison boards in `../.omx/reviews/app-numo-20260917/comparisons/`. This iteration extends that approved design with functional web parity.
- Browser-rendered evidence: `../.omx/reviews/app-web-parity-20260917/visual/phone-390-education.png`, `phone-390-estimate.png`, `phone-390-settings.png`, `flow-tests/device-settings-photo-390.png`. Browser CSS width/pixel width are1:1 at density1. Checked320×740,390×844 and844×390; no new fidelity clone is claimed for screens absent from the source.
- Fonts/typography: existing Inter Tight/Pretendard, readable compact Korean text, preserved secondary type hierarchy; no clipped labels at inspected sizes.
- Spacing/layout: same rounded app panels and four-tab navigation; scroll clipping and last actionable row reachability pass. Full-view screenshots suffice for these functional additions; previous combined source boards remain reference. Photo/settings form scrolls within the existing dialog.
- Colors/tokens: established app navy/blue/cyan/lime and neutral form surfaces retained. No camera picture/overlay layout change.
- Asset quality: original household images, six original sample videos, brand and official existing icons. Profile-photo test uses isolated fixture PNG and actual browser crop/preview.
- Copy: participant instructions only, browser-only preferences distinct from real account identity, approval-only calculator separated from real points. No prompt/internal/debug text retained.
- Interactions: activity saving/filtering, sample choice/playback, quiz/explicit completion/checklist/reset, estimate inputs, local settings/photo, private gates, review search/status/file submission and support tested.
- Console: final passing flow suite has no unexpected browser errors. Checkbox focus error caught during testing was corrected; deliberate API failures/offline cases retain expected notices.
- Findings: no actionable P0/P1/P2. Full independent result: `../.omx/reviews/app-web-parity-20260917/visual/VISUAL-QA.md`.18 screenshots,0 blocking findings. Physical devices/real OAuth remain outside automated verification.

- Live follow-up:70 published asset hashes,64 route/viewport combinations, signup entry and offline education passed with0 page errors. `../.omx/reviews/app-web-parity-20260917/live/live-verification.json`.

final result: passed

---

# Installable 60BASE app — design QA · 2026-09-17

- Source visual truth: `../competitors/numo/2026-09-17/originals/IMG_1088.PNG`, `IMG_1072.PNG`, `IMG_1083.PNG`; today's Numo screenshots adapted to our own product, brand and footage.
- Implementation: `../.omx/reviews/app-numo-20260917/qa-corrected/phone-390-missions.png`, `phone-390-settings.png`, and `comparisons/{home,guide-dishwashing-1,settings}-after.png`.
- Dimensions: source 1206×2622 normalized to390 CSS px width; implementation390×844 CSS px at device scale1. Responsive checks also320,430,844 landscape and1280 desktop. Combined source/rendered boards show full views; separate focused crops were unnecessary because the full-width boards keep text and controls legible.
- State: public home/activity/guide/settings and guest gates; authenticated library/review/points and camera covered with an isolated test account, real local operations server and Chromium camera fixture.
- Typography: bundled Inter Tight/Pretendard preserve our actual brand. Raised settings titles16px, secondary12.5px and task metadata12px after the initial comparison. Korean line breaks and controls remain readable at320px.
- Layout: blue home with actual-footage cards, three guide steps, four bottom tabs, grouped settings rows. Scroll clipping, final-row reachability and hit testing pass; main ends before the navigation. Denser home composition than the source is an accepted adaptation.
- Color: reference blue/cyan/lime hierarchy is adapted in app-owned tokens, with neutral detail/settings surfaces and restrained status colors.
- Assets: original 60BASE geometry, six actual household examples and licensed official Phosphor icons. No competitor private data or branding copied.
- Copy: catalog-authoritative approval-only points, Korea declaration, explicit consent and local storage/submit distinction. No cash conversion, automatic upload, equipment or referral promise.
- History: initial small secondary text corrected and screenshots recaptured. Initial overlap report was a measurement false positive; clip-aware recheck found no covered controls. All earlier/after evidence remains in the linked report.
- Primary interactions: tabs, search, keyboard category/filter selection, guide1→2→3, install instruction, guest capture gate; isolated member camera→save→five consents→one submission, real balance/status and expired-session cleanup.
- Console: no unexpected application page errors in the passing browser suite. Deliberately simulated catalog503, session401 and offline failures are expected and exercised.
- Full report: `../.omx/reviews/app-numo-20260917/design-qa.md`; no actionable P0/P1/P2 findings. Physical device camera and actual Google OAuth remain outside automated coverage.

- Production follow-up: `https://60base.kr/app/`, 66 asset hashes and52 route/viewport combinations passed; zero application page errors. Evidence: `../.omx/reviews/app-numo-20260917/live/live-verification.json`, `live/home-390.png`, `live/settings-390.png`.

final result: passed

---

# Korean points Studio adaptation — design QA

- Scope: user-requested content/flow adaptation from Numo captures into the existing 60BASE web Studio and admin. This is not a pixel clone or native-app rebuild.
- Source visual truth: ../competitors/numo/2026-09-17/originals/IMG_1072.PNG, IMG_1079.PNG, IMG_1084.PNG and the full source inventory/review in analysis/SOURCE-REVIEW.md.
- Implementation: current source rendered by local browser fixtures with production CSS; guest filming and synthetic authenticated points/admin states. No mock amounts entered production.
- Viewports: 390px mobile and 1440px desktop for visual checks; integrated route tests additionally cover320/768px.
- Source PNGs:1206×2622. Comparison copies normalized to390px width (~848px height); implementation density1, mobile width390. Online fixture viewport390×960, wallet full-page390×1350; guide full-page390×3691; desktop wallet1440×960.

## Combined comparison evidence

All paths below are under ../.omx/reviews/numo-korea-points-20260917/.

- visual-comparisons/receipt-comparison.png: Numo completed-upload/approval-pending screen on left, our successful submission receipt on right. Modal vs full-screen, brand colors and no bonus/gear promise are intentional. Right-side5000P is a synthetic stale-catalog regression, not the default reward.
- visual-comparisons/history-comparison.png: source status-filter/card region only (private profile/referral data excluded), our filtered rejected submission card. A select plus counts/search replaces source chips to preserve the existing responsive web design. Source is pending, implementation rejected to make reason/retry state visible; comparison concerns grouping and state legibility, not identical data.
- visual-comparisons/guide-comparison.png: source step1 wizard and our visible three-step training section. Existing quizzes and local progress remain; a separate native wizard/device frame is intentionally not added.
- Online full views: online-ui/synthetic-points-wallet-390.png, synthetic-points-wallet-1440.png, synthetic-filtered-history-390.png, synthetic-submission-receipt-390.png (and corresponding1440 files).
- Filming full views: filming-ui/390-home.png,390-missions.png,390-guide.png and1440 counterparts.
- Admin: admin-ui/payouts-390.png,payouts-1440.png,review-390.png,review-1440.png,tasks-390.png,tasks-1440.png. Historical payout amount in fixture remains KRW and is explicitly read-only.

## Required surfaces

1. Fonts/typography: existing Inter Tight/Pretendard retained. P amounts have clear hierarchy; Korean text wraps within mobile containers. No competitor typography/brand was imported.
2. Spacing/layout: mobile stacks cleanly; desktop points panels use existing content width. Guide remains an ordered reading flow with existing examples and quizzes. Focused module and full-route tests find no overflow at320/390/768/1440.
3. Colors/tokens: existing neutral surfaces, black text and #FF5D17 functional accents retained. Source blue/neon palette intentionally omitted. Disabled bank fields use consistent neutral fill and native disabled state.
4. Images/assets: six existing actual filming examples, original logos/fonts remain unchanged. No Numo illustration, user photo, leaderboard values, referral codes or private account data enters production.
5. Copy/content: Korea-created filming, self-declared region, approval-only points, separate pending estimates, authoritative saved reward in receipt, and exact '국내 은행 연동 예정' are present. No cash equivalent, launch date, free equipment, cashback, automatic gallery upload or privacy-filter claim.

## Iteration history

- Initial points render: disabled holder/account fields were white while the disabled bank select was neutral. Fixed scoped disabled-input specificity and recaptured; final wallet390/1440 images show consistent disabled fill.
- Initial full-page guide capture left a sticky header mid-document because the test had scrolled to the FAQ. This was a capture artifact, not a product defect. Recaptured after scrolling top and two frames; final guide images show correct header placement.
- Code review found a stale-catalog receipt amount. Server now returns its saved video/task snapshot, UI uses it, and changed-catalog regression confirms5000P is displayed instead of stale3000P. Missing details show no invented amount and do not replay completed submission.

## Interaction and accessibility verification

- Native disabled bank/holder/account/payout/order controls generate no corresponding API request; server independently rejects financial mutations.
- Filters/counts, real byte progress, staged validation/submission, successful receipt, same-original submit retry and required Korea confirmation pass focused browser checks.
- Reward estimator, category counts, all8 activities, quiz/preflight/storage preservation, reduced motion and keyboard focus pass targeted tests.
- Existing auth/CSRF/private access, actual file playback, annotation/approval and21 Studio/admin routes pass integrated browser tests.
- No application console errors in focused tests. Source screenshot inspection alone is not a claim of competitor accessibility compliance.

## Findings and result

No remaining actionable P0/P1/P2 findings within the requested adaptation. Bank fields and raw endpoint behavior are explicitly disabled; pending points are never credited balances. Real company finance remains KRW.

final result: passed


# Selected app intro motion 1 — 2026-09-17

Reference/render comparison: ../.omx/reviews/app-launch-selected-20260917/tests/intro-comparison.png, both at390px CSS width. Selected intro2 navy/photo layout uses motion1 soft slide and center growth; production substitutes original filming frames, brand assets and licensed fonts for concept artwork. The loading footer retains the orange radial reveal and visible Continue action. 320/390/844 views, reduced motion, hidden-page pause, keyboard inert/focus restore and filming exclusion passed. The sole keyboard finding (global skip link behind intro) was fixed and regression verified. No runtime visual-verdict skill is installed; direct visual review and JSON evidence are saved. Final result: passed.


# Administrator staged review and points sorting — 2026-09-17

User source: ../.omx/reviews/admin-review-20260917/member-list-source.png. Existing neutral administrator style is preserved. Member desktop table adds authoritative held points and ascending/descending header controls; mobile uses the existing labelled card rows plus visible44px sort buttons. Images: ../.omx/reviews/admin-review-ui-20260917/tests/admin-members-points-desc-{390,1440}.png. Manual-review desktop and each stage at390/1440 show original video, current stage, ordered approvals, checklist, action and history without horizontal overflow.

Direct screenshot review found completed-state pending-points copy and hidden mobile sort headers. Both were fixed and tested through the actual buttons. Review also found legacy approval could imply three historical gates; current-revision approval records now govern those ticks, and legacy records get their own summary. The final focused UI suite passes4groups including legacy and mobile controls; independent source review APPROVE with zero open findings. No runtime visual-verdict skill is installed; direct review evidence is recorded in ../.omx/state/admin-review-20260917/ralph-progress.json. Final result: passed.

---

# Selected lowercase ego lockup — 2026-10-11

- Scope: selected concept 2 applied to the existing app home header and launch lockup. The owner-provided transparent symbol remains authoritative; generated character variations and the mock presentation canvas are not replacement assets.
- Source visual truth: `C:/Users/kslee/.codex/generated_images/01a12563-7332-7a70-b866-82b144340a5a/exec-4073af94-6a2b-4be9-8c85-e5216ecb4636.png` (2172×724 presentation image).
- Rendered implementation: `.artifacts/ego-lowercase/web-mobile-390.jpg`, `ios-mobile-390.jpg` (390×844), and focused `web-header-390.jpg`, `ios-header-390.jpg` (390×68). Browser viewport is 390×844 CSS px in the existing preview iframe, scale 1. Additional 375×812 check has no horizontal overflow or overlapping header controls. These are Windows Chrome browser renders, not physical iOS captures.
- State: navy home header, signed-out local app with expected disconnected catalog notice. The mock's P/0 belongs to a signed-in state; the existing right-side login/points behavior was preserved. Component typography was compared without treating the wide presentation strip as a literal 390px app viewport.
- Combined evidence: source image, final focused web header and full iOS app screenshot were opened together in one comparison tool input. A second read-only reviewer compared the same source/header pair and found no remaining actionable visual mismatch.

## Required surfaces

- Typography: local Satoshi Variable 600 at30px, line-height1 and tracking-.015em reproduces the lowercase, rounded geometric direction. Browser confirms the actual font loaded; the body font and service-name metadata remain unchanged.
- Spacing: 8px flex gap and a34×36px full-contain symbol box. Symbol translates up4.7px to account for its SVG top whitespace. Wordmark translates up5px to balance the actual lowercase ink. Left inset, header touch target, right-side controls and page layout remain intact.
- Colors: original orange#ff5d17, existing navy#08183e, white wordmark. No recoloring, image background card, shadows or filters were introduced.
- Assets: source SVG remains byte-exact and transparent; no image crop. The Satoshi font is preloaded on web and included in its offline cache and native bundle. Existing install/store icons are unchanged.
- Copy: visual lockups read`ego`; accessible home label stays`에고 홈`. App name 에고/EGO, company60BASE and launch tagline remain unchanged. Native logo micro-subtitle was removed to match the selected simple lockup.

## Comparison history and validation

- First focused check found a P2 optical alignment issue: lowercase ink sat below the visible character. Corrected by translating the wordmark up5px in both implementations, refreshed the browser, and recaptured the files above. Final comparison shows balanced alignment and no clipping or wrapping.
- Home brand link was exercised at375px; native and web fonts were verified loaded. Browser error log was empty for the final local preview.
- Public build,5 static checks and18 release/contact/media checks passed. Native iOS/default/Android boundary checks and mobile check passed; final iOS bundle rebuilt after optical adjustment. No auth, recording, account or store submission changes.
- Remaining limit: iOS runtime/native behavior was not exercised; this change affects the prepared web-view artwork only. Launch shares the same font/size/alignment; transient startup timing remains unchanged.

final result: passed


## Verification-code component review — 2026-10-11

- Scope: reusable UI only; SMS/email channel awaits the owner's decision. No production login route imports it. No delivery, authentication session, or local verification bypass exists. The caller must provide onVerify, onResend and onVerified; both positive verification and successful completion callbacks are required.
- Reference: C:/Users/kslee/Pictures/Screenshots/스크린샷 2026-10-11 005554.png (516×456). Implementation: http://127.0.0.1:5175/__qa/verification; captures .artifacts/verification-qa/entry-390.jpg, expired-390.jpg, resend-error-390.jpg and entry-final.jpg.
- Viewports: mobile 390×844 CSS/pixels at density 1; desktop final capture 1707×1695. Reference is an isolated four-cell card; requested adaptation uses six cells, Korean copy, original EGO symbol, white/orange palette, explicit confirm button and required QA disclosure. It is not claimed as a pixel-identical four-digit authenticator clone.
- Full-view comparison: source and final mobile capture were opened together. Original symbol stays uncropped; title/body, rounded card, evenly spaced cells and resend footer preserve the reference's hierarchy. Focused number/focus/error checks used the earlier six-digit browser state and the final partial-entry desktop capture.
- Typography: local Pretendard, 22px title and 30px digits, no truncation. Spacing: six mobile cells fit within the 350px card without overflow. Colors: orange #ff5d17; secondary text darkened to #687078 after initial review. Asset fidelity: byte-exact existing symbol; no generated QR or fake OS chrome. Copy: channel-neutral, with explicit design-only/no-authentication notice confined to QA.
- Interactions: numeric entry; formatted paste (37 90-24 → 379024); arrow/Backspace; incomplete confirm disabled; asynchronous verify rejection never shows completion; five-second expiry/read-only state; resend cooldown/reset and failure; accessible single one-time-code field, live error text and non-announcing countdown.
- Console: no application errors observed. One unrelated installed browser-extension ethereum injection error was excluded. Physical-device OTP autofill remains unverified; actual channel/backend integration is intentionally pending.
- Iteration: adjusted low-contrast secondary text, reloaded and captured the corrected mobile view. No remaining P0/P1/P2 findings in this UI-only scope.
- final result: passed

# Authenticated EGO app adaptation — 2026-10-11

The owner's Numo screenshots define page composition, not the competing brand or its blue/lime palette. The explicit adaptation is a light canvas, original orange #ff5d17, transparent app_simbol artwork, and the previously selected lowercase ego lockup. Reference paths are Desktop/photo_2026-10-04_01-10-{02,11}.jpg; Downloads/Telegram Desktop/photo_{1..6}_2026-10-11_00-52-40.jpg; and Screenshots/스크린샷 2026-10-11 005{453,554,559,624}.png. All were inspected before implementation.

Source/render comparison: source popup + implemented member-popup-390.png, and source profile + profile-390.jpg were opened together. Root Chrome captures in .artifacts/ego-experience/final-{welcome,home,popup,profile,import,verification}-390.jpg use a 390×844 CSS-pixel viewport. Earlier home/ranking/wallet/profile/welcome JPG captures include the local desktop wrapper (390×844 embedded app), so their full image dimensions are not mobile dimensions. Additional 375×812 and 430×932 checks covered layout and the login boundary. Windows Chrome is not native iOS.

Typography retains the selected Satoshi wordmark and uses Pretendard for Korean UI, with large welcome copy, clear page headings and compact supporting labels. Original symbol geometry/transparency stays byte-exact. Cards, thumbnail rows, category rail, podium/own rank, wallet ledger, profile identity and submission filters follow the supplied hierarchy. User-selected orange replaces reference blue/lime; small muted copy and orange button text were darkened during review for readability. Header, controls and floating pill navigation fit all reviewed widths; inactive tabs retain accessible labels and 48px minimum targets. Reduced motion, native dialog focus and keyboard focus indicators are retained.

Interaction evidence includes actual local email login, post-login popup, closing/CTA and once-per-version persistence; category/route controls and carousel dot synchronization; real approved-point aggregates, ledger and submission status; logout and protected deep links; local file selection card/cancel and real upload-byte progress. Administrator preview and save were exercised through Chrome using explicitly labelled local fixtures. Popup/API tests cover auth, CSRF, version conflicts, timing/frequency and anonymous ranking. Upload tests cover aborted server cleanup and local-only imports. Verification design QA never sends or verifies an actual code.

Findings corrected during iteration: old launch overlay appeared before auth (hidden); offline/provider-only identity opened app routes (server-session gate); carousel dots did not track swipes (scroll synchronization); low-contrast small labels/buttons (darkened); optional memo label wrapped to an extra line (grouped label text). A final independent review reproduced delayed session-expiry detection after foreground return; its focused fix and regression are tracked in the release document.

Remaining product inputs are explicit: benefit eligibility/payment/referral/withdrawal rules and SMS versus email OTP delivery. The interface marks referral/payout features as pending and does not fabricate balances, invite codes, payout operations or completed verification. These are integration dependencies, not silent mock success.

Final independent-review follow-up: foreground/session-age checks now close the reproduced expiry gap, with real-database regression and preserved same-session camera behavior. Root Chrome also observed the checking gate and successful return. Category filtering produced only the matching laundry mission; carousel selection kept the correct active dot. The final import memo label was compacted without changing file behavior. Build/static/release/app-experience checks passed after the final source changes.

final result: passed for implemented UI and existing authentication/upload flows; benefit automation and real OTP delivery remain explicitly pending owner input.
