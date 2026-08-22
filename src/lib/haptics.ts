export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning'

/**
 * 觸發手機端的觸控微震動回饋 (Haptic Feedback)
 * 支援 Navigator.vibrate API；若裝置或瀏覽器不支援則自動降級無視，不影響正常執行。
 */
export function triggerHaptic(type: HapticType = 'light'): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.vibrate) {
    return
  }

  try {
    switch (type) {
      case 'light':
        // 輕微點擊回饋 (如：換日、切換標籤)
        navigator.vibrate(10)
        break
      case 'medium':
        // 中等回饋 (如：開啟選單、浮動按鈕點擊)
        navigator.vibrate(20)
        break
      case 'heavy':
        // 強烈回饋 (如：長按操作)
        navigator.vibrate(35)
        break
      case 'success':
        // 成功回饋 (如：完成待辦事項)
        navigator.vibrate([10, 30, 15])
        break
      case 'warning':
        // 警示/刪除回饋
        navigator.vibrate([20, 40, 20])
        break
    }
  } catch {
    // 忽略特定環境下的權限或策略阻擋
  }
}
