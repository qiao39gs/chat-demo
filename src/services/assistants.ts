import { create } from 'zustand'
import { createId } from '../utils/id.js'

/** 助手：名称用于分组展示，系统提示词随该助手的每次生成请求发送。 */
export type Assistant = {
  id: string
  name: string
  systemPrompt: string
  createdAt: number
}

/** 内置默认助手，旧会话与未指定助手的会话都归到它名下；不可删除。 */
export const DEFAULT_ASSISTANT_ID = 'default'

const DEFAULT_ASSISTANT: Assistant = {
  id: DEFAULT_ASSISTANT_ID,
  name: 'DeepSeek',
  systemPrompt: '该助手为DeepSeek，由深度求索公司创造。',
  createdAt: 0,
}

const STORAGE_KEY = 'chat-demo:assistants'

type AssistantSettings = {
  assistants: Assistant[]
  /** 新对话默认使用的助手 */
  selectedId: string
  /** 侧边栏中收起的助手分组 */
  collapsedIds: string[]
}

const defaultSettings = (): AssistantSettings => ({
  assistants: [DEFAULT_ASSISTANT],
  selectedId: DEFAULT_ASSISTANT_ID,
  collapsedIds: [],
})

const parseAssistant = (value: unknown): Assistant | null => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const item = value as Record<string, unknown>
  if (
    typeof item.id !== 'string' ||
    !item.id ||
    typeof item.name !== 'string' ||
    !item.name.trim()
  ) {
    return null
  }
  return {
    id: item.id,
    name: item.name.trim(),
    systemPrompt: typeof item.systemPrompt === 'string' ? item.systemPrompt : '',
    createdAt:
      typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : 0,
  }
}

/** 读取并校验本地设置：去重、保证默认助手存在且排在最前，失效的选择回落到默认助手。 */
const readSettings = (): AssistantSettings => {
  let raw: unknown
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
  } catch {
    return defaultSettings()
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaultSettings()
  }
  const stored = raw as Record<string, unknown>
  const assistants: Assistant[] = []
  const seen = new Set<string>()
  if (Array.isArray(stored.assistants)) {
    for (const value of stored.assistants) {
      const assistant = parseAssistant(value)
      if (assistant && !seen.has(assistant.id)) {
        seen.add(assistant.id)
        assistants.push(assistant)
      }
    }
  }
  const defaultIndex = assistants.findIndex((assistant) => assistant.id === DEFAULT_ASSISTANT_ID)
  if (defaultIndex === -1) {
    assistants.unshift(DEFAULT_ASSISTANT)
  } else if (defaultIndex > 0) {
    const [fallback] = assistants.splice(defaultIndex, 1)
    if (fallback) {
      assistants.unshift(fallback)
    }
  }
  const ids = new Set(assistants.map((assistant) => assistant.id))
  return {
    assistants,
    selectedId:
      typeof stored.selectedId === 'string' && ids.has(stored.selectedId)
        ? stored.selectedId
        : DEFAULT_ASSISTANT_ID,
    collapsedIds: Array.isArray(stored.collapsedIds)
      ? stored.collapsedIds.filter((id): id is string => typeof id === 'string' && ids.has(id))
      : [],
  }
}

export const useAssistants = create<AssistantSettings>(readSettings)

const commit = (settings: AssistantSettings) => {
  useAssistants.setState(settings)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 按 id 找助手；找不到（如助手已删除）或未指定时回落到默认助手。 */
export const findAssistant = (
  assistants: readonly Assistant[],
  id: string | null | undefined
): Assistant =>
  assistants.find((assistant) => assistant.id === id) ??
  assistants.find((assistant) => assistant.id === DEFAULT_ASSISTANT_ID) ??
  assistants[0] ??
  DEFAULT_ASSISTANT

/** 组件订阅指定助手；助手改名或修改提示词后自动更新。 */
export const useAssistant = (id: string | null | undefined): Assistant =>
  useAssistants((state) => findAssistant(state.assistants, id))

/** 请求使用的系统提示词；空字符串表示不附加系统提示词。 */
export const getAssistantSystemPrompt = (id: string | null | undefined): string =>
  findAssistant(useAssistants.getState().assistants, id).systemPrompt

export const selectAssistant = (id: string) => {
  const settings = useAssistants.getState()
  if (settings.selectedId === id || !settings.assistants.some((assistant) => assistant.id === id)) {
    return
  }
  commit({ ...settings, selectedId: id })
}

export const addAssistant = (name: string, systemPrompt: string): Assistant | null => {
  const trimmed = name.trim()
  if (!trimmed) {
    return null
  }
  const assistant: Assistant = {
    id: createId(),
    name: trimmed,
    systemPrompt,
    createdAt: Date.now(),
  }
  const settings = useAssistants.getState()
  commit({
    assistants: [...settings.assistants, assistant],
    // 新建后下次开启新对话直接使用它
    selectedId: assistant.id,
    collapsedIds: settings.collapsedIds,
  })
  return assistant
}

export const updateAssistant = (
  id: string,
  update: { name: string; systemPrompt: string }
): boolean => {
  const name = update.name.trim()
  const settings = useAssistants.getState()
  if (!name || !settings.assistants.some((assistant) => assistant.id === id)) {
    return false
  }
  commit({
    ...settings,
    assistants: settings.assistants.map((assistant) =>
      assistant.id === id ? { ...assistant, name, systemPrompt: update.systemPrompt } : assistant
    ),
  })
  return true
}

/** 删除助手配置；默认助手不可删除，其余助手的会话需由调用方先迁移。 */
export const removeAssistant = (id: string): boolean => {
  if (id === DEFAULT_ASSISTANT_ID) {
    return false
  }
  const settings = useAssistants.getState()
  const assistants = settings.assistants.filter((assistant) => assistant.id !== id)
  if (assistants.length === settings.assistants.length) {
    return false
  }
  commit({
    assistants,
    selectedId: settings.selectedId === id ? DEFAULT_ASSISTANT_ID : settings.selectedId,
    collapsedIds: settings.collapsedIds.filter((collapsedId) => collapsedId !== id),
  })
  return true
}

export const setAssistantCollapsed = (id: string, collapsed: boolean) => {
  const settings = useAssistants.getState()
  if (
    !settings.assistants.some((assistant) => assistant.id === id) ||
    settings.collapsedIds.includes(id) === collapsed
  ) {
    return
  }
  commit({
    ...settings,
    collapsedIds: collapsed
      ? [...settings.collapsedIds, id]
      : settings.collapsedIds.filter((collapsedId) => collapsedId !== id),
  })
}

export const toggleAssistantCollapsed = (id: string) => {
  const collapsed = useAssistants.getState().collapsedIds.includes(id)
  setAssistantCollapsed(id, !collapsed)
}
