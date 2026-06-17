# SPEC-ERRORCODES Implementation Status

Date: 2026-06-17

## Summary

Implemented the Phase 1 foundation through WP9 guard coverage:

- Added category error/warning enums with preserved wire string values.
- Added typed error/warning details and `TransportableError.details` serde.
- Added exhaustive error/warning catalogs and status helper.
- Added v2 response enveloper helper and strict target envelope types.
- Migrated scrape/parse controller error paths partially to status/diagnostics envelopes.
- Added structured warning entries for the listed scrape pipeline producers.
- Added WP9 unit/guard tests.

Important limitation: WP6 is not fully complete across all v2 controllers. The repo now exports the
strict target types, but `LegacyErrorResponse` remains as an explicit compatibility bridge for
unmigrated response sites. The guard test allowlists current bare v2 failure envelopes so new
regressions are caught while the remaining controller migrations are finished.

## Work Package Status

| WP  | Status                         | Notes                                                                                                                                                                                         |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WP1 | Complete                       | Added `lib/error-codes.ts`; migrated public error-code comparisons away from raw strings in controllers/scraper/lib; serde and Sentry use enum members.                                       |
| WP2 | Complete                       | Added `lib/error-catalog.ts` with `ERROR_CATALOG`, `WARNING_CATALOG`, `errorCodeToHttpStatus`, `explainError`, and `explainWarning`.                                                          |
| WP3 | Complete                       | Added `lib/error-details.ts`; `TransportableError` now transports `details`; serde round-trip test covers code/details.                                                                       |
| WP4 | Complete                       | Added `controllers/v2/response-enveloper.ts`; helper unit tests cover diagnostics, warnings, HTTP status mapping, and async failure shape.                                                    |
| WP5 | Partial                        | Strict target types are present in `controllers/v2/types.ts`; `LegacyErrorResponse` remains to keep unmigrated v2 controllers compiling.                                                      |
| WP6 | Partial                        | `scrape.ts` and `parse.ts` have partial envelope migration. Many v2 controllers still use legacy failure bodies and are tracked by the guard allowlist.                                       |
| WP7 | Partial                        | Structured warning entries were added for the listed scrape-pipeline producers and crawl few-results path. Full envelope lifting across every endpoint remains incomplete.                    |
| WP8 | Partial                        | Opaque `errorId` behavior was added in touched scrape/parse opaque paths, but typed-error/no-`errorId` and ZDR diagnostics hardening were not exhaustively audited across all v2 controllers. |
| WP9 | Complete for implemented scope | Added catalog/helper/serde unit tests and source-level guards for magic string comparisons and known bare v2 failure envelopes.                                                               |

## Assumptions

- Existing code and stored serialized errors depend on flat string values, so enum values were kept byte-for-byte compatible.
- Some new error categories are catalog-only until their controller surfaces are migrated.
- The v2 helper is pure builder logic; it does not call Express directly, so controllers can adopt it incrementally.
- `LegacyErrorResponse` is intentional temporary debt, not the final WP5 target.

## Known Issues

- Bare v2 failure envelopes remain in `browser.ts`, `crawl-cancel.ts`, `research-proxy.ts`, and `support-proxy.ts`; the guard test allowlists them.
- Async status endpoints have not all been migrated to `AsyncJobFailureResponse`.
- ZDR diagnostics are implemented in the helper and touched scrape/parse paths, but not exhaustively enforced across all endpoints.
- Full SDK/OpenAPI WP10 was not attempted.

## Verification

Passed:

- `pnpm exec tsc --noEmit`
- `pnpm exec vitest run src/lib/__tests__/error-catalog.test.ts src/lib/__tests__/error-serde.test.ts src/controllers/v2/__tests__/response-enveloper.test.ts src/__tests__/guards/errorcodes-regression.test.ts`

Attempted but blocked:

- `pnpm harness jest src/__tests__/snips/v2/scrape`
  - Failed after harness setup with `spawn jest ENOENT`; this package currently uses Vitest and does not expose a `jest` binary.
- `pnpm harness vitest run src/__tests__/snips/v2/scrape`
  - Failed before running snip tests because `TEST_SUITE_WEBSITE` is a local address while the harness treated the run as production.

## Next Migration Targets

1. Remove `LegacyErrorResponse` after migrating the remaining v2 controller response sites.
2. Convert crawl/batch/scrape/extract/agent async status endpoints to `AsyncJobFailureResponse`.
3. Replace the guard allowlist with a zero-match assertion for bare v2 failure envelopes.
4. Add behavioral snips once the local harness environment is configured for non-production local test-site URLs.
