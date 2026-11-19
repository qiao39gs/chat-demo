import type { MessageUsage } from '../api/types.js'
import type { AssistantMessage, Message } from './types.js'

/** 输入 token：未命中缓存 + 缓存创建 + 缓存读取，即本轮请求的完整输入。 */
export const getInputTokens = (usage: MessageUsage | undefined): number | null =>
  usage
    ? usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens
    : null

/** 输出 token；没有用量记录时为 null。 */
export const getOutputTokens = (usage: MessageUsage | undefined): number | null =>
  usage ? usage.output_tokens : null

/** 回复速度（token/s）：输出 token / 生成耗时；缺少用量或耗时时无法计算。 */
export const getReplySpeed = (reply: AssistantMessage): number | null => {
  if (!reply.usage || reply.durationMs === undefined || reply.durationMs <= 0) {
    return null
  }
  return reply.usage.output_tokens > 0
    ? reply.usage.output_tokens / (reply.durationMs / 1000)
    : null
}

/** 当前分支的累计用量：每轮输入（含历史上下文）与输出之和。 */
export type TokenUsageSummary = {
  input: number
  output: number
  total: number
  replies: number
}

export const summarizeTokenUsage = (messages: readonly Message[]): TokenUsageSummary => {
  let input = 0
  let output = 0
  let replies = 0
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.usage) {
      continue
    }
    input += getInputTokens(message.usage) ?? 0
    output += message.usage.output_tokens
    replies += 1
  }
  return { input, output, total: input + output, replies }
}

/** 每个提问对应的本轮输入 token，取自当前分支上紧随其后的回答。 */
export const getQuestionInputTokens = (messages: readonly Message[]): Map<string, number> => {
  const tokens = new Map<string, number>()
  for (let index = 0; index + 1 < messages.length; index += 1) {
    const question = messages[index]
    const reply = messages[index + 1]
    if (question.role !== 'user' || reply.role !== 'assistant') {
      continue
    }
    const input = getInputTokens(reply.usage)
    if (input !== null) {
      tokens.set(question.id, input)
    }
  }
  return tokens
}
