import type { DraftState } from './draft'

// Study §4.8: keep an unsaved copy of a draft on this device, and offer to restore it after a reload.

export type LocalDraft = { savedAt: string; baseUpdatedAt: string; state: DraftState }

const key = (documentId: string) => `partsflow.draft.${documentId}`

export function readLocalDraft(documentId: string): LocalDraft | null {
  try {
    const text = localStorage.getItem(key(documentId))
    return text ? (JSON.parse(text) as LocalDraft) : null
  } catch {
    return null
  }
}

export function writeLocalDraft(documentId: string, draft: LocalDraft): void {
  try {
    localStorage.setItem(key(documentId), JSON.stringify(draft))
  } catch {
    // Storage full or blocked: the in-memory edits still work.
  }
}

export function clearLocalDraft(documentId: string): void {
  try {
    localStorage.removeItem(key(documentId))
  } catch {
    // Nothing to clear.
  }
}
