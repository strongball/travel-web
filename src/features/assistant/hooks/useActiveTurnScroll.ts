import { useLayoutEffect, useRef, useState } from 'react'

export function useActiveTurnScroll<T extends { role: string; id: string }>(
  messages: T[],
  isBusy?: boolean,
  options?: { conversationKey?: string | null; activityKey?: string | null },
) {
  const messagesAreaRef = useRef<HTMLDivElement | null>(null)
  const lastUserMessageRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const activeTurnSpacerRef = useRef<HTMLDivElement | null>(null)
  const [hasNewReply, setHasNewReply] = useState(false)
  const followingRef = useRef(true)
  const previousActivityRef = useRef(options?.activityKey)
  const [activeTurnSpacerHeight, setActiveTurnSpacerHeight] = useState(0)

  const lastUserMessageIndex = messages.findLastIndex((m) => m.role === 'user')
  const lastUserMessage = lastUserMessageIndex >= 0 ? messages[lastUserMessageIndex] : null
  const lastUserMessageId = lastUserMessage?.id ?? null

  const prevLastUserIdRef = useRef<string | null>(null)
  const prevLastMessageIdRef = useRef<string | null>(null)
  const isInitialMountRef = useRef(true)

  useLayoutEffect(() => {
    isInitialMountRef.current = true
    prevLastUserIdRef.current = null
    prevLastMessageIdRef.current = null
    followingRef.current = true
    previousActivityRef.current = undefined
    setHasNewReply(false)
  }, [options?.conversationKey])

  const onScroll = () => {
    const container = messagesAreaRef.current
    if (!container) return
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
    followingRef.current = nearBottom
    if (nearBottom) setHasNewReply(false)
  }

  const scrollToLatest = () => {
    followingRef.current = true
    setHasNewReply(false)
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // 捲動至最後一則使用者訊息（將訊息平滑頂至畫面最上方）
  const scrollToLastUserMessage = (smooth = true) => {
    const container = messagesAreaRef.current
    const userMessageEl = lastUserMessageRef.current
    if (!container || !userMessageEl) return

    // 立即確保 spacer 高度充足，避免因為 scrollHeight 被瀏覽器限制 scrollTop
    if (activeTurnSpacerRef.current) {
      activeTurnSpacerRef.current.style.height = `${container.clientHeight}px`
    }

    const containerRect = container.getBoundingClientRect()
    const messageRect = userMessageEl.getBoundingClientRect()
    const offset = messageRect.top - containerRect.top
    const targetScrollTop = container.scrollTop + offset - 16

    if (typeof container.scrollTo === 'function') {
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: smooth ? 'smooth' : 'auto',
      })
    } else {
      container.scrollTop = Math.max(0, targetScrollTop)
    }
  }

  // 計算 spacer 高度，確保進行中的回合有足夠的向上捲動空間將使用者訊息頂到最上方
  useLayoutEffect(() => {
    const container = messagesAreaRef.current
    if (!container) return

    const height = isBusy ? Math.max(0, container.clientHeight) : 0
    setActiveTurnSpacerHeight(height)
    if (activeTurnSpacerRef.current) {
      activeTurnSpacerRef.current.style.height = `${height}px`
    }
  }, [isBusy])

  // 新訊息抵達或切換時捲動
  useLayoutEffect(() => {
    const container = messagesAreaRef.current
    if (!container) return

    // 初次載入
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      prevLastMessageIdRef.current = messages.at(-1)?.id ?? null
      previousActivityRef.current = options?.activityKey
      prevLastUserIdRef.current = lastUserMessageId

      if (messages.length > 0) {
        if (isBusy && lastUserMessage) {
          // 重整或載入時正處於對話中回合：將使用者訊息頂至上方
          requestAnimationFrame(() => {
            scrollToLastUserMessage(false)
          })
        } else {
          // 一般歷史紀錄：捲動至最底部
          container.scrollTop = container.scrollHeight
        }
      }
      return
    }

    // 判斷是否為使用者剛送出的新訊息（比對最新 user message id 是否改變）
    const isNewUserMessage = Boolean(
      lastUserMessageId &&
      lastUserMessageId !== prevLastUserIdRef.current &&
      messages.at(-1)?.role === 'user',
    )

    const activityChanged = options?.activityKey !== previousActivityRef.current
    previousActivityRef.current = options?.activityKey
    if (isNewUserMessage) {
      followingRef.current = true
      setHasNewReply(false)
      // 確保 spacer 立即生效，並在下一 frame 將訊息頂到最上方
      if (activeTurnSpacerRef.current) {
        activeTurnSpacerRef.current.style.height = `${container.clientHeight}px`
      }
      requestAnimationFrame(() => {
        scrollToLastUserMessage(true)
      })
    } else if ((messages.at(-1)?.id !== prevLastMessageIdRef.current && messages.at(-1)?.role === 'assistant') || activityChanged) {
      // 助理訊息完成或對話歷史更新（非正在執行的回合）
      if (!followingRef.current) {
        setHasNewReply(true)
      } else {
        requestAnimationFrame(() => {
          if (followingRef.current) messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
        })
      }
    }

    prevLastMessageIdRef.current = messages.at(-1)?.id ?? null
    prevLastUserIdRef.current = lastUserMessageId
  }, [messages, lastUserMessage, lastUserMessageId, isBusy, options?.activityKey, options?.conversationKey])

  return {
    hasNewReply,
    onScroll,
    scrollToLatest,
    messagesAreaRef,
    lastUserMessageRef,
    messagesEndRef,
    activeTurnSpacerRef,
    activeTurnSpacerHeight,
    lastUserMessageIndex,
    scrollToLastUserMessage,
  }
}

