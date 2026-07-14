# LLM Client README and Helper Design

## Goal

Make projects generated with the optional `llm-client` feature immediately understandable and easier to call, without changing projects that do not select the feature.

## Generated README

When `llm-client` is selected, generation appends an `LLM Client` section to the generated project's root `README.md`. The section documents:

- where to configure and test a provider in Risu;
- the convenience helper under `src/helpers/llm.ts`;
- a minimal prompt example;
- how to read response text, provider/model metadata, and token usage;
- the direct `llmClient.complete` API for multi-message requests;
- the feature's text-only, non-streaming limitation and credential-storage warning.

When the feature is not selected, the root README remains byte-for-byte equivalent to the existing framework template after ordinary placeholder replacement.

The feature overlay continues to own the detailed `docs/llm-client.md` reference. The root README provides the discoverable quick start and links to that detailed document instead of duplicating every operational detail.

## Helper API

The feature overlay generates `src/helpers/llm.ts` with one convenience function:

```ts
callLlm(prompt, options?): Promise<LlmResponse>
```

The helper converts a prompt plus optional system prompt and generation/call settings into the existing `llmClient.complete` request. It returns the complete `LlmResponse`, preserving text, provider, model, finish reason, and usage metadata.

Supported helper options are the existing provider, abort signal, timeout, temperature, top-p, and maximum-output-token fields plus an optional system prompt. The helper does not retry, stream, select models independently of saved provider settings, or transform errors.

## Composition

`FeatureComposer` remains responsible for copying feature-owned files. `ConfigFileUpdater` conditionally appends the LLM README section based on `ProjectConfig.hasFeature("llm-client")`, after the base README has been copied. This avoids the feature overlay colliding with the framework-owned root README.

The README fragment is stored as a feature-owned Markdown template so documentation stays colocated with the feature rather than embedded as a large JavaScript string.

## Testing

Tests cover:

- feature OFF leaves the generated root README without LLM instructions or helper;
- feature ON adds the root README instructions and `src/helpers/llm.ts` for Vanilla and Svelte;
- repeated README updating does not duplicate the section;
- `callLlm` maps prompt/options to `llmClient.complete` and returns its response unchanged;
- generated Vanilla and Svelte projects still typecheck and build in the existing ON/OFF smoke matrix.

