import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconPanelLeftOutline16,
  IconPlusOutline16,
  IconSettingsOutline16,
  NewChatIcon,
} from '../base/icons.js'
import {
  findAssistant,
  toggleAssistantCollapsed,
  useAssistants,
} from '../../services/assistants.js'
import { setSiderCollapsed } from '../../services/settings.js'
import {
  newChat,
  newChatWithAssistant,
  removeSession,
  useChatStore,
} from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { closeMobileSider, useMobileSider } from './mobileSiderState.js'
import { SessionItem } from './SessionItem.js'
import styles from './Sider.module.css'

/** 展开的侧边栏：名称与收起按钮、开启新对话、按助手折叠分组的会话列表、底部设置；移动端放在抽屉里，收起按钮关闭抽屉 */
export const Sider = ({ mobile = false }: { mobile?: boolean }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const assistants = useAssistants((state) => state.assistants)
  const collapsedIds = useAssistants((state) => state.collapsedIds)
  const groups = useMemo(
    () =>
      assistants.map((assistant) => ({
        assistant,
        sessions: sessions.filter(
          (session) => findAssistant(assistants, session.assistantId).id === assistant.id
        ),
      })),
    [assistants, sessions]
  )
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      <div className={styles.top}>
        <div className={styles.appName}>{t('appName')}</div>
        <IconButton
          size="m"
          icon={<IconPanelLeftOutline16 />}
          tooltip={t('collapseSiderbarButton')}
          tooltipPlacement="bottom"
          onClick={() => (mobile ? closeMobileSider() : setSiderCollapsed(true))}
        />
      </div>
      <button
        type="button"
        className={styles.newChat}
        onClick={() => {
          newChat()
          closeMobileSider()
        }}
      >
        <span className={styles.newChatIcon}>
          <NewChatIcon />
        </span>
        {t('newChat')}
      </button>
      <div className={styles.listWrap}>
        <div className={styles.list}>
          {groups.map(({ assistant, sessions: items }) => {
            const collapsed = collapsedIds.includes(assistant.id)
            return (
              <div key={assistant.id} className={styles.section}>
                <div className={styles.sectionHeader}>
                  <button
                    type="button"
                    className={styles.sectionToggle}
                    aria-expanded={!collapsed}
                    onClick={() => toggleAssistantCollapsed(assistant.id)}
                  >
                    <span className={styles.sectionChevron}>
                      {collapsed ? <IconChevronRightOutline14 /> : <IconChevronDownOutline14 />}
                    </span>
                    <span className={styles.sectionName}>{assistant.name}</span>
                    <span className={styles.sectionCount}>{items.length}</span>
                  </button>
                  <IconButton
                    className={styles.sectionNew}
                    icon={<IconPlusOutline16 />}
                    tooltip={t('newChatWithAssistant', { name: assistant.name })}
                    onClick={() => {
                      newChatWithAssistant(assistant.id)
                      closeMobileSider()
                    }}
                  />
                </div>
                {collapsed ? null : (
                  <div className={styles.sectionSessions}>
                    {items.map((session) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        active={session.id === activeId}
                        onDelete={() => setDeleting(session)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className={styles.bottom}>
        <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
          <span className={styles.settingsIcon}>
            <IconSettingsOutline16 />
          </span>
          <span className={styles.settingsLabel}>{t('settings')}</span>
        </button>
      </div>
      {deleting ? (
        <Modal
          title={t('deleteSessionModalContentTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    if (await removeSession(deleting.id)) {
                      setDeleting(null)
                    } else {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
    </div>
  )
}

/** 移动端抽屉：浮在页面上方，点空白区域关闭。 */
export const MobileSider = () => {
  const open = useMobileSider((state) => state.open)
  if (!open) {
    return null
  }
  return (
    <>
      <div className={styles.drawerMask} onClick={closeMobileSider} />
      <div className={styles.drawer}>
        <Sider mobile />
      </div>
    </>
  )
}
