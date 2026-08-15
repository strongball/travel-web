import { describe, it, expect } from 'vitest'
import { formatAssistantText } from './formatAssistantText'

describe('formatAssistantText', () => {
  it('converts $\\rightarrow$ and $\\to$ to Unicode arrows', () => {
    expect(formatAssistantText('台北車站 $\\rightarrow$ 瑞芳 $\\rightarrow$ 九份')).toBe('台北車站 → 瑞芳 → 九份')
    expect(formatAssistantText('交通：搭乘台鐵 $\\to$ 轉乘公車')).toBe('交通：搭乘台鐵 → 轉乘公車')
    expect(formatAssistantText('A $\\longrightarrow$ B')).toBe('A → B')
    expect(formatAssistantText('步驟 1 $\\Rightarrow$ 步驟 2')).toBe('步驟 1 ⇒ 步驟 2')
  })

  it('converts standalone LaTeX commands without dollar signs', () => {
    expect(formatAssistantText('台北 \\rightarrow 九份')).toBe('台北 → 九份')
    expect(formatAssistantText('路線：A \\to B \\to C')).toBe('路線：A → B → C')
  })

  it('converts other common LaTeX symbols', () => {
    expect(formatAssistantText('時間約 10:00 $\\sim$ 11:30')).toBe('時間約 10:00 ~ 11:30')
    expect(formatAssistantText('預算 $\\approx$ 5000 元')).toBe('預算 ≈ 5000 元')
    expect(formatAssistantText('門票 $200 \\times 2$ 人')).toBe('門票 200 × 2 人')
    expect(formatAssistantText('溫度約 25$^{\\circ}$C')).toBe('溫度約 25°C')
    expect(formatAssistantText('停留時間 $\\le$ 60 分鐘')).toBe('停留時間 ≤ 60 分鐘')
    expect(formatAssistantText('包含項目：$\\dots$')).toBe('包含項目：…')
  })

  it('handles \\text{} inside math blocks', () => {
    expect(formatAssistantText('$\\text{台北} \\rightarrow \\text{花蓮}$')).toBe('台北 → 花蓮')
  })

  it('preserves normal currency notation', () => {
    expect(formatAssistantText('這頓午餐每人約 $150 元')).toBe('這頓午餐每人約 $150 元')
    expect(formatAssistantText('價格介於 $100 到 $200 之間')).toBe('價格介於 $100 到 $200 之間')
  })

  it('handles empty or blank content gracefully', () => {
    expect(formatAssistantText('')).toBe('')
    expect(formatAssistantText('普通文字不需要變更')).toBe('普通文字不需要變更')
  })
})
