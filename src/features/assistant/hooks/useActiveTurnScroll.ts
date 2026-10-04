import { useLayoutEffect, useRef, useState } from 'react'

export function useActiveTurnScroll<T extends { role: string; id: string }>(
  messages: T[],
  isBusy?: boolean,
  options?: { conversationKey?: string | null; activityKey?: string | null; layoutKey?: string | null },
) {
  const messagesAreaRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const lastUserMessageRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const [hasNewReply, setHasNewReply] = useState(false)
  const followingRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  const previousRef = useRef<{ userId: string | null; messageId: string | null; activity?: string | null } | null>(null)
  const lastUserMessageIndex = messages.findLastIndex((message) => message.role === 'user')
  const lastUserMessageId = messages[lastUserMessageIndex]?.id ?? null

  const scrollToBottom = () => {
    const container = messagesAreaRef.current
    if (!container) return
    const top = Math.max(0, container.scrollHeight - container.clientHeight)
    lastScrollTopRef.current = top
    container.scrollTop = top
  }

  const scrollToLatest = () => {
    followingRef.current = true
    setHasNewReply(false)
    scrollToBottom()
  }

  const onScroll = () => {
    const container = messagesAreaRef.current
    if (!container) return
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 48
    if (nearBottom) {
      followingRef.current = true
      setHasNewReply(false)
    } else if (container.scrollTop < lastScrollTopRef.current - 2) {
      followingRef.current = false
    }
    lastScrollTopRef.current = container.scrollTop
  }

  useLayoutEffect(() => {
    previousRef.current = null
    followingRef.current = true
    setHasNewReply(false)
  }, [options?.conversationKey])

  useLayoutEffect(() => {
    const previous = previousRef.current
    const latest = messages.at(-1)
    const newUser = Boolean(previous && lastUserMessageId !== previous.userId && latest?.role === 'user')
    const newReply = Boolean(previous && (
      (latest?.role === 'assistant' && latest.id !== previous.messageId) ||
      (options?.activityKey && options.activityKey !== previous.activity)
    ))
    if (newUser) {
      followingRef.current = true
      setHasNewReply(false)
    }
    if (followingRef.current) scrollToBottom()
    else if (newReply) setHasNewReply(true)
    previousRef.current = { userId: lastUserMessageId, messageId: latest?.id ?? null, activity: options?.activityKey }
  }, [messages, lastUserMessageId, isBusy, options?.activityKey, options?.layoutKey, options?.conversationKey])

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (followingRef.current) scrollToBottom()
    })
    if (messagesAreaRef.current) observer.observe(messagesAreaRef.current)
    if (contentRef.current) observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [options?.conversationKey])

  return { hasNewReply, onScroll, scrollToLatest, messagesAreaRef, contentRef, lastUserMessageRef, messagesEndRef, lastUserMessageIndex }
}
