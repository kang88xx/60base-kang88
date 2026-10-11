# Selected EGO appearance · 2026-10-11

The selected B02 buttons use `linear-gradient(135deg,#4265ff,#0024ff 55%,#001bcc)` with white text. G02 provides the app canvas and launch background: `linear-gradient(160deg,#0024ff 0%,#001bcc 56%,#000a66 100%)`. White content cards and semantic success/error/disabled states remain readable. The company homepage uses #0024FF accents and B02 controls with its established layout and motion.

The owner's final 16:20 correction separates three assets:

- Runtime symbol: the new `app_simbol.svg` copied exactly to `app/icons/symbol.svg`; the intro uses the same body and eye geometry. SHA-256 `ad92319c81fa71b16dbbb4bfee107ecf9038d0082110d930b4929015086a160f`.
- Browser favicon: `app/icons/favicon.svg` and 32/64 PNGs, blue rounded square and two white eyes, applied to non-company pages. Company homepage favicon remains unchanged.
- Installed/PWA icon: the existing S02 artwork in `app/icons/icon.svg` and 192/512 PNGs, separate from the runtime symbol. Private native install artwork also remains unchanged by the final symbol correction.

All account, authentication, recording, upload, review, reward and administrator behavior is preserved. Only the app cache version and explicit favicon references change outside presentation files. Exact reversible replacements are recorded in EGO-EXPERIENCE-PRESERVATION-20261011.json; original production hashes remain unchanged.

Validation: production build; static asset/reference checks; all 18 homepage release/contact/media tests; app intro/access/session/popup regressions; 16 app routes at 320/390/1440 pixels; homepage EN/KO at 390/1440 pixels; and latest-symbol home/welcome/intro/auth screenshots. Real Claude Opus 5.5 reviewed the selected theme and found no blocking issue. A CSS text-color fallback it identified was corrected and checked on hover/focus. Private iOS sync/tests and isolated external QA preview are maintained separately; no store submission.

Detailed local evidence: workspace `.omx/reviews/ego-selected-brand-20261011/`.
