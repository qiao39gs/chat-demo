import { create } from 'zustand'
import { createId } from '../utils/id.js'
import { DEFAULT_API_BASE_URL, normalizeApiBaseUrl, type ApiConnection } from './api/config.js'
import type { TtsVoice } from './api/speech.js'
import { normalizeLocation, type UserLocation } from './location.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 内置的默认模型；旧配置和未指定模型时使用 */
export const DEFAULT_MODEL = 'deepseek-flash'

/** 一组可在设置中保存和切换的 API 配置 */
export type ApiConfig = ApiConnection & {
  id: string
  name: string
  /** 对话请求使用的模型 ID，可自定义 */
  model: string
  /** 最近一次从 GET /models 获取的模型 ID，用于快速切换 */
  models: string[]
}

type ApiConfigInput = ApiConnection & {
  name: string
  model?: string
  models?: string[]
}

/** 本机设置，存 localStorage：API 配置、语言、主题、位置、朗读音色、深度思考与智能搜索开关、侧边栏收起状态 */
type Settings = {
  apiConfigs: ApiConfig[]
  activeApiConfigId: string | null
  locale: Locale
  themePreference: ThemePreference
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  search: boolean
  siderCollapsed: boolean
}

const KEYS = {
  /** 旧版本只保存一个 API Key，启动时迁移为一组默认配置 */
  legacyApiKey: 'chat-demo:api-key',
  apiConfigs: 'chat-demo:api-configs',
  activeApiConfig: 'chat-demo:active-api-config',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  siderCollapsed: 'chat-demo:sider-collapsed',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 未保存过时使用服务端默认音色 stella（海星） */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'tide' ? 'tide' : 'stella')

/** 模型列表去重并去掉空白项，保持接口返回顺序 */
const normalizeModels = (models: readonly unknown[] | undefined): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const model of models ?? []) {
    if (typeof model !== 'string') {
      continue
    }
    const id = model.trim()
    if (id && !seen.has(id)) {
      seen.add(id)
      result.push(id)
    }
  }
  return result
}

/** 读取已保存的配置，丢弃损坏或缺少地址、Key 的条目 */
const readApiConfigs = (): ApiConfig[] => {
  try {
    const saved: unknown = JSON.parse(read(KEYS.apiConfigs) ?? 'null')
    if (!Array.isArray(saved)) {
      return []
    }
    return saved.flatMap((item): ApiConfig[] => {
      if (typeof item !== 'object' || item === null) {
        return []
      }
      const record = item as Record<string, unknown>
      const baseUrl = typeof record.baseUrl === 'string' ? normalizeApiBaseUrl(record.baseUrl) : ''
      const apiKey = typeof record.apiKey === 'string' ? record.apiKey.trim() : ''
      if (!baseUrl || !apiKey) {
        return []
      }
      return [
        {
          id: typeof record.id === 'string' && record.id ? record.id : createId(),
          name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'API',
          baseUrl,
          apiKey,
          model:
            typeof record.model === 'string' && record.model.trim()
              ? record.model.trim()
              : DEFAULT_MODEL,
          models: normalizeModels(Array.isArray(record.models) ? record.models : undefined),
        },
      ]
    })
  } catch {
    return []
  }
}

const initialApiConfig = (): { configs: ApiConfig[]; activeId: string | null } => {
  const configs = readApiConfigs()
  if (configs.length > 0) {
    const savedActive = read(KEYS.activeApiConfig)
    return {
      configs,
      activeId: configs.some((config) => config.id === savedActive) ? savedActive : configs[0].id,
    }
  }
  const legacyApiKey = read(KEYS.legacyApiKey)?.trim()
  if (legacyApiKey) {
    const migrated: ApiConfig = {
      id: createId(),
      name: isChineseBrowser() ? '默认配置' : 'Default',
      baseUrl: normalizeApiBaseUrl(DEFAULT_API_BASE_URL),
      apiKey: legacyApiKey,
      model: DEFAULT_MODEL,
      models: [],
    }
    write(KEYS.apiConfigs, JSON.stringify([migrated]))
    write(KEYS.activeApiConfig, migrated.id)
    write(KEYS.legacyApiKey, null)
    return { configs: [migrated], activeId: migrated.id }
  }
  return { configs: [], activeId: null }
}

const initialApi = initialApiConfig()

export const useSettings = create<Settings>(() => ({
  apiConfigs: initialApi.configs,
  activeApiConfigId: initialApi.activeId,
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
}))

/** 当前生效的配置；没有选中项时退回第一组，便于修复本地残留数据 */
export const getActiveApiConfig = (): ApiConfig | null => {
  const { apiConfigs, activeApiConfigId } = useSettings.getState()
  return apiConfigs.find((config) => config.id === activeApiConfigId) ?? apiConfigs[0] ?? null
}

/** 请求层使用的连接信息；没有配置时返回默认地址与空 Key，由调用方先引导设置 */
export const getActiveApiConnection = (): ApiConnection => {
  const config = getActiveApiConfig()
  return config
    ? { baseUrl: config.baseUrl, apiKey: config.apiKey }
    : { baseUrl: normalizeApiBaseUrl(DEFAULT_API_BASE_URL), apiKey: '' }
}

/** 当前配置使用的模型；没有配置时使用内置默认模型 */
export const getActiveApiModel = (): string => getActiveApiConfig()?.model ?? DEFAULT_MODEL

const saveApiConfigs = (apiConfigs: ApiConfig[], activeApiConfigId: string | null) => {
  write(KEYS.apiConfigs, apiConfigs.length > 0 ? JSON.stringify(apiConfigs) : null)
  write(KEYS.activeApiConfig, activeApiConfigId)
  useSettings.setState({ apiConfigs, activeApiConfigId })
}

export const setActiveApiConfig = (id: string) => {
  const { apiConfigs } = useSettings.getState()
  if (apiConfigs.some((config) => config.id === id)) {
    saveApiConfigs(apiConfigs, id)
  }
}

/** 新增后立即设为当前配置 */
export const addApiConfig = (config: ApiConfigInput): ApiConfig => {
  const created: ApiConfig = {
    id: createId(),
    name: config.name.trim(),
    baseUrl: normalizeApiBaseUrl(config.baseUrl),
    apiKey: config.apiKey.trim(),
    model: config.model?.trim() || DEFAULT_MODEL,
    models: normalizeModels(config.models),
  }
  saveApiConfigs([...useSettings.getState().apiConfigs, created], created.id)
  return created
}

export const updateApiConfig = (id: string, config: ApiConfigInput) => {
  const { apiConfigs, activeApiConfigId } = useSettings.getState()
  saveApiConfigs(
    apiConfigs.map((item) =>
      item.id === id
        ? {
            ...item,
            name: config.name.trim(),
            baseUrl: normalizeApiBaseUrl(config.baseUrl),
            apiKey: config.apiKey.trim(),
            model: config.model?.trim() || item.model,
            models: config.models ? normalizeModels(config.models) : item.models,
          }
        : item
    ),
    activeApiConfigId
  )
}

/** 切换当前配置使用的模型；聊天输入框的模型菜单也走这里 */
export const setActiveModel = (model: string) => {
  const value = model.trim()
  const { apiConfigs, activeApiConfigId } = useSettings.getState()
  const active =
    apiConfigs.find((config) => config.id === activeApiConfigId) ?? apiConfigs[0] ?? null
  if (!value || !active || active.model === value) {
    return
  }
  saveApiConfigs(
    apiConfigs.map((config) => (config.id === active.id ? { ...config, model: value } : config)),
    activeApiConfigId
  )
}

/** 删除当前配置时自动切换到剩余的第一组 */
export const removeApiConfig = (id: string) => {
  const { apiConfigs, activeApiConfigId } = useSettings.getState()
  const remaining = apiConfigs.filter((config) => config.id !== id)
  saveApiConfigs(
    remaining,
    activeApiConfigId === id ? (remaining[0]?.id ?? null) : activeApiConfigId
  )
}

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}
