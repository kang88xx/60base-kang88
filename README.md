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

`npm test` runs `tests/service-playwright.mjs`, covering the implemented service flows. `npm run test:service` and the retained `npm run test:pending-service` command are aliases for the same suite.

## Current scope

The company inquiry form saves a browser-local draft. 몸짓 supports mission guides, video capture/import, preview, local storage, record search/edit/download/delete, and a shared profile. The web and PWA share IndexedDB only on the same device, browser profile, and origin. Videos are not uploaded to a remote service. A different URL has separate browser storage.

몸짓 also includes browser-local demonstrations of mission submission, review decisions and rewards, a balance ledger, account display information, payout requests, and shop purchases. Account management supports registering, editing, and deleting a bank name, account holder, and account-number suffix (last four digits); it does not store a full account number. The shop supports a cart, demo orders, order history, and cancellation. These flows share local state between the web and PWA under the same storage constraints as recordings.

The app is a PWA, not an APK or IPA. After an initial online visit and service worker installation, its basic screen can load offline. Service modules are included in the offline precache. Camera access and PWA installation depend on the browser and require HTTPS or localhost.

Review decisions, rewards, balances, purchases, and payouts are local demonstrations. Actual payment processing, bank transfers, delivery, server-side authentication, a service backend, remote video collection, and cross-device synchronization are not integrated.

The published frontend has no analytics SDK, paid API, or remote video storage connection. Browser storage can be cleared by the user or operating system; download important recordings for backup.
