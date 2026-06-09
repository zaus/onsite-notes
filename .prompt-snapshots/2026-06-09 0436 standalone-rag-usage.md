---
description: "Added a usage subsection to the standalone README showing the minimal breakdown, embed, and query commands for the llama.cpp RAG pipeline."
timestamp: "2026-06-09 0436"
model: "GPT-5.4 mini"
applyTo: "src/standalone/README.md"
---

## User Prompt

yes please add a usage subsection at the end of "Scripts" right before "Local LLM"

## Summary

- Inserted a new `### Usage` subsection between the scripts overview and the local model guidance in `src/standalone/README.md`.
- Added compact PowerShell examples for `breakdown.ps1`, `embed.ps1`, and `query.ps1` using the default JSONL file names from the scripts.
- Kept the section short and practical so it reads as the direct runbook for the minimal standalone RAG flow.
