# Mobile arrow rendering and catalog spacing — 2026-10-10

The owner's mobile screenshots showed diagonal arrows rendered as colored emoji in the inquiry button and direct-email link. The shared Arrow component now draws both directions with inline SVG, using the existing font-relative size, current text color, hover motion and decorative accessibility treatment.

The mobile-only Selected Data instruction sentence and its divider are removed in English and Korean. The shared Hugging Face action now follows the sample grid with a compact 12px top margin. The desktop catalog is unchanged.

## Selected app artwork

The owner chose `04_clay.svg` as the app image/icon and explicitly deferred App Store icon/listing changes until a later combined update. The exact original is archived at `../../../../brand/husuabi-clay-20261010/04_clay.svg`, with provenance and instructions in the adjacent README. SHA-256: `7406e0bf02d59c102ef17bbb6042067ec96792d9698729e74c4db42aa2401401`.

Use that artwork when app imagery is added to the website. This release does not replace platform marks or company/Studio logos, modify existing app behavior or create/upload a native build.

## Verification

- Production build passed (59 homepage modules).
- Static checks: 5 passed.
- Homepage/Contact/media checks: 18 passed, including protected Studio, administrator, app, shared, API and account-deletion preservation checks.
- Independent focused source review found no functional/accessibility regressions.
- Chrome checked English and Korean at 320, 390, 600, 601 and 1440px: the contact arrows render as SVG in the inherited color, the mobile hint is absent, desktop descriptions/links remain, and no horizontal document overflow or JavaScript errors were observed. No real messages or account data were submitted.
- Physical iPhone/Safari testing is not available in this Windows session.

Browser and publication receipts are retained in `.artifacts/mobile-polish-20261010/` and `.artifacts/deployment-status.json`.
