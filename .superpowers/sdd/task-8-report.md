# Task 8 Report

## Status

DONE

## Implementation

- Expanded URL validation and local-network classification while preserving the Task 7 chat-completions URL contract.
- Added `NativeFetchTransport` with native-fetch-only requests, secret-safe logging, timeout/caller-abort distinction, local routing, and hosted-web rejection.
- Integrated endpoint policy into provider validation.
- Updated Vanilla and Svelte vendored Risu API declarations identically.
- Added URL-policy and transport tests, including hosted-web local-network rejection.

## TDD Evidence

- RED: the prescribed focused tests initially failed because the full URL-policy exports and native transport were missing.
- Additional RED: hosted-web local-network request initially surfaced `NETWORK_ERROR` instead of `UNSUPPORTED_RUNTIME`.
- GREEN: `npm test -- tests/templates/llm-client/url-policy.test.ts tests/templates/llm-client/native-fetch-transport.test.ts tests/templates/llm-client/validation.test.ts tests/templates/llm-client/local-repositories.test.ts` — 4 files, 17/17 tests passed.
- Full: `npm test` — 10 files, 32/32 tests passed.
- Vendored declarations: byte-identity `cmp` passed.
- `git diff --check` passed.

## Concerns

None.

## Review Fix: Runtime Preflight Cancellation

- Moved caller-abort and timeout composition ahead of hosted-web runtime detection.
- Made a stalled `getRuntimeInfo` wait honor the same composed signal while preserving caller abort as `ABORTED`, wrapper expiry as `TIMEOUT`, hosted-web rejection as `UNSUPPORTED_RUNTIME`, and ordinary runtime lookup failure as the existing non-web fallback.
- RED: two focused stalled-preflight regressions resolved the 100 ms guard value instead of rejecting with `ABORTED` and `TIMEOUT`.
- GREEN: `npm test -- tests/templates/llm-client/native-fetch-transport.test.ts tests/templates/llm-client/url-policy.test.ts` — 2 files, 8/8 tests passed.
- Full: `npm test` — 10 files, 34/34 tests passed.
