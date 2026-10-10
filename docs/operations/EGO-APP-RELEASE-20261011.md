# EGO participant experience — 2026-10-11

## Implemented scope

The owner's mobile references define the composition, with the final sky-blue palette, cool #f3f6fd background, white cards and the selected transparent symbol/lowercase ego lockup. The welcome screen is the only app surface without an application-server session after the selected startup intro completes. Google, supported native iOS Apple, and existing email/password entry remain real provider flows.

Home has a horizontal activity carousel, paging indicators, guide banner, category rail and compact mission rows. Ranking uses a new authenticated endpoint aggregating approved footage and reward-ledger points, with anonymous labels and a separate current-user row. Rewards retains real balances, pending estimates and the ledger. Profile retains real identity/submission states and a clearly pending referral panel. The floating bottom bar expands only the selected tab. File sheets add the reference's dashed selection area, removable filename card, genuine byte progress and cancel behavior without altering required consent or submitting local imports automatically.

Administrator → Operations settings → Login popup supports enable/disable, title, body, image, button/route, date window and once/daily/session frequency. Preview renders plain text. Changes use admin authorization, CSRF and optimistic versions; delivery acknowledgements persist per account and are removed during account deletion. The initial content is a filming guide, not an unconfirmed benefit promise.

## Pending owner information

The owner confirmed that free mounts, signup 100P, referral rewards and withdrawals are planned, but eligibility, timing, duplication/anti-abuse rules, referral milestones and payout conditions have not been provided. No automatic benefit payment, referral code or withdrawal operation has been fabricated or enabled.

SMS versus email OTP delivery is also pending. `studio/verification-code-ui.js` and `app/verification-code.css` provide the numeric entry, autofill/paste, expiry, resend and error states, but no app login route uses them yet. Real verification/resend/completion callbacks are required. The development-only `/__qa/verification` page explicitly says it cannot send or verify codes and never creates a session.

## Local review and limits

`npm run dev:mobile:qa` starts loopback-only `http://127.0.0.1:5175/__qa/` with disposable SQLite fixtures, local sample video bytes and no Firebase or external upload connection. Its member/empty/admin accounts and points are labelled test data. The helper and `tools/verification-code-preview.html` are excluded from hosting. The existing `5173/__mobile/?view=ios` preview remains the iOS web bundle preview; Windows Chrome is not an iOS runtime.

Chrome review covered welcome → email login → popup → home/ranking/rewards/profile, admin preview/save, logout/deep links, local import, and 375/390/430 widths. Evidence is in `.artifacts/ego-experience/`, `.artifacts/ego-forms/`, `.artifacts/welcome-popup-browser/` and `.artifacts/verification-code/`. Older `*-390.jpg` wrapper captures include the desktop frame; `final-*-390.jpg` captures use an actual 390×844 browser viewport.

Public validation: production build, static references/scripts/assets, homepage/contact/media preservation, popup authorization/persistence/browser checks, actual auth-provider and account-deletion/receipt regressions. The public `test:mobile` aggregate initially stops because this checkout has no Capacitor Android node_modules. All remaining ten tests were run successfully; the private mobile workspace separately runs native-adapter and iOS/default/Android boundary checks with its installed dependencies.

The private iOS overlay carries only allowlisted UI/form files. Native cancellation, persistent Firebase auth, recording orientation, original bridge and deletion receipt files stay protected. Prepared iOS source is not a signed physical-device test or App Store upload. Store submission remains deferred by the owner.

## Selected Claude D intro

The owner's additional instruction names the Claude-produced intro. Workspace `2026-10-11-session-notes.md` explicitly selects `design_previews/ego-intro-motion-20261011/intro-final-d.html`: a full orange field contracts toward the symbol, the blob appears, its eyes open/blink, then uppercase EGO and “내 시점이 AI가 된다” appear on #f8f6f1. This supersedes the earlier disabled launch overlay. The separate app header remains lowercase ego.

The implementation preserves the source SVG paths, 76px symbol, local Inter Tight 800 at 46px, 16px/10px spacing and 14px tag. The subsequent explicit instruction to stop using orange supersedes the source colors: both flood and blob use #2f86f4 on #f3f6fd. It has a 2700ms bound and a keyboard-accessible skip control. Reduced motion displays a short static final frame. The intro runs once per tab session on home entry, never on route changes or foreground returns; deep links and restored history skip it. Offline/error/dialog interruption releases inert state and focus. The server-session boundary remains responsible for access, and the welcome popup waits until launch is hidden. There is no replay/query demo mode in production.

Production release `0754c55e6ef0788609559e8c583f25c7dd51b0d4` for the broader app redesign was verified on 60base.ai before this additive intro release: nine public app/admin source hashes matched after newline normalization. Chrome's existing PWA instance used Settings → App update to activate the new worker. The live member home, post-login popup and admin settings/preview were checked without changing production popup configuration. Screenshots are `.artifacts/ego-experience/live-home-390.jpg` and `live-admin-popup-preview.jpg`; the earlier `live-popup-390.jpg` filename is a full desktop capture, not a 390px viewport.

## Final blue reference theme and artwork

The owner subsequently selected the actual blue colors from `스크린샷 2026-10-11 005624.png`, then explicitly included the icon and symbol and said orange would no longer be used. This overrides the earlier orange UI and byte-exact orange artwork instructions. `app/ego-reference-theme.css` provides the #f3f6fd canvas, white cards, dark titles, gray secondary copy and blue gradient controls. The accent master is #2f86f4. Real error/success states keep their semantic red/green colors. The shared popup stylesheet also presents blue in the administrator preview, and the prepared OTP component is blue.

Public `app/icons/icon.svg`, `symbol.svg` and `assets/brand/ego-clay-20261010/ego-symbol-original.svg` share SHA-256 `d2746d889c66ae7c055b3f7d54240cb2ba6a5cd6635f08423fb9fbf3ce9407b2`. Only the orange fill changed; SVG geometry, eyes, viewBox and transparent margins are identical. Favicon32/64 and PWA192/512 were regenerated with unchanged alpha masks. Workspace `brand/ego-blue-20261011` contains the blue source, renderer, readback report, RGB1024 store-prepared icon and RGB2732 splash on #f3f6fd. The orange source remains archived in `brand/husuabi-clay-20261010`. Company 60BASE branding remains separate. No App Store submission was made.
## Backend source preservation and release

The frontend checkout contained backend code older than the operational account-deletion receipt-token and SQLite sidecar fixes. Before releasing the app redesign, the current private Hugging Face Space was read back through the existing production build credential. All 18 deployed-file SHA-256 hashes matched the saved 2026-09-28 release at `3f0bcc4a57db05e3dfe2d5bac44c6b3842ddb4b7`. The canonical checkout restored those existing protections, including `server/hf-state.mjs` at SHA-256 `8bfad7b626347d1a766b2c8a3b3c577aad9c39dc4ce7212ee0e23c42b8b1739b`.

The redesign backend was released as a five-file diff with an exact fixed parent, after checking every existing source hash. Changed existing files are `server/app.mjs`, `server/database.mjs`, and `server/account-deletion.mjs`; new files are `server/welcome-popup.mjs` and `server/community-summary.mjs`. Account deletion gains cleanup for the new popup-view records. All other 15 deployed files and the Docker runtime definition remain unchanged.

Resulting HF revision: `10041d5b26e8fbef3f626eaf9a7fc8bf1aab1fb2`, Space `60base/dongjakso-operations`. Post-commit and independent readback both verified all 20 resulting source hashes. The independent runtime check returned RUNNING. Public health/session/catalog reads returned HTTP 200; health reported `online:true`, and catalog retained 8 tasks. Unauthenticated popup, community-summary, and admin-popup reads returned HTTP 401.

The existing sensitive HF token stayed inside Vercel's build environment. The diagnostic/release carrier builds used `--prod --skip-domain` and deliberately exited 1, so their Vercel ERROR state is expected and no website alias was assigned. At the completion of this backend-only step, the production target and `60base.ai` alias both remained `dpl_252Zs4VksNikwzsNy71tw63kd4sP`. No credential, runtime setting, data reset or account action was performed by the release carrier.

Validation included 10 HF-state checks, HF erasure checks, and the actual HTTP/HF persistence account-deletion regression. Unknown snapshots still block deletion without being removed; retry, completed receipt, unrelated balances/sessions, and checkpoint restore passed. The release-script fixture verified GET-only plan mode, the exact five-file commit scope, all 20 post-release hashes, and aborts for parent/source drift or a pre-commit race.

Workspace evidence is under `.omx/reviews/ego-backend-source-20261011/`: `live-hf-verification.json`, `canonical-release-scope.json`, `code-release-result.json`, `post-release-hf-verification.json`, and `public-api-verification.json`. Reviewed scripts and source are in `release-source/`; its default build command has been returned to read-only plan mode.

### Recovery

For a popup content/visibility problem, disable the popup through its administrator setting. A frontend rollback can use the previous Vercel production deployment; the additive backend remains compatible with the previous frontend.

For a backend defect, make a reviewed correction against the currently observed HF parent and preserve the receipt-token and HF-state fixes. If temporarily removing the new API routes is necessary, a scoped rollback of `server/app.mjs` can restore the prior routes while retaining the additive database table and the account-deletion cleanup for `app_popup_views`. Do not blindly restore the old `account-deletion.mjs` after popup history exists: the old purge list lacks that table and can leave a user foreign-key dependency. Do not reset/replace the durable database or remove the additive table as part of code recovery. Recheck parent and every unaffected source hash before any later commit, and verify runtime/public health afterward.


## Verification artifacts

The verification-code design evidence is in `.artifacts/verification-qa/` and the root Chrome capture `.artifacts/ego-experience/final-verification-390.jpg`. No production route imports the component until a real server challenge/delivery flow is chosen.

## Session-expiry correction and final checks

Foreground return (visibilitychange, focus, pageshow) revalidates the server session, merges simultaneous requests and briefly keeps the app behind its login boundary while checking. Foreground duplicates within one second are ignored; ordinary member navigation/actions reuse a verification for 45 seconds. There is no timer-driven polling. An aged filming click starts the check and requires a fresh user click afterward, preserving browser/native camera activation. A successful check for the same session does not close an existing camera or upload dialog. Expired/revoked sessions clear member surfaces.

`tests/app-session-revalidation.mjs` reproduces actual database expiry and verifies resume, merged events, checking-state action denial, same-session camera preservation and stale member deep links. This closes the independent review finding. Final production build, five static checks, eighteen homepage/contact/media checks and the complete app-experience chain passed. Deletion/receipt/provider/HF regressions also passed as recorded above. The app manifest and prepared iOS manifest now both use the light #f7f8fa theme/background; artwork is unchanged.
