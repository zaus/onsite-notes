# onsite-notes
A simple note-taking application combined with project and tag tracking, meant for (local) LLM integration.

## LLM settings behavior

- Changing `LLM Provider`, `LLM Base URL`, or `LLM Model` applies to the next message in the current LLM chat session.
- Existing chat history is preserved; you do not need to start a new session to use updated settings.
- Changing `LLM Search Scope` refreshes retrieval context for subsequent messages.
