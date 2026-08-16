// Minimal typed client for Moonshot's Kimi API (OpenAI-compatible chat
// completions). Powers every LLM feature in the app: the SEO article
// generator, the admin SEO tools, and i18n translations.
//
// Env:
//   MOONSHOT_API_KEY — required, from platform.kimi.ai
//   KIMI_MODEL       — optional override, defaults to kimi-k2.5 (kimi-k3 and
//                      k2.6-thinking have incompatible parameter schemas)

const KIMI_API_URL = 'https://api.moonshot.ai/v1/chat/completions'

export interface KimiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface KimiChatOptions {
  maxTokens: number
  // Ask for a JSON-only response (response_format: json_object). Only use when
  // the prompt already instructs JSON output.
  json?: boolean
}

// Tool (function) the model can be forced to call — JSON-schema shaped.
export interface KimiTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

interface KimiChatCompletion {
  choices: {
    message: {
      content: string | null
      tool_calls?: { function: { name: string; arguments: string } }[]
    }
  }[]
}

interface KimiStreamChunk {
  choices: { delta: { content?: string } }[]
}

function getApiKey(): string {
  if (!process.env.MOONSHOT_API_KEY) {
    throw new Error('MOONSHOT_API_KEY environment variable is not set')
  }
  return process.env.MOONSHOT_API_KEY
}

function getModel(): string {
  return process.env.KIMI_MODEL || 'kimi-k2.5'
}

async function postChat(body: Record<string, unknown>): Promise<Response> {
  const res = await fetch(KIMI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Kimi API error ${res.status}: ${await res.text()}`)
  }
  return res
}

// Non-streaming completion — returns the assistant message text.
export async function kimiChat(messages: KimiMessage[], opts: KimiChatOptions): Promise<string> {
  const res = await postChat({
    model: getModel(),
    messages,
    max_tokens: opts.maxTokens,
    ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
  })
  const data = (await res.json()) as KimiChatCompletion
  return data.choices[0]?.message?.content ?? ''
}

// Non-streaming completion with a single forced tool call. Returns the tool's
// parsed arguments, plus any plain-text content (for callers that fall back to
// treating a text answer as the result).
export async function kimiChatToolCall(
  messages: KimiMessage[],
  tool: KimiTool,
  opts: { maxTokens: number }
): Promise<{ args: Record<string, unknown> | null; text: string }> {
  const res = await postChat({
    model: getModel(),
    messages,
    max_tokens: opts.maxTokens,
    tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }],
    tool_choice: { type: 'function', function: { name: tool.name } },
  })
  const data = (await res.json()) as KimiChatCompletion
  const message = data.choices[0]?.message
  const call = message?.tool_calls?.[0]
  return {
    args: call ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : null,
    text: message?.content ?? '',
  }
}

// Streaming completion — yields text deltas from the SSE stream
// (`data: {...}` lines with choices[0].delta.content, ended by `data: [DONE]`).
export async function* kimiChatStream(
  messages: KimiMessage[],
  opts: KimiChatOptions
): AsyncGenerator<string> {
  const res = await postChat({
    model: getModel(),
    messages,
    max_tokens: opts.maxTokens,
    stream: true,
  })
  if (!res.body) {
    throw new Error('Kimi API returned no response body')
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice('data:'.length).trim()
        if (payload === '[DONE]') return
        const chunk = JSON.parse(payload) as KimiStreamChunk
        const delta = chunk.choices[0]?.delta?.content
        if (delta) yield delta
      }
    }
  } finally {
    reader.releaseLock()
  }
}
