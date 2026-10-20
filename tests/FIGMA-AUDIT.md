# Figma 64-screen audit

The read-only source fixture is `fixtures/figma-137-2484.json`. It contains the actual 64 frames retrieved from Figma file `mqLzAb8888THEKjqH3eA7G`, board `137:2484`. The provenance sidecar records retrieval method, coordinate conventions and original/compact SHA-256 hashes. JSON whitespace was compacted; node geometry, text, font attributes and image hashes were preserved.

For a full reference comparison, set the downloaded audit archive explicitly:

```sh
export FIGMA_AUDIT_DIR=/absolute/path/to/ego-figma-audit-20261020
node scripts/dev-mobile-qa.mjs --port=5185
```

In another terminal, from the repository root:

```sh
export FIGMA_AUDIT_DIR=/absolute/path/to/ego-figma-audit-20261020
export ALAN_QA_BASE=http://127.0.0.1:5185
node tests/figma-screen-audit.mjs
node tests/figma-form-audit.mjs
node tests/figma-account-support-audit.mjs
node tests/coupon-rewards-browser.mjs
node tests/review-resubmit-browser.mjs
node tests/figma-upload-audit.mjs
node tests/figma-preparation-audit.mjs
node tests/build-figma-audit-manifest.mjs
```

`PLAYWRIGHT_MODULE` may point to an installed Playwright ES module. The existing default uses the local gstack Playwright installation. The QA server is loopback-only with disposable local accounts/data and no production providers. Stop it with Ctrl+C to remove its temporary database. Form/provider and capture/upload fixtures are explicitly labelled in the output.

Without `FIGMA_AUDIT_DIR`, geometry audit scripts write to `.artifacts/figma-audit` and fall back to the pinned structural fixture. The upload audit also requires its synthetic video fixture, described below. Coupon screenshot capture is opt-in through `FIGMA_AUDIT_DIR`. The manifest aggregator requires the full downloaded archive, including its initial `comparison-manifest.json`, `context/`, `forms/`, `capture/` and all runtime reports. It does not create or substitute missing design contexts.

For a focused root-screen regression, use `FIGMA_AUDIT_SCREENS=9,17` with an existing runtime report. Selected screen evidence is recaptured and merged; other screens retain their capture timestamps.

Portrait source coordinates include a 40px native system bar. Browser comparisons use 390×804 and subtract 40px from source Y. No system bar is drawn in the app. The audit checks named geometry, typography, navigation and action regions plus real behavior where fixtures permit. `PARTIAL` means bounded runtime evidence; it does not certify complete pixel parity. Physical iPhone camera behavior, actual OAuth/SMS and TestFlight distribution require separate proof.

`review-resubmit-browser.mjs` runs an isolated local service and reaches consent through the actual review list/detail controls. It checks both uploaded and rejected originals, explicit consent, revision increments, unchanged media bytes/hash, refreshed status and zero upload requests. Screens35–39 are captured through actual detail, resubmit and deletion controls; their headline geometry, typography and full-page headers are compared against the source. Deletion contact links are checked without sending a message. This evidence supersedes direct-component capture when present in the archive.

`figma-upload-audit.mjs` requires `capture/original-60s.webm` from the audit archive (synthetic VP8,320×180,60 seconds). It uses the actual guide import control and browser file metadata; upload/submit API responses are explicitly intercepted locally to hold transfer/validation states and exercise failed submission retry. Screens27–32 geometry and full-page headers are checked against the pinned Figma source.

`figma-preparation-audit.mjs` runs an isolated local service and traverses the actual education, quiz and preflight stages. It checks rejected incorrect answers, successful completion, four persisted checklist values, continuation to the selected activity's guide, reachable fixed actions, and source headline geometry/typography for screens19–21. Screen19 also compares the hero image bounds.
