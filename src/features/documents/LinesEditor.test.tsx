import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { emptyLine, type EditableLine } from './draft'
import { LinesEditor } from './LinesEditor'

// The picker needs the shop and the API; this test checks only row entrances.
vi.mock('./ProductPicker', () => ({ ProductPicker: () => null }))

function Harness({ initial }: { initial: EditableLine[] }) {
  const [lines, setLines] = useState(initial)
  return <LinesEditor direction="receipt" lines={lines} onChange={setLines} counterpartyId={null} showIssues={false} />
}

const rows = () => screen.getAllByRole('button', { name: /^Remove line/ }).map((b) => b.closest('tr, li')!)

describe('LinesEditor motion', () => {
  it('fades in only the lines the user adds, not the lines already on the document', () => {
    render(<Harness initial={[emptyLine(), emptyLine()]} />)
    expect(rows().filter((r) => r.classList.contains('motion-fade'))).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /Add line/ }))

    const faded = rows().filter((r) => r.classList.contains('motion-fade'))
    // One new line, rendered twice: the desktop table row and the phone card.
    expect(faded).toHaveLength(2)
    expect(faded.every((r) => r.textContent?.includes('3'))).toBe(true)
  })
})
