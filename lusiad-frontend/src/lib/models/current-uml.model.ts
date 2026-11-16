import { BackendApiError } from '../services/backend-response.ts'
import { requireUmlPanel, type UmlPanel } from './change-diff/change-uml.model.ts'

export interface CurrentUmlResult {
  status: 'ok'
  engine: 'plantuml-smetana'
  diagram: UmlPanel
  fileCount: number
  revision: string
}

export function requireCurrentUmlResult(body: Record<string, unknown>, context: string): Omit<CurrentUmlResult, 'revision'> {
  if (body.status !== 'ok' || 'error' in body || body.engine !== 'plantuml-smetana'
    || !Number.isSafeInteger(body.fileCount) || Number(body.fileCount) < 0 || Number(body.fileCount) > 500) {
    throw new BackendApiError(context, 'Invalid current UML response', 'invalid_response', 200)
  }
  const diagram = requireUmlPanel(body.diagram, context)
  if (Number(body.fileCount) === 0 && diagram.classifiers.length !== 0) {
    throw new BackendApiError(context, 'Unexpected UML classifiers without sources', 'invalid_response', 200)
  }
  return { status: 'ok', engine: 'plantuml-smetana', diagram, fileCount: Number(body.fileCount) }
}
