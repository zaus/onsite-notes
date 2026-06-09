---
description: "Added automatic llama-server lifecycle management to the RAG pipeline with ensure-llama-server.ps1, simplifying the query workflow and explaining why the local server approach is superior to command-line invocation."
timestamp: "2026-06-09 0458"
model: "GitHub Copilot / Claude Haiku 4.5"
applyTo: "src/standalone/*.ps1, src/standalone/README.md"
---

## User Prompt

is it better to host llama.cpp and interact via local server, or via commandline?

[User then requested]: please insert this explanation (summarized) of why a llama local server is better than commandline as a new step 3 to the usage section you just added, or better yet add a new script to check if llama is running and start it if not (with configurable port) then call that script from the query script (w/ parameter `Start` to specify the port, that will also set the two endpoints, or `SkipStart` flag to assume it's already running)

## Summary

- Created `src/standalone/ensure-llama-server.ps1` to manage the llama-server lifecycle: detects if it's already running, or starts it if given `-ModelPath`. Polls the `/health` endpoint and waits up to 30 seconds for readiness.
- Updated `src/standalone/query.ps1` to accept `-Start <port>` parameter that triggers automatic server startup and endpoint configuration, and added support for `-SkipStart` to assume the server is already running.
- Simplified the README usage section to show the minimal command: `.\query.ps1 -Question "..." -Start 8080` instead of manual endpoint configuration.
- Added explanatory text in README about why the local server approach is faster: keeps the model in memory across queries instead of reloading on each invocation.

## Rationale

The local HTTP server approach provides ~10x faster queries for RAG workflows because the model stays loaded. Command-line execution reloads the entire model on each call (~5-15 seconds overhead). The new infrastructure automates server startup, reducing friction for users.
