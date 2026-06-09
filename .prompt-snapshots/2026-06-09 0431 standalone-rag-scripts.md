---
description: "Created the minimal standalone PowerShell scripts for chunking, embedding, and querying large text files with llama.cpp-backed RAG."
timestamp: "2026-06-09 0431"
model: "GPT-5.4 mini"
applyTo: "src/standalone/*"
---

## User Prompt

yes, please create the scripts from the plan

## Summary

- Added `src/standalone/common.ps1` with shared helpers for text-file discovery, line-based chunking, JSONL IO, cosine similarity, and llama.cpp HTTP calls.
- Added `src/standalone/breakdown.ps1` to scan input files and emit chunk metadata plus chunk text to `chunks.jsonl`.
- Added `src/standalone/embed.ps1` to call a local llama.cpp embeddings endpoint and write an indexed `index.jsonl` file.
- Added `src/standalone/query.ps1` to embed the question, rank retrieved chunks, build a retrieval prompt, and query the llama.cpp chat endpoint.
- Kept the implementation intentionally minimal and validated the new PowerShell files with parser checks.
