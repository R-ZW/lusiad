export type SyntaxDecision = 'apply' | 'correct' | 'cancel'

/** One review owns one decision. A late response cannot authorize another draft. */
export class SyntaxReviewSession {
  private active: { ticket: object; resolve: (decision: SyntaxDecision) => void } | null = null
  open() {
    this.invalidate()
    const ticket = {}
    const decision = new Promise<SyntaxDecision>(resolve => { this.active = { ticket, resolve } })
    return { ticket, decision }
  }
  current(ticket: object) { return this.active?.ticket === ticket }
  decide(ticket: object, decision: SyntaxDecision) {
    if (!this.current(ticket)) return false
    const resolve = this.active!.resolve
    this.active = null
    resolve(decision)
    return true
  }
  invalidate() { if (this.active) this.decide(this.active.ticket, 'correct') }
}
