// Shared by the opt-in writing features. A failed request returns control to the rules-based writer.
export const GROQ_MODEL = 'openai/gpt-oss-120b'

interface WritingRequest {
  apiKey: string
  name: string
  schema: Record<string, unknown>
  system: string
  user: string
  maxTokens: number
  timeoutMs: number
}

type WritingResult =
  | { status: 'ok'; output: unknown }
  | { status: 'auth' | 'rate_limited' | 'api_error' | 'refused' | 'failed' }

export async function requestGroq(request: WritingRequest): Promise<WritingResult> {
  const schema = { ...request.schema }
  delete schema.$schema
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      redirect: 'error',
      headers: { authorization: `Bearer ${request.apiKey}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(request.timeoutMs),
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_completion_tokens: request.maxTokens,
        reasoning_effort: 'low',
        response_format: { type: 'json_schema', json_schema: { name: request.name, strict: true, schema } },
        messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.user }],
      }),
    })
    if (res.status === 401 || res.status === 403) return { status: 'auth' }
    if (res.status === 429) return { status: 'rate_limited' }
    if (!res.ok) return { status: 'api_error' }
    const { choices } = await res.json()
    const choice = choices?.[0]
    if (choice?.message?.refusal) return { status: 'refused' }
    if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') return { status: 'failed' }
    return { status: 'ok', output: JSON.parse(choice.message.content) }
  } catch {
    return { status: 'failed' }
  }
}
