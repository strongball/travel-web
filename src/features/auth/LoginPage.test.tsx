import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  it('submits sign-in credentials', () => {
    const onSubmit = vi.fn()
    render(<LoginPage onSubmit={onSubmit} onGoogleSignIn={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/^電子郵件/), {
      target: { value: 'traveler@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/^密碼/), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: '登入' }))

    expect(onSubmit).toHaveBeenCalledWith(
      'traveler@example.com',
      'secret123',
      'signIn',
    )
  })

  it('starts Google sign-in', () => {
    const onGoogleSignIn = vi.fn()
    render(<LoginPage onSubmit={vi.fn()} onGoogleSignIn={onGoogleSignIn} />)

    fireEvent.click(screen.getByRole('button', { name: '使用 Google 登入' }))

    expect(onGoogleSignIn).toHaveBeenCalledOnce()
  })
})
