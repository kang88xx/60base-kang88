# 60BASE web release

## Full homepage QA · 2026-10-10

The owner requested full homepage code/text/behavior QA and mobile optimization and selected mobile Selected Data option2: a compact2×2 grid below601px, with a shared Hugging Face link and full descriptions in the film dialog. Desktop stays unchanged. Keep HOW IT WORKS fine outlines and QUALITY animated trails/rings at a consistent1 CSSpx using non-scaling SVG strokes, preserving original geometry/timing and Services linework. The main mobile hero uses the960×540 mobile encoding up to600px; desktop keeps the original graded video. Restore the published Korean company-profile PDF link. Preserve sample once-through playback while suspending background previews during the film dialog. `check:homepage` includes the media playback regression tests; the comparison hub and QA screenshot report remain excluded from production.

## Brand refinements · 2026-10-10

The four QUALITY & RIGHTS motion frames must have equally clear borders and no corner-square decorations. Preserve their diagram geometry, timing and responsive arrangement.

The latest owner clarification keeps the homepage CONTACT panel black with white text by default and orange (#ff5d17) with dark text on hover, focus and click/active. DATA, SERVICES and ABOUT retain orange hover/focus states. Browser-tab titles use `60base`. The administrator page now uses the same owner-supplied logo_new2 artwork and its own orange favicon/social thumbnail; keep these assets scoped to admin. These presentation changes are authorized for the existing GitHub/Vercel release workflow. Preserve authentication and administrator behavior.

## Authorized homepage replacement · 2026-10-09

The user explicitly authorized replacing the production company homepage with the completed LOCO prototype, pushing GitHub and deploying. Complete functional and visual checks before publishing. The current button/tag styles are authorized for release; the requested alternatives can be applied later if the user selects one and do not require another release approval. Preserve Studio/admin/app/shared/API behavior and current production account-deletion fixes. The isolated checkout starts from00d64ac; the damaged older workspace must not be reset, staged, pushed or deployed.

New editable homepage source belongs in `homepage/src` with isolated `/homepage/` production assets. Keep canonical EN-default/KO-query routes and production SEO; preserve the existing live Contact POST behavior. Exclude design-options, screenshots, Figma handoff and evidence from the homepage source/public sync. Run npm run build, npm run check and npm run check:homepage before release. Existing older homepage styling notes below are historical after this replacement.

Canonical website: https://60base.ai. Legacy60base.kr web routes redirect to the same path/query; legacyAPI stays compatible with distributed clients.

This tree mirrors the verified production web release of2026-09-26. Preserve the chosen desktop header proportions, defaultEN with explicitKO switch, English copy polish,20%compact quality cards, and quality animation modes1/1/3/3. Mobile menu is option1:25px/17px black lines. The three bottom badges retain unequal heights and share one bottom edge8px above the safe-area inset; their surroundings remain transparent.

Use existing assets, fonts and behaviors. Do not publish secrets, runtime records, local recordings or .vercel/dist caches. Keep app/Studio/shared/API behavior unchanged for homepage-only work. Run npm run check and npm run build; targeted release evidence is in docs/operations/RELEASE-20260926.md.
