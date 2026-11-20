import clsx from 'clsx'
import { useState } from 'react'
import { classifyApiError } from '../../services/api/errors.js'
import { ApiError, fetchModels, verifyApiConnection } from '../../services/api/client.js'
import {
  DEFAULT_API_BASE_URL,
  normalizeApiBaseUrl,
  type ApiConnection,
} from '../../services/api/config.js'
import {
  addApiConfig,
  DEFAULT_MODEL,
  removeApiConfig,
  setActiveApiConfig,
  updateApiConfig,
  useSettings,
  type ApiConfig,
} from '../../services/settings.js'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { IconEditOutline16, IconPlusOutline16, IconTrashOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import styles from './Settings.module.css'

/** 本地展示的 Key 掩码，避免配置列表过长 */
const maskApiKey = (apiKey: string) => '*'.repeat(Math.min(apiKey.length, 24))

/** API 配置：保存多组名称、地址与 Key，选中项用于之后的请求 */
export const ApiConfigsSetting = () => {
  const t = useTranslate()
  const configs = useSettings((state) => state.apiConfigs)
  const activeId = useSettings((state) => state.activeApiConfigId) ?? configs[0]?.id ?? null
  const [editing, setEditing] = useState<ApiConfig | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ApiConfig | null>(null)

  return (
    <div className={styles.cell}>
      <div className={clsx(styles.row, styles.apiConfigHeader)}>
        <div className={styles.text}>
          <div className={styles.label}>{t('apiConfigsTitle')}</div>
          <div className={styles.description}>{t('apiConfigsDescription')}</div>
        </div>
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          onClick={() => setEditing('new')}
        >
          <IconPlusOutline16 />
          {t('apiConfigAdd')}
        </Button>
      </div>
      {configs.length === 0 ? (
        <div className={styles.configEmpty}>{t('apiConfigEmpty')}</div>
      ) : (
        <div className={styles.configList}>
          {configs.map((config) => {
            const active = config.id === activeId
            return (
              <div
                key={config.id}
                className={clsx(styles.configItem, active && styles.configItemActive)}
              >
                <label className={styles.configSelect}>
                  <input
                    type="radio"
                    name="api-config"
                    className={styles.configRadio}
                    checked={active}
                    onChange={() => setActiveApiConfig(config.id)}
                  />
                  <span className={styles.configInfo}>
                    <span className={styles.configName}>
                      <span className={styles.configNameText}>{config.name}</span>
                      {active ? (
                        <span className={styles.configBadge}>{t('apiConfigActive')}</span>
                      ) : null}
                    </span>
                    <span className={styles.configMeta}>{config.model}</span>
                    <span className={styles.configMeta}>{config.baseUrl}</span>
                    <span className={styles.configMeta}>{maskApiKey(config.apiKey)}</span>
                  </span>
                </label>
                <div className={styles.configActions}>
                  <IconButton
                    icon={<IconEditOutline16 />}
                    tooltip={t('apiConfigEdit')}
                    onClick={() => setEditing(config)}
                  />
                  <IconButton
                    icon={<IconTrashOutline16 />}
                    tooltip={t('delete')}
                    onClick={() => setDeleting(config)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
      {editing ? (
        <ApiConfigForm
          config={editing === 'new' ? null : editing}
          count={configs.length}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {deleting ? <DeleteApiConfig config={deleting} onClose={() => setDeleting(null)} /> : null}
    </div>
  )
}

/** 校验并规范化用户填写的 API 地址；只接受 http(s)，且不带查询和锚点 */
const parseBaseUrl = (value: string): string | null => {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null
  }
  return normalizeApiBaseUrl(url.href)
}

type FormFailure = { cause: unknown }

const ApiConfigForm = ({
  config,
  count,
  onClose,
}: {
  config: ApiConfig | null
  count: number
  onClose: () => void
}) => {
  const t = useTranslate()
  const [name, setName] = useState(
    () => config?.name ?? t('apiConfigDefaultName', { count: count + 1 })
  )
  const [baseUrl, setBaseUrl] = useState(
    () => config?.baseUrl ?? normalizeApiBaseUrl(DEFAULT_API_BASE_URL)
  )
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(() => config?.model ?? DEFAULT_MODEL)
  const [models, setModels] = useState(() => config?.models ?? [])
  const [error, setError] = useState<TranslationKey | null>(null)
  const [failure, setFailure] = useState<FormFailure | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [modelStatus, setModelStatus] = useState<string | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)

  const describeFailure = (cause: unknown): string => {
    switch (classifyApiError(cause)) {
      case 'unauthorized':
        return t('apiKeyInvalid')
      case 'network':
        return t('commonNetworkErrorToast')
      default:
        return t('apiKeyVerificationFailed', {
          message:
            cause instanceof ApiError && cause.localMessage
              ? t(cause.localMessage.key, cause.localMessage.params)
              : cause instanceof Error
                ? cause.message
                : String(cause),
        })
    }
  }

  const fetchModelList = async () => {
    if (fetchingModels || verifying) {
      return
    }
    const normalizedBaseUrl = parseBaseUrl(baseUrl)
    if (!normalizedBaseUrl) {
      setModelError(t('apiConfigUrlInvalid'))
      return
    }
    const key = apiKey.trim() || config?.apiKey || ''
    if (!key) {
      setModelError(t('apiConfigKeyRequired'))
      return
    }
    setModelError(null)
    setModelStatus(null)
    setFetchingModels(true)
    try {
      const list = await fetchModels({ baseUrl: normalizedBaseUrl, apiKey: key })
      const ids = list.map((item) => item.id)
      setModels(ids)
      if (!model.trim() && ids[0]) {
        setModel(ids[0])
      }
      setModelStatus(
        ids.length > 0 ? t('apiConfigModelsFetched', { count: ids.length }) : t('apiConfigNoModels')
      )
    } catch (cause) {
      setModelError(t('apiConfigModelsFetchFailed', { message: describeFailure(cause) }))
    } finally {
      setFetchingModels(false)
    }
  }

  const submit = async () => {
    if (verifying || fetchingModels) {
      return
    }
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('apiConfigNameRequired')
      return
    }
    const normalizedBaseUrl = parseBaseUrl(baseUrl)
    if (!normalizedBaseUrl) {
      setError('apiConfigUrlInvalid')
      return
    }
    const key = apiKey.trim() || config?.apiKey || ''
    if (!key) {
      setError('apiConfigKeyRequired')
      return
    }
    const trimmedModel = model.trim()
    if (!trimmedModel) {
      setError('apiConfigModelRequired')
      return
    }
    const connection: ApiConnection = { baseUrl: normalizedBaseUrl, apiKey: key }
    setError(null)
    setFailure(null)
    setVerifying(true)
    try {
      await verifyApiConnection(connection)
      if (config) {
        updateApiConfig(config.id, {
          name: trimmedName,
          ...connection,
          model: trimmedModel,
          models,
        })
      } else {
        addApiConfig({ name: trimmedName, ...connection, model: trimmedModel, models })
      }
      showToast({ key: 'apiConfigSaved' })
      onClose()
    } catch (cause) {
      setFailure({ cause })
    } finally {
      setVerifying(false)
    }
  }

  return (
    <Modal
      title={t(config ? 'apiConfigEditTitle' : 'apiConfigAddTitle')}
      className={styles.apiConfigDialog}
      onClose={() => {
        if (!verifying) {
          onClose()
        }
      }}
      footer={
        <>
          <Button variant="outlined" disabled={verifying} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button disabled={verifying || fetchingModels} onClick={() => void submit()}>
            {t(verifying ? 'apiKeyVerifying' : 'confirm')}
          </Button>
        </>
      }
    >
      <div
        className={styles.apiConfigForm}
        onKeyDown={(event) => {
          // 模型选择器和获取按钮也在表单内，回车不应触发保存
          if (event.target instanceof HTMLButtonElement) {
            return
          }
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('apiConfigName')}</span>
          <input
            className={styles.input}
            value={name}
            placeholder={t('apiConfigNamePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            onChange={(event) => {
              setError(null)
              setFailure(null)
              setName(event.target.value)
            }}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('apiConfigBaseUrl')}</span>
          <input
            className={styles.input}
            value={baseUrl}
            placeholder={DEFAULT_API_BASE_URL}
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
            onChange={(event) => {
              setError(null)
              setFailure(null)
              setBaseUrl(event.target.value)
            }}
          />
          <span className={styles.fieldHint}>{t('apiConfigBaseUrlHint')}</span>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>API Key</span>
          <input
            className={styles.input}
            type="password"
            value={apiKey}
            placeholder={config ? t('apiConfigKeyKeep') : t('apiKeyPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setError(null)
              setFailure(null)
              setApiKey(event.target.value)
            }}
          />
        </label>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('apiConfigModel')}</span>
          <div className={styles.modelRow}>
            <input
              className={styles.input}
              value={model}
              placeholder={DEFAULT_MODEL}
              aria-label={t('apiConfigModel')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setError(null)
                setFailure(null)
                setModelStatus(null)
                setModelError(null)
                setModel(event.target.value)
              }}
            />
            <Button
              variant="outlined"
              size="m"
              className={styles.cellButton}
              disabled={fetchingModels || verifying}
              onClick={() => void fetchModelList()}
            >
              {t(fetchingModels ? 'apiConfigFetchingModels' : 'apiConfigFetchModels')}
            </Button>
          </div>
          <span className={styles.fieldHint}>{t('apiConfigModelHint')}</span>
          {models.length > 0 ? (
            <Select
              ariaLabel={t('apiConfigSelectFetchedModel')}
              className={styles.modelSelect}
              value={models.includes(model.trim()) ? model.trim() : ''}
              placeholder={t('apiConfigSelectFetchedModel')}
              options={models.map((id) => ({ value: id, label: id }))}
              disabled={fetchingModels}
              onChange={(value) => {
                setError(null)
                setFailure(null)
                setModel(value)
              }}
            />
          ) : null}
          {modelError ? (
            <span className={styles.error}>{modelError}</span>
          ) : modelStatus ? (
            <span className={styles.fieldHint}>{modelStatus}</span>
          ) : null}
        </div>
        {error ? <div className={styles.error}>{t(error)}</div> : null}
        {!error && failure ? (
          <div className={styles.error}>{describeFailure(failure.cause)}</div>
        ) : null}
      </div>
    </Modal>
  )
}

const DeleteApiConfig = ({ config, onClose }: { config: ApiConfig; onClose: () => void }) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('apiConfigDeleteTitle')}
      className={styles.importConfirm}
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" autoFocus onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              removeApiConfig(config.id)
              showToast({ key: 'apiConfigDeleted' })
              onClose()
            }}
          >
            {t('delete')}
          </Button>
        </>
      }
    >
      <div className={styles.importConfirmText}>
        {t('apiConfigDeleteDescription', { name: config.name })}
      </div>
    </Modal>
  )
}
