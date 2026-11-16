export interface TourRect { left: number; top: number; width: number; height: number }
export interface TourViewport { width: number; height: number }

export function clipTourRect(rect: TourRect, bounds: TourRect): TourRect | null {
  const left = Math.max(rect.left, bounds.left), top = Math.max(rect.top, bounds.top)
  const right = Math.min(rect.left + rect.width, bounds.left + bounds.width)
  const bottom = Math.min(rect.top + rect.height, bounds.top + bounds.height)
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null
}

/** Prefer a free side of the highlight, then the smallest overlap on narrow screens. */
export function placeTourCard(target: TourRect | null, card: TourViewport, viewport: TourViewport) {
  const margin = 12, gap = 12
  const clamp = (value: number, size: number, limit: number) => Math.max(margin, Math.min(value, limit - size - margin))
  const center = { left: (viewport.width - card.width) / 2, top: (viewport.height - card.height) / 2 }
  const candidates = target ? [
    { left: target.left + (target.width - card.width) / 2, top: target.top + target.height + gap },
    { left: target.left + (target.width - card.width) / 2, top: target.top - card.height - gap },
    { left: target.left + target.width + gap, top: target.top + (target.height - card.height) / 2 },
    { left: target.left - card.width - gap, top: target.top + (target.height - card.height) / 2 },
  ] : [center]
  const positioned = candidates.map(point => ({
    left: clamp(point.left, card.width, viewport.width), top: clamp(point.top, card.height, viewport.height),
  }))
  return positioned.reduce((best, point) => {
    const overlap = (value: typeof point) => {
      const intersection = target && clipTourRect({ ...value, ...card }, target)
      return intersection ? intersection.width * intersection.height : 0
    }
    return overlap(point) < overlap(best) ? point : best
  })
}
