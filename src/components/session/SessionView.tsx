import clsx from 'clsx'
import { useMemo } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { useAssistant } from '../../services/assistants.js'
import { getVisibleMessages } from '../../services/chat/branches.js'
import { summarizeTokenUsage } from '../../services/chat/tokens.js'
import type { Session } from '../../services/chat/types.js'
import { useSettings } from '../../services/settings.js'
import { formatTokenCount } from '../../utils/format.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { MessageList } from '../messages/MessageList.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './SessionView.module.css'

/** 会话页：标题栏（移动端为顶栏）+ 消息列表，输入框吸底 */
export const SessionView = ({
  session,
  streaming,
  siderCollapsed,
}: {
  session: Session
  streaming: boolean
  siderCollapsed: boolean
}) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const locale = useSettings((state) => state.locale)
  const assistant = useAssistant(session.assistantId)
  const tokenUsage = useMemo(() => summarizeTokenUsage(getVisibleMessages(session)), [session])
  const title = session.title || t('untitledChat')
  return (
    <div className={styles.view}>
      {isMobile ? (
        <MobileHeader title={title} />
      ) : (
        <div className={styles.header}>
          <div className={clsx(styles.title, siderCollapsed && styles.withCollapsedSider)}>
            {title}
          </div>
          <span className={styles.assistantBadge}>{assistant.name}</span>
          {tokenUsage.replies > 0 ? (
            <span
              className={styles.tokenUsage}
              title={t('tokenConversationHint', {
                question: formatTokenCount(tokenUsage.input, locale),
                reply: formatTokenCount(tokenUsage.output, locale),
              })}
            >
              {t('tokenConversation', {
                count: formatTokenCount(tokenUsage.total, locale),
              })}
            </span>
          ) : null}
        </div>
      )}
      <MessageList
        session={session}
        streaming={streaming}
        footer={
          <div className={styles.inputContainer}>
            <ChatInput sessionId={session.id} />
            <div className={styles.caveat}>
              {t('contentCaveat')}
              {isMobile && tokenUsage.replies > 0
                ? ` · ${t('tokenConversationShort', {
                    count: formatTokenCount(tokenUsage.total, locale),
                  })}`
                : null}
            </div>
          </div>
        }
      />
    </div>
  )
}
