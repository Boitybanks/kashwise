"""Private, single-process Graphiti gateway. Run one worker bound to loopback."""

import asyncio
import hashlib
import hmac
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from models import SaveRequest, WorkerRequest
from settings import Settings

logger = logging.getLogger('kashwise.graphiti')


class MemoryQueue:
    def __init__(self, memory, settings):
        self.memory, self.settings = memory, settings
        self.queue = asyncio.Queue(maxsize=settings.queue_size)
        self.generations = {}
        self.pending = set()
        self.failed = set()
        self.active = None
        self.runner = None
        self.ready = False

    def group(self, worker_id):
        digest = hmac.new(self.settings.group_secret.encode(), str(worker_id).encode(), hashlib.sha256).hexdigest()
        return 'kashwise_' + digest

    async def start(self):
        try:
            await self.memory.start()
            self.ready = True
        except Exception as error:
            logger.warning('Graphiti unavailable at startup (%s)', type(error).__name__)
        self.runner = asyncio.create_task(self.run())

    async def close(self):
        if self.active:
            self.active[1].cancel()
        if self.runner:
            self.runner.cancel()
            with suppress(asyncio.CancelledError):
                await self.runner
        await self.memory.close()

    def enqueue(self, worker_id, preferences):
        if not self.ready:
            raise HTTPException(503, 'Local memory is unavailable')
        group = self.group(worker_id)
        if group in self.pending:
            raise HTTPException(409, 'A memory update is already pending; retry after it finishes')
        generation = self.generations.get(group, 0)
        try:
            self.queue.put_nowait((group, generation, preferences))
        except asyncio.QueueFull:
            raise HTTPException(429, 'Local memory queue is full; try again later') from None
        self.pending.add(group)
        self.failed.discard(group)
        return {'status': 'queued'}

    async def run(self):
        while True:
            group, generation, preferences = await self.queue.get()
            try:
                if generation != self.generations.get(group, 0):
                    continue  # Forgotten queued work must never resurrect data.
                task = asyncio.create_task(self.memory.ingest(group, preferences))
                self.active = (group, task)
                try:
                    await asyncio.wait_for(task, self.settings.ingest_timeout)
                except asyncio.CancelledError:
                    if asyncio.current_task().cancelling():
                        raise
                except Exception as error:
                    self.failed.add(group)
                    logger.warning('Graphiti update failed (%s)', type(error).__name__)
            finally:
                self.active = None
                if generation == self.generations.get(group, 0):
                    self.pending.discard(group)
                self.queue.task_done()

    async def recall(self, worker_id):
        group = self.group(worker_id)
        if not self.ready or group in self.failed:
            return {'status': 'unavailable', 'preferences': None, 'facts': []}
        if group in self.pending:
            return {'status': 'pending', 'preferences': None, 'facts': []}
        try:
            recalled = await asyncio.wait_for(self.memory.recall(group), self.settings.read_timeout)
            return {'status': 'ready' if recalled['preferences'] else 'empty', **recalled}
        except Exception as error:
            logger.warning('Graphiti recall failed (%s)', type(error).__name__)
            return {'status': 'unavailable', 'preferences': None, 'facts': []}

    async def forget(self, worker_id):
        group = self.group(worker_id)
        # Invalidate queued entries before yielding, then cancel and await an active write.
        self.generations[group] = self.generations.get(group, 0) + 1
        self.pending.add(group)  # Reject new writes until deletion commits.
        if self.active and self.active[0] == group:
            task = self.active[1]
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        try:
            await asyncio.wait_for(self.memory.forget(group), self.settings.read_timeout)
            self.failed.discard(group)
        except Exception as error:
            self.failed.add(group)
            logger.warning('Graphiti deletion failed (%s)', type(error).__name__)
            raise HTTPException(503, 'Memory deletion could not be confirmed; retry') from None
        finally:
            self.pending.discard(group)
        return {'status': 'forgotten'}


def create_app(settings=None, memory=None):
    settings = settings or Settings.from_env()
    if memory is None:
        from graph_memory import GraphMemory
        memory = GraphMemory(settings)
    queue = MemoryQueue(memory, settings)

    @asynccontextmanager
    async def lifespan(_app):
        await queue.start()
        yield
        await queue.close()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.memory_queue = queue

    @app.middleware('http')
    async def private_boundary(request: Request, call_next):
        # Includes health; this service is reachable only by the authenticated app backend.
        expected = 'Bearer ' + settings.token
        if not hmac.compare_digest(request.headers.get('authorization', '').encode(), expected.encode()):
            return JSONResponse({'detail': 'Unauthorized'}, status_code=401)
        body = b''
        async for chunk in request.stream():
            body += chunk
            if len(body) > 8192:
                return JSONResponse({'detail': 'Request too large'}, status_code=413)
        request._body = body
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request, _exception):
        # Do not echo rejected input (it may contain personal data).
        return JSONResponse({'detail': 'Invalid preferences or worker identifier'}, status_code=422)

    @app.get('/health')
    async def health():
        return {'status': 'ready' if queue.ready else 'unavailable', 'provider': 'ollama',
                'queued': queue.queue.qsize()}

    @app.post('/v1/preferences', status_code=202)
    async def save(body: SaveRequest):
        return queue.enqueue(body.worker_id, body.preferences)

    @app.post('/v1/preferences/search')
    async def recall(body: WorkerRequest):
        return await queue.recall(body.worker_id)

    @app.delete('/v1/preferences')
    async def forget(body: WorkerRequest):
        return await queue.forget(body.worker_id)

    return app

