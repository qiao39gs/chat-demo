/** 构建期默认 API 地址，可通过 rspack 的 apiOrigin 自定义 */
export const DEFAULT_API_BASE_URL = __API_ORIGIN__

/** 一组 API 地址与 Key；设置中可保存多组并按需切换 */
export type ApiConnection = {
  baseUrl: string
  apiKey: string
}

/**
 * 规范化 API 地址：去掉首尾空白、结尾的 / 与路径末尾的 /v1。
 * DeepSeek 文档允许地址带 /v1，这里统一按服务根地址保存和拼接。
 */
export const normalizeApiBaseUrl = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, '')
  try {
    const url = new URL(trimmed)
    const path = url.pathname.replace(/\/+$/, '').replace(/\/v1$/i, '')
    return `${url.protocol}//${url.host}${path}`
  } catch {
    return trimmed
  }
}

/** 拼接服务端接口地址，path 以 / 开头 */
export const apiUrl = (baseUrl: string, path: string) => `${normalizeApiBaseUrl(baseUrl)}${path}`
