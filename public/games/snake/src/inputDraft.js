export function createInputDraft() {
  return { dirty: false, pendingValue: null };
}

export function markInputDraftDirty(draft) {
  draft.dirty = true;
  draft.pendingValue = null;
}

export function markInputDraftPending(draft, value) {
  draft.dirty = false;
  draft.pendingValue = value;
}

export function shouldSyncInputDraft(draft, serverValue) {
  if (draft.pendingValue !== null) {
    if (draft.pendingValue !== serverValue) {
      return false;
    }
    draft.pendingValue = null;
  }

  return !draft.dirty;
}
