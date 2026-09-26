---
title: Dongjakso Operations
emoji: 🎥
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Dongjakso Operations Space

Private Docker Space for 60BASE Dongjakso operations. The public site remains on Vercel at `https://60base.kr`; Vercel proxies `/api/:path*` to this Space through `api/operations.js` using `DONGJAKSO_HF_SPACE_URL`, server-only `HF_TOKEN` (read access to this Space), and `DONGJAKSO_GATEWAY_KEY`.

Recommended Vercel rewrite for the parent integration:

```json
{ "source": "/api/:path*", "destination": "/api/operations?path=$1" }
```

Keep the existing `/api/contact` route before this catch-all so homepage inquiry email delivery remains on Vercel.

Do not put secrets in this repository or README. Configure Space secrets in Hugging Face and Vercel environment variables.
