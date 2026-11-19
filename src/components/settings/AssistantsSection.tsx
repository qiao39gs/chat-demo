import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  addAssistant,
  DEFAULT_ASSISTANT_ID,
  removeAssistant,
  updateAssistant,
  useAssistants,
  type Assistant,
} from '../../services/assistants.js'
import { reassignAssistantSessions } from '../../services/chat/store.js'
import { IconPlusOutline16 } from '../base/icons.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './Settings.module.css'

/** 助手管理：列表、名称与系统提示词的编辑弹窗、删除确认。 */
export const AssistantsSection = () => {
  const t = useTranslate()
  const assistants = useAssistants((state) => state.assistants)
  const [editor, setEditor] = useState<Assistant | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Assistant | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  const confirmDelete = async () => {
    if (!deleting || deletePending) {
      return
    }
    setDeletePending(true)
    try {
      if (!(await reassignAssistantSessions(deleting.id, DEFAULT_ASSISTANT_ID))) {
        showToast({ key: 'assistantDeleteFailed', type: 'error' })
        return
      }
      removeAssistant(deleting.id)
      setDeleting(null)
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <>
      <div className={styles.assistantList}>
        {assistants.map((assistant) => {
          const prompt = assistant.systemPrompt.trim()
          return (
            <div key={assistant.id} className={styles.assistantRow}>
              <div className={styles.assistantInfo}>
                <div className={styles.assistantNameRow}>
                  <span className={styles.label}>{assistant.name}</span>
                  {assistant.id === DEFAULT_ASSISTANT_ID ? (
                    <span className={styles.assistantBadge}>{t('assistantDefaultBadge')}</span>
                  ) : null}
                </div>
                <div className={styles.assistantPrompt}>
                  {prompt || t('assistantNoSystemPrompt')}
                </div>
              </div>
              <div className={styles.assistantActions}>
                <Button
                  variant="outlined"
                  size="m"
                  className={styles.cellButton}
                  onClick={() => setEditor(assistant)}
                >
                  {t('edit')}
                </Button>
                {assistant.id === DEFAULT_ASSISTANT_ID ? null : (
                  <Button
                    variant="dangerOutlined"
                    size="m"
                    className={styles.cellButton}
                    onClick={() => setDeleting(assistant)}
                  >
                    {t('delete')}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <Button
        variant="outlined"
        size="m"
        className={styles.addAssistant}
        onClick={() => setEditor(null)}
      >
        <IconPlusOutline16 />
        {t('assistantAdd')}
      </Button>
      {editor !== undefined ? (
        <AssistantEditor assistant={editor} onClose={() => setEditor(undefined)} />
      ) : null}
      {deleting ? (
        <Modal
          title={t('assistantDeleteTitle')}
          className={styles.deleteConfirm}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <div className={styles.deleteActions}>
              <Button
                variant="outlined"
                autoFocus
                disabled={deletePending}
                onClick={() => setDeleting(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={() => void confirmDelete()}
              >
                {t(deletePending ? 'historyDeleting' : 'delete')}
              </Button>
            </div>
          }
        >
          {t('assistantDeleteDescription')}
        </Modal>
      ) : null}
    </>
  )
}

/** 新建或编辑单个助手；名称不能为空，系统提示词可以为空。 */
const AssistantEditor = ({
  assistant,
  onClose,
}: {
  assistant: Assistant | null
  onClose: () => void
}) => {
  const t = useTranslate()
  const [name, setName] = useState(assistant?.name ?? '')
  const [systemPrompt, setSystemPrompt] = useState(assistant?.systemPrompt ?? '')
  const canSave = name.trim().length > 0

  const save = () => {
    if (!canSave) {
      return
    }
    if (assistant) {
      updateAssistant(assistant.id, { name, systemPrompt })
    } else {
      addAssistant(name, systemPrompt)
    }
    onClose()
  }

  return (
    <Modal
      title={t(assistant ? 'assistantEditTitle' : 'assistantAddTitle')}
      closable
      className={styles.assistantEditorDialog}
      onClose={onClose}
      footer={
        <>
          <Button variant="outlined" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button disabled={!canSave} onClick={save}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className={styles.assistantEditor}>
        <label className={styles.assistantField}>
          <span className={styles.assistantFieldLabel}>{t('assistantName')}</span>
          <input
            className={styles.assistantNameInput}
            value={name}
            autoFocus
            maxLength={60}
            placeholder={t('assistantNamePlaceholder')}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                save()
              }
            }}
          />
        </label>
        <label className={styles.assistantField}>
          <span className={styles.assistantFieldLabel}>{t('assistantSystemPrompt')}</span>
          <textarea
            className={styles.assistantPromptInput}
            value={systemPrompt}
            rows={8}
            placeholder={t('assistantSystemPromptPlaceholder')}
            onChange={(event) => setSystemPrompt(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  )
}
