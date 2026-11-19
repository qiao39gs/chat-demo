import { create } from 'zustand'
import { getActiveApiConfig } from '../../services/settings.js'

/** 设置弹窗的分组：通用设置 / API 配置 / 助手 / 数据管理 */
export type SettingsSection = 'general' | 'api' | 'assistants' | 'data'

/** 设置弹窗：侧边栏底部、没有 API 配置时的操作与 401 提示都可以打开；section 为打开时选中的分组 */
export const useSettingsDialog = create(() => ({
  open: false,
  section: 'general' as SettingsSection,
}))

export const openSettings = (section: SettingsSection) =>
  useSettingsDialog.setState({ open: true, section })

export const closeSettings = () => useSettingsDialog.setState({ open: false })

/** 没有可用的 API 配置时打开设置并选中「API 配置」，返回是否已有配置 */
export const ensureApiKey = () => {
  if (getActiveApiConfig()?.apiKey) {
    return true
  }
  openSettings('api')
  return false
}
