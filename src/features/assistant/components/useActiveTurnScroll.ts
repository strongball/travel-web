import { useLayoutEffect, useRef, useState } from 'react'

export function useActiveTurnScroll<T extends { role: string; id: string }>(
  messages: T[],
  isBusy?: boolean,
) {
  const messagesAreaRef = useRef<HTMLDivElement | null>(null)
  const lastUserMessageRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const activeTurnSpacerRef = useRef<HTMLDivElement | null>(null)
  const [activeTurnSpacerHeight, setActiveTurnSpacerHeight] = useState(0)

  const lastUserMessageIndex = messages.findLastIndex((m) => m.role === 'user')
  const prevMessagesLengthRef = useRef(0)
  const initializedRef = useRef(false)

  // 計算 spacer 高度，確保進行中的回合有足夠的向上捲動空間將使用者訊息頂到最上方
  useLayoutEffect(() => {
    const container = messagesAreaRef.current
    if (!container) return

    if (isBusy) {
      const containerHeight = container.clientHeight
      // 提供足夠的 spacer 高度，讓使用者訊息即使在底部也能一路滾動至最頂端
      setActiveTurnSpacerHeight(Math.max(0, containerHeight))
    } else {
      setActiveTurnSpacerHeight(0)
    }
  }, [isBusy])

  // 新訊息抵達或切換時平滑捲動
  useLayoutEffect(() => {
    const container = messagesAreaRef.current
    if (!container) return

    // 初始載入時捲動至最底部
    if (!initializedRef.current && messages.length > 0) {
      container.scrollTop = container.scrollHeight
      initializedRef.current = true
      prevMessagesLengthRef.current = messages.length
      return
    }

    if (messages.length > prevMessagesLengthRef.current) {
      const lastMessage = messages.at(-1)
      if (lastMessage?.role === 'user') {
        // 使用者剛傳送訊息：將此訊息平滑拉至畫面最上方
        requestAnimationFrame(() => {
          const userMessageEl = lastUserMessageRef.current
          if (!userMessageEl || !container) return
          const containerTop = container.getBoundingClientRect().top
          const messageTop = userMessageEl.getBoundingClientRect().top
          const targetScrollTop = container.scrollTop + (messageTop - containerTop) - 16

          if (typeof container.scrollTo === 'function') {
            container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' })
          } else {
            container.scrollTop = Math.max(0, targetScrollTop)
          }
        })
      } else {
        // 其他訊息（如 assistant 訊息完成）
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        })
      }
    }

    prevMessagesLengthRef.current = messages.length
  }, [messages])

  return {
    messagesAreaRef,
    lastUserMessageRef,
    messagesEndRef,
    activeTurnSpacerRef,
    activeTurnSpacerHeight,
    lastUserMessageIndex,
  }
}

