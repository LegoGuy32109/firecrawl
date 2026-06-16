1. In a pure local setup, you don't have one weak engine — you have a 4-engine shortlist, and only one of them renders
   JavaScript. Engine list construction (index.ts:65-83 ✓) gates everything by env: index/index;documents need the hosted index,
   wikipedia needs enterprise creds, x-twitter needs USE_DB_AUTHENTICATION/XAI_API_KEY, all six fire-engine;\* need
   FIRE_ENGINE_BETA_URL. Strip those and all that's left is playwright (only if PLAYWRIGHT_MICROSERVICE_URL is set), fetch, pdf,
   document.

2. The OSS Playwright engine is deliberately a thin page-loader. Its handler (playwright/index.ts:8-48 ✓) sends only {url,
   wait_after_load, timeout, headers, skip_tls_verification} and hardcodes proxyUsed: "basic". Everything else in the feature matrix
   is false.

Here's the verified capability matrix (✓ from engineOptions, index.ts:219-470):

┌───────────────────────────────────┬───────────────────────┬───────────────┬────────────────────────┬───────────────────────┐
│ Feature flag │ playwright (local) │ fetch (local) │ fire-engine;chrome-cdp │ fire-engine;tlsclient │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ actions (click/scroll/type/press) │ ❌ │ ❌ │ ✅ │ ❌ │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ executeJavascript (via actions) │ ❌ │ ❌ │ ✅ │ ❌ │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ screenshot / fullScreen │ ❌ │ ❌ │ ✅ │ ❌ │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ waitFor │ ✅ (fixed delay only) │ ❌ │ ✅ (delay + selector) │ ❌ │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ JS rendering │ ✅ (real Chromium) │ ❌ │ ✅ │ ❌ │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ location (geo spoof) │ ❌ │ ❌ │ ✅ │ ✅ │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ mobile (device emulation) │ ❌ │ ❌ │ ✅ │ ❌ │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ stealthProxy (anti-bot) │ ❌ │ ❌ │ ✅ (;stealth variants) │ ✅ (;stealth) │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ branding │ ❌ │ ❌ │ ✅ │ ❌ │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ audio / video extraction │ ❌ │ ❌ │ ✅ │ ✅ │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ atsv (TLS anti-bot client) │ ❌ │ ❌ │ ❌ │ ✅ │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ skipTlsVerification │ ✅ │ ✅ │ ✅ │ ✅ │
├───────────────────────────────────┼───────────────────────┼───────────────┼────────────────────────┼───────────────────────┤
│ quality rank │ 20 │ 5 │ 50 │ 10 │
└───────────────────────────────────┴───────────────────────┴───────────────┴────────────────────────┴───────────────────────┘
