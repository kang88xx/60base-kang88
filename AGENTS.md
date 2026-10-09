# 60BASE web release

## Authorized homepage replacement · 2026-10-09

The user explicitly authorized replacing the production company homepage with the completed LOCO prototype, pushing GitHub and deploying. Complete functional and visual checks before publishing. The current button/tag styles are authorized for release; the requested alternatives can be applied later if the user selects one and do not require another release approval. Preserve Studio/admin/app/shared/API behavior and current production account-deletion fixes. The isolated checkout starts from00d64ac; the damaged older workspace must not be reset, staged, pushed or deployed.

New editable homepage source belongs in `homepage/src` with isolated `/homepage/` production assets. Keep canonical EN-default/KO-query routes and production SEO; preserve the existing live Contact POST behavior. Exclude design-options, screenshots, Figma handoff and evidence from the homepage source/public sync. Run npm run build, npm run check and npm run check:homepage before release. Existing older homepage styling notes below are historical after this replacement.

Canonical website: https://60base.ai. Legacy60base.kr web routes redirect to the same path/query; legacyAPI stays compatible with distributed clients.

This tree mirrors the verified production web release of2026-09-26. Preserve the chosen desktop header proportions, defaultEN with explicitKO switch, English copy polish,20%compact quality cards, and quality animation modes1/1/3/3. Mobile menu is option1:25px/17px black lines. The three bottom badges retain unequal heights and share one bottom edge8px above the safe-area inset; their surroundings remain transparent.

Use existing assets, fonts and behaviors. Do not publish secrets, runtime records, local recordings or .vercel/dist caches. Keep app/Studio/shared/API behavior unchanged for homepage-only work. Run npm run check and npm run build; targeted release evidence is in docs/operations/RELEASE-20260926.md.
