# BASE60 website · 몸짓

**BASE60** company website, 몸짓 participant web service, and mobile PWA.

| Screen | URL |
| --- | --- |
| Company | https://base60.kang88.io/ |
| 몸짓 web | https://base60.kang88.io/studio/ |
| 몸짓 mobile PWA | https://base60.kang88.io/app/ |

## Run and build

Node.js is required. There are no application dependencies.

```bash
npm start
npm run check
npm test
npm run build
```

The local server runs at `http://localhost:4317`. The build copies only public frontend assets to `dist/`. Vercel uses `vercel.json` to build and serve that directory. Tests, local server code, and workspace documents are excluded from the published website.

Browser tests require an existing Playwright installation with Chromium. Set `PLAYWRIGHT_MODULE` to its absolute `index.mjs` path if needed. `KOREO_TEST_PORT` chooses an isolated test port; `KOREO_REVIEW_DIR` chooses the results directory.

## Current scope

The company inquiry form saves a browser-local draft. 몸짓 supports mission guides, video capture/import, preview, local storage, record search/edit/download/delete, and a shared profile. The web and PWA share IndexedDB only on the same device, browser profile, and origin. Videos are not uploaded to a remote service. A different URL has separate browser storage.

The app is a PWA, not an APK or IPA. After an initial online visit and service worker installation, its basic screen can load offline. Camera access and PWA installation depend on the browser and require HTTPS or localhost.

Authentication servers, remote collection, review, payments, payouts, shopping, and cross-device synchronization are not implemented. Future feature tests remain in `tests/pending-service-playwright.mjs` and `tests/service-domain-cases.mjs`; `npm run test:pending-service` intentionally reports missing implementation until those features exist. `npm test` covers the currently implemented frontend.

The published frontend has no analytics SDK, paid API, or remote video storage connection. Browser storage can be cleared by the user or operating system; download important recordings for backup.
