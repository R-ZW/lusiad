export class MutationGate {
  private owner: object | null = null
  acquire() {
    if (this.owner) return null
    const token = {}
    this.owner = token
    return token
  }
  release(token: object) {
    if (token === this.owner) this.owner = null
  }
}

/** One visible document, latest read wins, and at most one outstanding write. */
export class EditorSession<T> {
  private view = { path: "" }
  private model: T | null = null
  private operation: object | null = null
  private blocked = false
  setBlocked(value: boolean) { this.blocked = value }
  private gate: MutationGate
  constructor(gate = new MutationGate()) { this.gate = gate }
  select(path: string) {
    this.model = null
    this.view = { path }
    return this.view
  }
  get path() { return this.view.path }
  current(ticket: object) { return ticket === this.view }
  accept(ticket: object, model: T) {
    if (!this.current(ticket)) return false
    this.model = model
    return true
  }
  /** Capture a proposal without reserving a write; cancel therefore has no side effects. */
  capture(model: T | null) {
    if (this.blocked || this.operation || !model || this.model !== model) return null
    return { view: this.view, path: this.view.path }
  }
  begin(model: T | null) {
    const proposal = this.capture(model)
    if (!proposal) return null
    const gateToken = this.gate.acquire()
    if (!gateToken) return null
    const token = { ...proposal, gateToken }
    this.operation = token
    return token
  }
  finish(token: { gateToken: object }) {
    if (this.operation === token) {
      this.operation = null
      this.gate.release(token.gateToken)
    }
  }
}
