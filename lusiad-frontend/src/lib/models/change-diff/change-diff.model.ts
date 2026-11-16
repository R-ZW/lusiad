import type { JavaModel } from "@/lib/types"

export type ChangeDiffOperation = "create" | "update" | "delete" | "move" | "unknown"

export interface ChangeDiffSnapshot {
  changeId: string
  operation: ChangeDiffOperation
  filePath: string
  beforePath: string
  afterPath: string
  beforeModel: JavaModel | null
  afterModel: JavaModel | null
  beforeProjectModels: JavaModel[]
  afterProjectModels: JavaModel[]
}

