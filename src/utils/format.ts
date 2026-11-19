const pad = (value: number, length = 2): string => String(value).padStart(length, '0')

const toDate = (value: string | number | Date): Date | null => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatDate = (
  value: string | number | Date,
  separator: '/' | '-' = '-'
): string | null => {
  const date = toDate(value)
  if (!date) {
    return null
  }
  return [pad(date.getFullYear(), 4), pad(date.getMonth() + 1), pad(date.getDate())].join(separator)
}

export const monthKey = (value: string | number | Date): string | null => {
  const date = toDate(value)
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}` : null
}

const tokenFormats = new Map<string, Intl.NumberFormat>()

/** token 数按当前语言添加千位分隔符 */
export const formatTokenCount = (value: number, locale: string): string => {
  let format = tokenFormats.get(locale)
  if (!format) {
    format = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
    tokenFormats.set(locale, format)
  }
  return format.format(value)
}

/** 生成速度保留一位小数，超过 100 后取整 */
export const formatTokenSpeed = (value: number): string => {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10
  return String(rounded)
}
