import "server-only"
import { getServerI18n } from "../i18n/server"
import { captureBackendAction } from "./backend-action-result"
import type { BackendApiError } from "./backend-response"
import type { MessageKey } from "../i18n/messages"

const messages: Record<string, MessageKey> = {
  java_file_required: 'explorer.javaOnly', native_explorer_unavailable: 'explorer.nativeError',
  file_not_text: 'explorer.text.binary', file_text_limit: 'explorer.text.limit',
  file_text_unavailable: 'explorer.text.error',
  syntax_analysis_unavailable: 'syntax.unavailable', syntax_analysis_cancelled: 'syntax.cancelled',
  syntax_analysis_incomplete: 'syntax.incomplete', syntax_analysis_failed: 'syntax.failed',
  uml_generation_failed: "diff.umlError", uml_invalid_request: "diff.umlLimit",
  sync_failed: "errors.syncFailed",
  sync_revision_conflict: "errors.syncRevision", sync_selection_conflict: "errors.syncSelection",
  sync_operation_pending: "errors.syncPending", sync_recovery_conflict: "errors.syncRecovery",
  sync_baseline_unavailable: "errors.syncBaseline", sync_review_required: "errors.syncReview",
  backend_timeout: "errors.backendTimeout", backend_unavailable: "errors.backendUnavailable",
  invalid_json: "errors.backendInvalid", invalid_response: "errors.backendInvalid",
  client_not_authorized: "errors.backendAccess", backend_configuration: "errors.backendAccess",
  incomplete_restore: "diff.incompleteSnapshot",
  initial_baseline_unavailable: "errors.initialBaselineUnavailable",
  git_operation_failed: "errors.gitOperationFailed",
  filesystem_record_pending: "errors.filesystemRecordPending",
  operation_busy: "errors.operationBusy",
  revision_conflict: "errors.revisionConflict", record_unavailable: "errors.recordUnavailable",
  operation_pending: "errors.operationPending", recovery_conflict: "errors.recoveryConflict",
  save_failed: "errors.saveFailed", save_verification_failed: "errors.saveVerificationFailed",
  path_not_authorized: "errors.pathNotAuthorized",
  psi_file_not_found: "errors.backendMissingFile",
  file_tree_unavailable: "errors.fileTreeUnavailable",
}

export async function backendErrorMessage(error: BackendApiError): Promise<string> {
  const { t } = await getServerI18n()
  if (error.code.startsWith('java_')) return `${t('java.toolFailure')} ${error.detail}`
  if (error.code === "git_pending" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(error.detail))
    return t("errors.gitPending", { id: error.detail })
  if (messages[error.code]) return t(messages[error.code])
  if (["operation_failed", "invalid_request", "psi_file_not_found"].includes(error.code)) return error.message
  return t("errors.backendFailure")
}

export function backendAction<T>(operation: () => Promise<T>) {
  return captureBackendAction(operation, backendErrorMessage)
}
