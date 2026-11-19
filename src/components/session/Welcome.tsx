import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { findAssistant, selectAssistant, useAssistants } from '../../services/assistants.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { Select } from '../base/Select.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './Welcome.module.css'

/** 新对话：问候语 + 助手选择 + 输入框。桌面端居中；移动端输入框吸底 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const assistants = useAssistants((state) => state.assistants)
  const selectedId = useAssistants((state) => state.selectedId)
  const selected = findAssistant(assistants, selectedId)
  return (
    <div className={styles.container}>
      {isMobile ? <MobileHeader /> : null}
      <div className={styles.welcome}>
        <div className={styles.greeting}>{t('welcomeMessageChat250808')}</div>
        <div className={styles.assistant}>
          <span className={styles.assistantLabel}>{t('assistantLabel')}</span>
          <Select
            ariaLabel={t('assistantLabel')}
            className={styles.assistantSelect}
            value={selected.id}
            options={assistants.map((assistant) => ({
              value: assistant.id,
              label: assistant.name,
            }))}
            onChange={selectAssistant}
          />
        </div>
        <ChatInput sessionId={null} />
        {isMobile ? <div className={styles.caveat}>{t('contentCaveat')}</div> : null}
      </div>
    </div>
  )
}
