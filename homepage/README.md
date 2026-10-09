# 60BASE renewed homepage

The editable React source lives in `src/`; its own media, fonts and vendor scripts live in `public/`. Production assets are isolated under `/homepage/`, so existing Studio, administrator and participant-app assets are not replaced.

From the repository root:

```
npm ci
npm run build
npm run check
npm run check:homepage
npm run dev:homepage
npm run preview:production -- 4411
```

The existing Vercel configuration keeps the API functions, canonical redirects and all other public routes. The build generates `dist/index.html`, `dist/index.en.html` and `dist/index.ko.html`, using the existing production canonical/Open Graph/Twitter metadata. English remains the default; `/?lang=ko` selects Korean.

`index.html` at the repository root retains the previous homepage as rollback source and as the production SEO metadata source. It is not the new homepage entry. Future homepage edits should use `homepage/src/`.

To explicitly refresh the source from the separate design prototype before a release, run `npm run homepage:sync -- /absolute/path/to/60base-loco-20261009`. This copies only source and public assets; proposal options, screenshots, Figma handoff, evidence and dependencies are excluded. This sync is never run automatically by production builds.

Baseline rollback commit: `00d64ac0d7025046167f48fe934effca02fc9da4`. Because production also had eight later public account-deletion/admin updates, preserve the captured files listed in `docs/operations/PRODUCTION-PRESERVATION-20261009.json` when preparing a rollback. Neither this sync nor the homepage build modifies API handlers or runtime records.
