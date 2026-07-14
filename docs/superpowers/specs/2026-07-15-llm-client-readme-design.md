# Conditional LLM Client README Design

## Goal

Make projects generated with the optional `llm-client` feature immediately understandable, without changing projects that do not select the feature.

## Generated README

When `llm-client` is selected, generation appends an `LLM Client` section to the generated project's root `README.md`. The section documents:

- where to configure and test a provider in Risu;
- a minimal prompt example;
- how to read response text, provider/model metadata, and token usage;
- the direct `llmClient.complete` API for multi-message requests;
- the feature's text-only, non-streaming limitation and credential-storage warning.

When the feature is not selected, the root README remains byte-for-byte equivalent to the existing framework template after ordinary placeholder replacement.

The feature overlay continues to own the detailed `docs/llm-client.md` reference. The root README provides the discoverable quick start and links to that detailed document instead of duplicating every operational detail.

## Composition

`FeatureComposer` remains responsible for copying feature-owned files. `ConfigFileUpdater` conditionally appends the LLM README section based on `ProjectConfig.hasFeature("llm-client")`, after the base README has been copied. This avoids the feature overlay colliding with the framework-owned root README.

The README fragment is stored as a feature-owned Markdown template so documentation stays colocated with the feature rather than embedded as a large JavaScript string.

## Testing

Tests cover:

- feature OFF leaves the generated root README without LLM instructions;
- feature ON adds the root README instructions for Vanilla and Svelte;
- repeated README updating does not duplicate the section;
- generated Vanilla and Svelte projects still typecheck and build in the existing ON/OFF smoke matrix.
