import asyncio
import sys
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import MemoryQueue, create_app
from models import Preferences
from settings import Settings

WORKER = '00000000-0000-4000-8000-000000000001'
OTHER = '00000000-0000-4000-8000-000000000002'
SETTINGS = Settings(token='a' * 40, group_secret='b' * 40, neo4j_password='test-only')
PREFS = {'target_cents': 90000, 'deadline': '2026-11-01', 'area_slug': 'soweto',
         'weekdays': [6], 'time_windows': ['morning'], 'radius_km': 10, 'skills': ['gardening']}
AUTH = {'Authorization': 'Bearer ' + SETTINGS.token}


class FakeMemory:
    def __init__(self):
        self.saved = {}
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.block = False
        self.deleted = []

    async def start(self):
        pass

    async def close(self):
        pass

    async def ingest(self, group, preferences):
        self.started.set()
        if self.block:
            await self.release.wait()
        self.saved[group] = preferences.model_dump(mode='json')

    async def recall(self, group):
        return {'preferences': self.saved.get(group), 'facts': []}

    async def forget(self, group):
        self.deleted.append(group)
        self.saved.pop(group, None)


def test_all_routes_require_private_auth_and_docs_are_disabled():
    with TestClient(create_app(SETTINGS, FakeMemory())) as client:
        assert client.get('/health').status_code == 401
        assert client.post('/v1/preferences/search', json={'worker_id': WORKER}).status_code == 401
        assert client.get('/docs', headers=AUTH).status_code == 404
        assert client.get('/health', headers=AUTH).json()['provider'] == 'ollama'


def test_body_limit_and_invalid_input_are_not_echoed():
    with TestClient(create_app(SETTINGS, FakeMemory())) as client:
        assert client.post('/v1/preferences', headers=AUTH, content='x' * 8193).status_code == 413
        body = {'worker_id': WORKER, 'preferences': {**PREFS, 'contact': 'private@example.test'}}
        result = client.post('/v1/preferences', headers=AUTH, json=body)
        assert result.status_code == 422
        assert 'private@example.test' not in result.text


@pytest.mark.parametrize('field,value', [
    ('target_cents', True), ('target_cents', -1), ('weekdays', [7]),
    ('weekdays', [6, 6]), ('time_windows', ['all-day']), ('skills', ['send my PIN']),
    ('radius_km', 10000), ('area_slug', 'john@example.com'), ('deadline', 'not-a-date'),
])
def test_rejects_invalid_or_unbounded_preferences(field, value):
    with pytest.raises(ValidationError):
        Preferences.model_validate({**PREFS, field: value})


def test_snapshot_round_trip_and_worker_isolation():
    async def scenario():
        memory = FakeMemory()
        queue = MemoryQueue(memory, SETTINGS)
        await queue.start()
        try:
            assert queue.group(UUID(WORKER)) != queue.group(UUID(OTHER))
            assert WORKER not in queue.group(UUID(WORKER))
            assert queue.enqueue(UUID(WORKER), Preferences(**PREFS)) == {'status': 'queued'}
            await queue.queue.join()
            assert (await queue.recall(UUID(WORKER)))['preferences'] == PREFS
            assert (await queue.recall(UUID(OTHER)))['status'] == 'empty'
        finally:
            await queue.close()
    asyncio.run(scenario())


def test_forget_cancels_inflight_and_invalidates_queued_updates():
    async def scenario():
        memory = FakeMemory()
        memory.block = True
        queue = MemoryQueue(memory, SETTINGS)
        await queue.start()
        try:
            queue.enqueue(UUID(WORKER), Preferences(**PREFS))
            await memory.started.wait()
            queue.enqueue(UUID(OTHER), Preferences(**PREFS))
            assert (await queue.recall(UUID(WORKER)))['status'] == 'pending'
            assert await queue.forget(UUID(OTHER)) == {'status': 'forgotten'}
            assert await queue.forget(UUID(WORKER)) == {'status': 'forgotten'}
            memory.release.set()
            await asyncio.wait_for(queue.queue.join(), 1)
            assert memory.saved == {}
            assert (await queue.recall(UUID(WORKER)))['status'] == 'empty'
            await queue.forget(UUID(WORKER))  # idempotent
        finally:
            await queue.close()
    asyncio.run(scenario())


def test_ingestion_failure_never_claims_to_remember():
    class BrokenMemory(FakeMemory):
        async def ingest(self, group, preferences):
            raise RuntimeError('synthetic failure')

    async def scenario():
        queue = MemoryQueue(BrokenMemory(), SETTINGS)
        await queue.start()
        try:
            queue.enqueue(UUID(WORKER), Preferences(**PREFS))
            await queue.queue.join()
            assert (await queue.recall(UUID(WORKER)))['status'] == 'unavailable'
        finally:
            await queue.close()
    asyncio.run(scenario())


@pytest.mark.parametrize('url', [
    'https://api.openai.com/v1', 'http://example.com/v1',
    'http://localhost:11434/v1?redirect=cloud', 'http://localhost:11434/other',
])
def test_remote_provider_and_ambiguous_urls_rejected(url):
    with pytest.raises(ValueError):
        Settings(token='a' * 40, group_secret='b' * 40, neo4j_password='test', ollama_url=url)


def test_recall_http_is_private_and_does_not_cache():
    with TestClient(create_app(SETTINGS, FakeMemory())) as client:
        response = client.post('/v1/preferences/search', headers=AUTH, json={'worker_id': WORKER})
        assert response.json() == {'status': 'empty', 'preferences': None, 'facts': []}
        assert response.headers['cache-control'] == 'no-store'
        assert client.request('DELETE', '/v1/preferences', headers=AUTH,
                              json={'worker_id': WORKER}).json() == {'status': 'forgotten'}

