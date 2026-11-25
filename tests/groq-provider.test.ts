// Keep these transport-contract checks independent of credentials and provider availability.
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { requestGroq, GROQ_MODEL } from '../netlify/lib/groq'

const request = {
  apiKey: 'test-only',
  name: 'test_draft',
  schema: { type: 'object', properties: {}, additionalProperties: false },
  system: 'Return JSON.',
  user: 'Sample transcript.',
  maxTokens: 80,
  timeoutMs: 5000,
}

async function checkResponse(response: () => Response, expected: unknown) {
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions')
    assert.equal(options?.redirect, 'error')
    const body = JSON.parse(String(options?.body))
    assert.equal(body.model, GROQ_MODEL)
    assert.equal(body.response_format.json_schema.strict, true)
    return response()
  }
  try {
    assert.deepEqual(await requestGroq(request), expected)
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = previous
  }
}

test('parses a completed Groq response', async () => {
  const message = { content: '{"answer":"ok"}' }
  await checkResponse(() => Response.json({ choices: [{ finish_reason: 'stop', message }] }), {
    status: 'ok', output: { answer: 'ok' },
  })
})

for (const [code, status] of [[401, 'auth'], [403, 'auth'], [429, 'rate_limited'], [503, 'api_error']] as const) {
  test(`returns control to the caller after HTTP ${code}`, async () => {
    await checkResponse(() => new Response(null, { status: code }), { status })
  })
}

test('handles a provider refusal', async () => {
  await checkResponse(() => Response.json({ choices: [{ message: { refusal: 'Declined' } }] }), { status: 'refused' })
})

test('rejects truncated or malformed writing', async () => {
  for (const [finish_reason, content] of [['length', '{}'], ['stop', '???']]) {
    await checkResponse(() => Response.json({ choices: [{ finish_reason, message: { content } }] }), { status: 'failed' })
  }
})

test('handles a network failure', async () => {
  await checkResponse(() => { throw new Error('offline') }, { status: 'failed' })
})
