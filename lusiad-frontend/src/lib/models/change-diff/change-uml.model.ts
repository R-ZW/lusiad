import { BackendApiError } from "../../services/backend-response.ts"

export type UmlView = "focus" | "project"
export interface UmlPanel { svg: string | null; classifiers: string[]; focusFound: boolean }
export interface UmlResult {
  status: "ok"
  engine: "plantuml-smetana"
  before: UmlPanel
  after: UmlPanel
  noStructuralChange: boolean
  movement: string
}
export interface UmlRequest { projectId: number; snapshotId: string; changeId: string; view: UmlView }

export function requireUmlPanel(value: unknown, context: string): UmlPanel {
  const invalid = () => { throw new BackendApiError(context, "Invalid local UML panel", "invalid_response", 200) }
  const panel = value as UmlPanel | undefined
  if (!panel || typeof panel.focusFound !== "boolean" || !Array.isArray(panel.classifiers)
    || !panel.classifiers.every(name => typeof name === "string" && name.length > 0)) invalid()
  if (!panel) return invalid()
  if (panel.classifiers.length === 0 ? panel.svg !== null : typeof panel.svg !== "string" || !panel.svg.startsWith("<svg")
    || panel.svg.length > 8 * 1024 * 1024 || /<(?:script|foreignObject|image|a|iframe|style)\b|\son\w+\s*=|\b(?:href|src)\s*=|<!DOCTYPE|<!ENTITY|<\?/i.test(panel.svg)) invalid()
  return panel
}

/** Errors and active/linked SVG are never admitted as a diagram. Images are isolated again at display time. */
export function requireUmlResult(body: Record<string, unknown>, context: string): UmlResult {
  const invalid = () => { throw new BackendApiError(context, "Invalid local UML response", "invalid_response", 200) }
  if (body.status !== "ok" || "error" in body || body.engine !== "plantuml-smetana"
    || typeof body.noStructuralChange !== "boolean" || typeof body.movement !== "string") invalid()
  for (const key of ["before", "after"]) {
    requireUmlPanel(body[key], context)
  }
  return body as unknown as UmlResult
}
