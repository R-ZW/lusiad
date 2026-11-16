import "server-only"
import { backendErrorMessage } from "../backend-action"
import { captureGitAction } from "./git-action-result"

export const gitAction = <T>(operation: () => Promise<T>) => captureGitAction(operation, backendErrorMessage)
