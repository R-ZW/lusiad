/** Read-only navigation to a saved history entry; it does not select a preview. */
export interface HistoryLocation { commitId: number; changeId?: number }
export interface HistoryNavigation extends HistoryLocation { projectId: number; requestId: number }

export const historyLocationQuery = (target: HistoryLocation) => target.changeId ? `change:${target.changeId}` : `commit:${target.commitId}`
