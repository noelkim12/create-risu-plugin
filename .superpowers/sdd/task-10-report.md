# Task 10 Report: Google Vertex Authentication Strategies

## Status

DONE

## Implementation

- Added `GoogleServiceAccountTokenProvider` using Web Crypto RS256 JWT assertions and Google's OAuth token exchange.
- Added an in-memory, credential-revision-keyed access-token cache with a 60-second expiry skew, single-flight refresh, and explicit invalidation.
- Added `GoogleVertexProvider` with exactly two authentication branches: Express Mode API key and Service Account OAuth 2.0.
- Kept Express Mode credentials exclusively in `x-goog-api-key` and used the exact project/location endpoints for regional and global Service Account calls.
- Reused the Gemini request/response mapper and the existing transport boundary, including caller signal, timeout, `networkRoute: "auto"`, and transport-owned `logFetch: false` behavior.
- Added no ADC flow, user OAuth popup, persistent access-token storage, streaming, or Task 11+ integration.

## TDD Evidence

### RED

```text
npm test -- tests/templates/llm-client/google-service-account.test.ts tests/templates/llm-client/google-vertex.test.ts
```

Result: exit 1; both suites failed during import because `auth/google-service-account` and `providers/google-vertex` did not exist. This was the expected missing-feature failure.

### Focused GREEN

```text
npm test -- tests/templates/llm-client/google-service-account.test.ts tests/templates/llm-client/google-vertex.test.ts
```

Result: exit 0; 2 files and 4/4 tests passed.

### Google-provider regression verification

```text
npm test -- tests/templates/llm-client/gemini-protocol.test.ts tests/templates/llm-client/google-ai-studio.test.ts tests/templates/llm-client/google-service-account.test.ts tests/templates/llm-client/google-vertex.test.ts
```

Result: exit 0; 4 files and 7/7 tests passed.

### Full verification

```text
npm test
```

Result: exit 0; 14 files and 41/41 tests passed.

## Security and Scope Review

- JWT header and claims use RS256, the Cloud Platform scope, the exact Google token audience, and a one-hour lifetime.
- Private keys are imported as non-extractable Web Crypto keys and access tokens remain only in the provider's in-memory cache.
- API keys never enter URLs; Service Account requests use bearer tokens only after the token exchange.
- Credential revisions partition both cached and in-flight token state.
- OAuth and Vertex requests delegate abort and timeout semantics to the existing `HttpTransport` contract.
- No high or critical self-review findings; no scope beyond Task 10 was added.

## Concerns

None.

## Review Remediation Evidence

### Findings addressed

- Added generation fencing so a refresh started before `invalidate()` can still resolve for its original caller but cannot repopulate the token cache.
- Added promise-identity-checked in-flight cleanup so an older refresh cannot remove a newer refresh for the same credential revision.
- Decoupled the shared OAuth refresh from individual callers: the shared transport request has its own 60-second lifetime, while every caller independently observes its own abort signal and timeout without cancelling the shared work.
- Mapped OAuth token endpoint HTTP 403 responses to `AUTH_FAILED`, matching 400 and 401.
- Added deferred regression coverage for invalidation races, old/new in-flight cleanup, independent abort and timeout behavior, retry after failed refresh, and 403 mapping.

### RED

```text
npm test -- tests/templates/llm-client/google-service-account.test.ts
```

Result before the production fix: exit 1; 4/6 tests failed. The invalidation test observed `access-old` instead of joining `access-new`, abort and timeout tests each hung until Vitest's 5-second test timeout, and the 403 test observed `HTTP_ERROR` instead of `AUTH_FAILED`.

### Focused Task 10 verification

```text
npm test -- tests/templates/llm-client/google-service-account.test.ts tests/templates/llm-client/google-vertex.test.ts
```

Result: exit 0; 2 files and 9/9 tests passed.

### Google-provider regression verification

```text
npm test -- tests/templates/llm-client/gemini-protocol.test.ts tests/templates/llm-client/google-ai-studio.test.ts tests/templates/llm-client/google-service-account.test.ts tests/templates/llm-client/google-vertex.test.ts
```

Result: exit 0; 4 files and 12/12 tests passed.

### Full verification

```text
npm test
```

Result: exit 0; 14 files and 46/46 tests passed.

### Remaining concerns

None.
