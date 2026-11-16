export interface FileExplorerMutationResponse {
  status: "ok"
  message?: string
  noOp?: boolean
  recoveryPath?: string
  path?: string
  name?: string
  oldName?: string
  newName?: string
  oldPath?: string
  newPath?: string
  error?: string
  size?: number
}
