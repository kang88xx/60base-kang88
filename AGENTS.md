# 60BASE web release

## EGO participant app · 2026-10-11

The owner renamed the participant app to 에고 / EGO per workspace-root NAMING-EGO-2026-10-10.md. Company 60BASE, domains, account/backend identifiers and native bundle ID kr.base60.app remain unchanged. Use the byte-exact selected 04_clay.svg master in assets/brand/ego-clay-20261010 and app/icons; do not recolor, flatten to a monochrome mark, crop it with the previous radial loading mask or claim it is maskable. App name, launch, installation, settings, favicon and homepage contributor entry now use EGO. Protected production behavior still compares against the original hashes after reversing only the explicit brand text changes recorded in docs/operations/EGO-BRAND-PRESERVATION-20261011.json.

Windows mobile preview defaults to the actual participant /app/#home, with local source and live https://60base.ai/app/#home modes plus optional company homepage. Run npm run dev:mobile, open http://127.0.0.1:5173/__mobile/ and keep it available while editing. App saves trigger reload; homepage uses React HMR. Development APIs are deliberately disconnected; the live mode is the actual operating service. This is a browser preview, not an iOS runtime. Store listing/icon upload remains deferred to the owner's combined update; prepared private iOS source and opaque store artwork are outside this public checkout.

## Windows mobile preview workflow · 2026-10-10

The owner requests working with a visible mobile preview on Windows. The 2026-10-11 app preview workflow above supersedes the earlier company-homepage default. Workspace-root `모바일-미리보기.cmd` and the VS Code mobile preview task reopen it. Avoid `start-preview.bat` / `npm start` for the current homepage because they serve the older root source. Keep the helper development-only and loopback-only; do not deploy the preview page.

## Mobile arrows and selected app artwork · 2026-10-10

The owner requests identical desktop/mobile arrows: use the shared inline SVG Arrow, never emoji-prone Unicode arrow glyphs. Remove the mobile Selected Data instruction sentence and its divider in both locales and keep the compact spacing before the shared Hugging Face link.

The owner selected `C:/Users/kslee/Desktop/app_icon_variations_opus/04_clay.svg` as the app image/icon. Its byte-exact master and selection record are saved at `../../brand/husuabi-clay-20261010/`. Use this artwork when adding app imagery to the website. App Store icon and listing updates are explicitly deferred to a later combined update; do not build/upload/submit a store change for this request. Existing Apple/Android platform marks and company/Studio logos are separate from the app artwork.

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
