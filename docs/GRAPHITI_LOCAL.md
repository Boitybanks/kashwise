# Earn My Goal: local Graphiti + Ollama memory

KashWise uses the requested [Boitybanks/graphiti fork](https://github.com/Boitybanks/graphiti),
pinned to commit `8d8a12a22452cbef9335792afb73b8cbfe6a79fa` (Graphiti Core 0.32.0).
This optional private Python service adds memory for a worker's confirmed earnings-goal
preferences. The job matcher, eligibility rules, financial calculations and live job
availability remain authoritative in the KashWise application and Supabase.

## What is local

All model inference, embeddings and reranking go to Ollama on loopback. The OpenAI
Python SDK is used only as an HTTP client for Ollama's compatible `/v1` API. No
OpenAI account or API key is needed. Every Graphiti model client is explicitly
configured; there is no hosted fallback. Ambient proxy settings are ignored and
redirects are disabled. A remote Ollama URL is rejected. Graphiti telemetry is
disabled before importing the library.

The service uses Neo4j Community locally. The fork's embedded Kuzu driver is
deprecated, and FalkorDBLite is not a practical Windows-native choice. The fork
also documents a concurrent-query problem with its FalkorDB driver. Neo4j is the
supported path here. Docker publishes only `127.0.0.1:7687`; its browser interface
is not published.

## Setup on this Windows machine

Prerequisites: Python 3.13, `uv`, Ollama, and a working Docker Desktop Linux engine.
Docker Desktop must finish starting before Compose can connect. The database and
local model need available RAM; startup and extraction can be slow on a laptop.

```powershell
cd services/graphiti
./setup-local.ps1
ollama pull nomic-embed-text
# The installed llama3.2:latest (3B) is the memory-conscious default. If missing:
ollama pull llama3.2:latest
docker compose up -d
./run-local.ps1
```

`setup-local.ps1` creates an ignored `.env` with three independent random secrets,
preserves an existing file, and installs the pinned fork into a service-only venv.
Never print or commit those secrets. `GRAPHITI_GROUP_SECRET` must remain stable to
find existing worker memories; changing it makes the old partitions unreachable.
Rotate the service bearer token independently.

The application backend needs `GRAPHITI_SERVICE_URL=http://127.0.0.1:8787` and the
same `GRAPHITI_SERVICE_TOKEN`. Neither belongs in a `VITE_` variable. The browser
calls KashWise's authenticated API, never this private service directly.

Start exactly **one** uvicorn worker. The bounded ingestion queue is in memory;
queued work is not durable across restart. The interface reports pending status
and must never promise that queued memory was saved. A production deployment
needs a persistent queue, monitored retries and a persistent private server.
Netlify cloud functions cannot reach a laptop's `127.0.0.1`; leave memory disabled
there until a private authenticated service deployment is configured. The
deterministic planner should continue to work when memory is unavailable.

## API contract

Every endpoint, including `GET /health`, requires
`Authorization: Bearer GRAPHITI_SERVICE_TOKEN`. OpenAPI/docs and CORS are disabled.
The token belongs only to the KashWise backend. That backend verifies its Supabase
JWT and derives `worker_id` from the authenticated user, never from browser input.

`POST /v1/preferences` accepts `{worker_id, preferences}` and returns HTTP 202
`{"status":"queued"}`. `preferences` contains exactly:

```json
{
  "target_cents": 90000,
  "deadline": "2026-11-01",
  "area_slug": "soweto",
  "weekdays": [6],
  "time_windows": ["morning"],
  "radius_km": 10,
  "skills": ["gardening"]
}
```

Weekday 0 is Sunday. Skills are KashWise category slugs. No free-form messages,
names, phone numbers, identity documents, exact addresses, bank data or job text
are accepted. An area is a coarse catalog slug already validated by KashWise.
Request bodies are capped at 8 KiB; unknown properties are rejected without
echoing rejected input. Each worker can have only one update pending; a full
16-item queue returns 429. Local extraction has a 240-second bound.

`POST /v1/preferences/search` accepts `{worker_id}` and returns
`{status, preferences, facts}`. Status is `ready`, `empty`, `pending` or
`unavailable`. Preferences come from the original validated episode JSON, only
after extraction completed successfully. Facts use Graphiti hybrid search and an
Ollama structured-score reranker, include validity dates, and are optional.
`facts_status: unavailable` means semantic retrieval exceeded its 8-second bound
or failed; a confirmed snapshot can still be returned. Facts never determine
eligibility, money, available jobs or the user's final preferences.

`DELETE /v1/preferences` accepts `{worker_id}`. It invalidates queued updates,
cancels and awaits in-flight extraction, then deletes only that worker's graph
partition. Repeating deletion is safe. A failure returns 503 rather than falsely
claiming deletion. Pending jobs cannot resurrect forgotten preferences.

## Consent and isolation

Memory is optional and should be sent only after explicit worker opt-in.
The worker identifier is converted into an HMAC-derived partition; its UUID
is not included in model input. Every ingestion, search and deletion is scoped
to that partition. Only the user's confirmed structured preferences are stored;
no inferred credit score or user identity is produced. The user reviews any
remembered preferences before planning and can choose Forget.

Local storage still contains sensitive work preferences. Keep the device and
Neo4j volume protected. This is local processing, not a claim that data is
anonymous or that a laptop automatically meets production privacy requirements.

## Verification

Local check, 23 October 2026: all 19 gateway tests passed, and the pinned fork's
GraphMemory adapter initialized with the explicitly configured Ollama clients.
Ollama was running and `nomic-embed-text` was downloaded. A complete Neo4j-backed
ingest/search/forget smoke test has **not** passed yet: Docker image setup remained
incomplete and Docker was stopped after severe memory pressure on this 8 GB laptop.
No hosted database migration or Netlify deployment was performed in this change.
The service setup remains available for a machine with sufficient free memory.

```powershell
.venv/Scripts/python.exe -m pytest tests -q
```

The tests use a fake graph adapter for auth, schema bounds, partition isolation,
failure honesty, queued/in-flight cancellation and idempotent deletion. They do
not prove live LLM quality. Real smoke results are recorded in the task handoff;
do not infer a successful graph ingestion merely from passing unit tests or a
running Ollama process.

Source and license: [fork README at pinned commit](https://github.com/Boitybanks/graphiti/blob/8d8a12a22452cbef9335792afb73b8cbfe6a79fa/README.md),
[fork guidelines](https://github.com/Boitybanks/graphiti/blob/8d8a12a22452cbef9335792afb73b8cbfe6a79fa/AGENTS.md),
and `services/graphiti/GRAPHITI-LICENSE` (Apache-2.0, Zep Software and contributors).

