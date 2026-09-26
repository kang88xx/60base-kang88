# 60BASE

Company website and Physical AI Studio at [60base.ai](https://60base.ai/).

## Web surfaces

- Company: `/` (English by default; `?lang=ko` for Korean)
- Contributor Studio: `/studio/`
- Installable web app: `/app/`
- Administrator console: `/admin/`

Legacy `60base.kr` web URLs redirect to the same path and query on `60base.ai`. Its API endpoint remains compatible with existing native clients.

## Local development

Use Node.js 24.

```sh
npm install
npm start
```

The local frontend server opens on port 4317. Server secrets and hosted identity settings come from the deployment environment.

## Validate and build

```sh
npm run check
npm run build
node --test tests/localize-homepage.mjs
node tests/frontend-domain.mjs
node tests/domain-origins.mjs
```

The build emits 283 public frontend assets in `dist/`. Vercel also deploys the two handlers in `api/`; the operations handler forwards to the existing hosted service. Configure the four `PUBLIC_FIREBASE_*` browser identifiers in Vercel to generate the client configuration. Service-account and gateway credentials remain environment secrets.

## Release

The 26 September 2026 release includes the `60base.ai` migration, English copy/typography, selected quality-card motion, mobile menu option 1 and bottom-aligned app/Studio badges. See [release verification](docs/operations/RELEASE-20260926.md).

The `mobile:*` scripts belong to the separate native-app workspace and require its local `mobile/` source; the web release does not require them.
