---
description: "Made llama-server startup model selection optional by default (router-managed) while preserving explicit -m/-hf overrides via StartModel."
timestamp: "2026-06-09 0558"
model: "GPT-5.3-Codex"
applyTo: "src/standalone/ensure-llama-server.ps1,src/standalone/query.ps1,src/standalone/README.md"
---

## User Prompt

actually it looks like there's a newer built-in model management router (https://huggingface.co/blog/ggml-org/model-management-in-llamacpp) so we shouldn't actually specifiy a model when starting the server -- therefore StartModel should be completely optional and omitted by default

snapshot

## Summary

- Updated `ensure-llama-server.ps1` so startup no longer requires `ModelPath`.
- Default startup now omits explicit model flags, allowing llama.cpp router-managed model behavior.
- Preserved explicit model startup behavior when provided:
  - existing local path => `-m`
  - non-existing path / model reference => `-hf`
- Confirmed `query.ps1` still supports optional `-StartModel` passthrough only when provided.
- Updated `README.md` usage section to show `-Start` without `-StartModel` as the default path and document `-StartModel` as an override.
