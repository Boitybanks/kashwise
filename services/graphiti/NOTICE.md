# Graphiti attribution

KashWise's optional local memory service uses the user-selected
[Boitybanks/graphiti fork](https://github.com/Boitybanks/graphiti), pinned to
`8d8a12a22452cbef9335792afb73b8cbfe6a79fa` (Graphiti Core 0.32.0).
Graphiti is copyright 2024 Zep Software, Inc. and contributors, licensed under
Apache License 2.0. A copy is provided as `GRAPHITI-LICENSE`.

The fork is installed as a dependency; this service does not modify its source.
KashWise adds a private HTTP boundary, input validation, isolated worker groups,
an asynchronous queue, confirmed-snapshot tracking, deletion, and a local Ollama
structured-score reranker. The code uses the OpenAI Python SDK solely as the
transport to Ollama's loopback `/v1` compatibility interface. No OpenAI account,
API key or hosted fallback is used. Graphiti telemetry is disabled before import.

