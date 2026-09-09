# Changelog

## 1.1.0 — 2026-09-09

- Restore the existing 몸짓 shop demonstration in the web and mobile PWA: cart, demo orders, order history, cancellation, and local reward-balance purchases.
- Restore account display registration, editing, and deletion using only the account-number suffix, plus local payout requests and status handling.
- Restore local mission submission, review decisions, rewards, and balance history.
- Preserve concurrent cart quantity increments across tabs.
- Include the service modules in the PWA offline precache.
- Run the service browser suite through `npm test`, `npm run test:service`, and `npm run test:pending-service`.

These features operate in browser-local storage. Actual payments, bank transfers, delivery, server-side authentication, and a service backend are not integrated.
