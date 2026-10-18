import { describe, expect, it } from 'vitest'
import { todayIn } from './today'

describe('todayIn', () => {
  it('uses the shop time zone, not the browser one', () => {
    const instant = new Date('2026-03-09T16:30:00Z')
    expect(todayIn('Asia/Manila', instant)).toBe('2026-03-10')
    expect(todayIn('UTC', instant)).toBe('2026-03-09')
  })
})
