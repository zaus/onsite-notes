---
description: "Planned the simplest llama.cpp-based RAG workflow for large text files by clarifying the minimal breakdown, embedding, and query stages in the standalone README."
timestamp: "2026-06-09 0417"
model: "GPT-5.4 mini"
applyTo: "src/standalone/README.md"
---

## User Prompt

Help me plan for the simplest RAG querying of large text files using llama.cpp. As described.

> 1. **breakdown.ps1** -- given a directory or file path, scan for text files, breaking them down to optimized chunks
> 2. **embed.ps1** -- turn the optimized chunks (from previous output) into embeddable/searchable format (local database?)
> 3. anything else?

## Summary

- Updated the standalone README to replace the vague script placeholder with a minimal three-step pipeline: `breakdown.ps1`, `embed.ps1`, and `query.ps1`.
- Added the smallest useful data shape for retrieval: chunk text, source metadata, offsets, embeddings, and optional tags.
- Added a concise end-to-end query flow: build the chunk index, embed the question, rank top matches, and send retrieved context plus the question to llama.cpp.
- Kept the existing llama.cpp guidance and avoided adding extra infrastructure beyond the minimum needed for working RAG queries.
