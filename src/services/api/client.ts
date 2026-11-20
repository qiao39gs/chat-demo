import { translate, type TranslationMessage } from '../../i18n/index.js'
import { apiUrl, type ApiConnection } from './config.js'
import { readMessageEvent } from './parseEvent.js'
import { readServerSentEvents } from './sse.js'
import type {
  ApiErrorBody,
  ApiModel,
  CreateMessageRequest,
  FileObject,
  FilePurpose,
  MessageStreamEvent,
} from './types.js'

/** 引用 Files API 上传的图片、调用 Anthropic 兼容 Files API 时必须携带 */
const FILES_BETA = 'files-api-2025-04-14'

export type ApiErrorKind =
  /** 非 2xx 响应 */
  | 'http'
  /** 流中返回的错误帧（如等待生成超时），随后连接关闭 */
  | 'stream'
  /** 请求没有到达服务端（断网、跨域被拦截等） */
  | 'network'
  /** 流在 message_stop 之前结束 */
  | 'interrupted'
  /** 响应不符合协议（如非 SSE 响应） */
  | 'protocol'

export class ApiError extends Error {
  readonly localMessage?: TranslationMessage

  constructor(
    readonly kind: ApiErrorKind,
    message: string | TranslationMessage,
    readonly status?: number
  ) {
    super(typeof message === 'string' ? message : translate(message.key, message.params))
    this.name = 'ApiError'
    this.localMessage = typeof message === 'string' ? undefined : message
  }
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof (value as ApiErrorBody).error?.message === 'string'

const readErrorResponse = async (
  response: Response,
  kind: 'http' | 'protocol' = 'http',
  fallback = response.statusText
): Promise<ApiError> => {
  const text = await response.text().catch(() => '')
  let message = text || fallback
  try {
    const body: unknown = JSON.parse(text)
    if (isErrorBody(body)) {
      message = body.error.message
    }
  } catch {
    // 非 JSON 响应体直接展示原文
  }
  return new ApiError(kind, message, response.status)
}

export const request = async (url: string, init: RequestInit): Promise<Response> => {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (init.signal?.aborted) {
      throw error
    }
    throw new ApiError('network', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    throw await readErrorResponse(response)
  }
  return response
}

const anthropicHeaders = (apiKey: string, beta: boolean): Record<string, string> => ({
  // DeepSeek 兼容接口的鉴权方式，也可使用 Authorization: Bearer。
  'x-api-key': apiKey,
  // Files API 和通过 file_id 引用图片时必传；纯文本聊天无需携带。
  ...(beta ? { 'anthropic-beta': FILES_BETA } : {}),
})

/** 用 GET /models 校验 API 地址与 Key（不产生费用） */
export const verifyApiConnection = async (
  connection: ApiConnection,
  signal?: AbortSignal
): Promise<void> => {
  await request(apiUrl(connection.baseUrl, '/models'), {
    method: 'GET',
    headers: { Authorization: `Bearer ${connection.apiKey}` },
    signal,
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * 读取模型列表：兼容 OpenAI 风格的 { data: [...] }、{ models: [...] } 与直接返回数组。
 * 条目可以是模型 ID 字符串或带 id / name / display_name 的对象。
 */
const parseModels = (body: unknown): ApiModel[] | null => {
  const list = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.data)
      ? body.data
      : isRecord(body) && Array.isArray(body.models)
        ? body.models
        : null
  if (!list) {
    return null
  }
  const seen = new Set<string>()
  const models: ApiModel[] = []
  for (const value of list) {
    const record = isRecord(value) ? value : null
    const id =
      typeof value === 'string'
        ? value.trim()
        : typeof record?.id === 'string'
          ? record.id.trim()
          : typeof record?.name === 'string'
            ? record.name.trim()
            : ''
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    const displayName =
      typeof record?.display_name === 'string' && record.display_name.trim()
        ? record.display_name.trim()
        : typeof record?.name === 'string' && record.name.trim() && record.name.trim() !== id
          ? record.name.trim()
          : id
    models.push({ id, name: displayName })
  }
  return models
}

/** 获取当前 API 服务可用的模型列表；响应格式无法识别时按协议错误处理。 */
export const fetchModels = async (
  connection: ApiConnection,
  signal?: AbortSignal
): Promise<ApiModel[]> => {
  const response = await request(apiUrl(connection.baseUrl, '/models'), {
    method: 'GET',
    headers: { Authorization: `Bearer ${connection.apiKey}` },
    signal,
  })
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError('protocol', { key: 'apiModelsInvalidResponse' })
  }
  const models = parseModels(body)
  if (!models) {
    throw new ApiError('protocol', { key: 'apiModelsInvalidResponse' })
  }
  return models
}

/**
 * POST /anthropic/v1/files 上传附件（不设过期时间，会话里的历史附件一直可用）。
 * purpose 为 null 时不传该字段（图片）；purpose 必须排在 file 之前。
 */
export const uploadFile = async (
  connection: ApiConnection,
  file: File,
  purpose: FilePurpose | null,
  signal?: AbortSignal
): Promise<FileObject> => {
  const form = new FormData()
  if (purpose) {
    form.append('purpose', purpose)
  }
  form.append('file', file)
  const response = await request(apiUrl(connection.baseUrl, '/anthropic/v1/files'), {
    method: 'POST',
    headers: anthropicHeaders(connection.apiKey, true),
    body: form,
    signal,
  })
  return (await response.json()) as FileObject
}

/** DELETE /anthropic/v1/files/{file_id} */
export const deleteFile = async (connection: ApiConnection, fileId: string): Promise<void> => {
  await request(apiUrl(connection.baseUrl, `/anthropic/v1/files/${encodeURIComponent(fileId)}`), {
    method: 'DELETE',
    headers: anthropicHeaders(connection.apiKey, true),
  })
}

const hasFile = (body: CreateMessageRequest) =>
  body.messages.some(
    (message) =>
      typeof message.content !== 'string' &&
      message.content.some((block) => block.type === 'image' || block.type === 'document')
  )

/**
 * POST /anthropic/v1/messages（stream: true），逐个产出流式事件，收到 message_stop 时结束。
 * ping、保活注释与无法解析的内容不产出；中止请求时抛出 signal 的 AbortError。
 */
export async function* streamMessage(
  connection: ApiConnection,
  body: CreateMessageRequest,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  const response = await request(apiUrl(connection.baseUrl, '/anthropic/v1/messages'), {
    method: 'POST',
    headers: {
      ...anthropicHeaders(connection.apiKey, hasFile(body)),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readErrorResponse(response, 'protocol', '')
  }
  for await (const { event: eventName, data } of readServerSentEvents(response.body, signal)) {
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      if (eventName !== 'error') {
        continue
      }
    }
    if (isErrorBody(payload)) {
      throw new ApiError('stream', payload.error.message)
    }
    if (eventName === 'error') {
      throw new ApiError('stream', data)
    }
    const event = readMessageEvent(payload)
    if (!event) {
      continue
    }
    yield event
    if (event.type === 'message_stop') {
      return
    }
  }
  // 服务端没有提供错误内容时保持为空，不推测断流原因。
  throw new ApiError('interrupted', '')
}
