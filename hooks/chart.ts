import type { UsageRange, UsageSample, UsageWindow } from '../types'

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
export const KEEP_MS = 7 * DAY
const MAX_SAMPLES = 4000
// A reading equal to the last one is kept only once this long has passed.
const SAME_READING_MS = 10 * MINUTE

export const RANGES: readonly UsageRange[] = ['5h', '24h', '7d']
export const RANGE_MS: Record<UsageRange, number> = { '5h': 5 * HOUR, '24h': DAY, '7d': 7 * DAY }

const ORDER = ['five_hour', 'seven_day', 'spend_limit']
const LABELS: Record<string, string> = {
  five_hour: '5時間枠',
  seven_day: '週間枠',
  spend_limit: '利用上限',
}
const COLORS: Record<string, string> = {
  five_hour: '#d97757',
  seven_day: '#6a9bcc',
  spend_limit: '#7aa36a',
}
export const LOW_COLOR = '#e5534b'

export const labelOf = (kind: string): string => LABELS[kind] ?? kind
export const colorOf = (kind: string): string => COLORS[kind] ?? '#a68bd1'

export const remainingOf = (percentUsed: number): number =>
  Math.min(100, Math.max(0, Math.round((100 - percentUsed) * 10) / 10))

export const byKind = (a: string, b: string): number => {
  const rank = (kind: string) => (ORDER.includes(kind) ? ORDER.indexOf(kind) : ORDER.length)
  return rank(a) - rank(b) || a.localeCompare(b)
}

export function toSamples(value: unknown): UsageSample[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (one): one is UsageSample =>
      typeof one === 'object' &&
      one !== null &&
      typeof one.at === 'number' &&
      typeof one.kind === 'string' &&
      typeof one.percentUsed === 'number',
  )
}

export function addSamples(
  history: readonly UsageSample[],
  windows: readonly UsageWindow[],
  at: number,
): UsageSample[] {
  const kept = history.filter(one => one.at > at - KEEP_MS && one.at <= at)
  for (const { kind, percentUsed } of windows) {
    const last = kept.findLast(one => one.kind === kind)
    if (last && last.percentUsed === percentUsed && at - last.at < SAME_READING_MS) continue
    kept.push({ at, kind, percentUsed })
  }
  kept.sort((a, b) => a.at - b.at)
  return kept.slice(-MAX_SAMPLES)
}

export function formatDuration(ms: number): string {
  if (ms < MINUTE) return 'まもなく'
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  const minutes = Math.floor((ms % HOUR) / MINUTE)
  if (days > 0) return `${days}日${hours}時間`
  if (hours > 0) return `${hours}時間${minutes}分`
  return `${minutes}分`
}

export function resetText(window: UsageWindow, now: number): string | undefined {
  if (window.resetsAt === undefined) return undefined
  const at = Date.parse(window.resetsAt)
  if (Number.isNaN(at)) return undefined
  return at <= now ? 'リセット済み(次の応答で更新)' : `リセットまで ${formatDuration(at - now)}`
}

// The remaining percentage held between readings, as [time, remaining] steps
// inside [from, now]: the reading before `from` opens the line at `from`, and
// a window still current holds its last reading on to `now`.
function steps(
  samples: readonly UsageSample[],
  from: number,
  now: number,
  isCurrent: boolean,
): [number, number][] {
  const before = samples.findLast(one => one.at <= from)
  const inside = samples.filter(one => one.at > from && one.at <= now)
  const points: [number, number][] = []
  if (before) points.push([from, remainingOf(before.percentUsed)])
  for (const one of inside) points.push([one.at, remainingOf(one.percentUsed)])
  const last = points.at(-1)
  if (last && isCurrent && last[0] < now) points.push([now, last[1]])
  return points
}

const W = 320
const H = 150
const LEFT = 34
const RIGHT = 8
const TOP = 10
const BOTTOM = 20

export function chartSvg(
  history: readonly UsageSample[],
  windows: readonly UsageWindow[],
  range: UsageRange,
  now: number,
): string {
  const span = RANGE_MS[range]
  const from = now - span
  const plotW = W - LEFT - RIGHT
  const plotH = H - TOP - BOTTOM
  const x = (t: number) => (LEFT + ((t - from) / span) * plotW).toFixed(1)
  const y = (remaining: number) => (TOP + (1 - remaining / 100) * plotH).toFixed(1)

  const grid = [0, 25, 50, 75, 100]
    .map(
      level =>
        `<line x1="${LEFT}" x2="${W - RIGHT}" y1="${y(level)}" y2="${y(level)}" stroke="#888" stroke-opacity="${level === 0 ? 0.5 : 0.2}"/>` +
        `<text x="${LEFT - 4}" y="${y(level)}" dy="3" text-anchor="end">${level}%</text>`,
    )
    .join('')
  const axis =
    `<text x="${LEFT}" y="${H - 5}">-${range}</text>` +
    `<text x="${W - RIGHT}" y="${H - 5}" text-anchor="end">今</text>`

  const kinds = [...new Set([...history.map(one => one.kind), ...windows.map(one => one.kind)])].sort(byKind)
  const lines = kinds
    .map(kind => {
      const current = windows.find(one => one.kind === kind)
      const isCurrent =
        current !== undefined &&
        (current.resetsAt === undefined || Date.parse(current.resetsAt) > now)
      const points = steps(
        history.filter(one => one.kind === kind),
        from,
        now,
        isCurrent,
      )
      if (points.length === 0) return ''
      const path = points
        .map(([t, remaining], i) => {
          const prev = points[i - 1]
          if (!prev) return `M${x(t)},${y(remaining)}`
          return `H${x(t)}V${y(remaining)}`
        })
        .join('')
      const [lastT, lastRemaining] = points[points.length - 1]!
      return (
        `<path d="${path}" fill="none" stroke="${colorOf(kind)}" stroke-width="2" stroke-linejoin="round"/>` +
        `<circle cx="${x(lastT)}" cy="${y(lastRemaining)}" r="3" fill="${colorOf(kind)}"/>`
      )
    })
    .join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ` +
    `font-family="system-ui, sans-serif" font-size="10" fill="#888">` +
    grid +
    axis +
    lines +
    `</svg>`
  )
}

export function barSvg(remaining: number, color: string): string {
  const width = 300
  const filled = ((remaining / 100) * width).toFixed(1)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="10" viewBox="0 0 ${width} 10">` +
    `<rect width="${width}" height="10" rx="5" fill="#888" fill-opacity="0.25"/>` +
    `<rect width="${filled}" height="10" rx="5" fill="${color}"/>` +
    `</svg>`
  )
}

export function textBar(remaining: number, width = 20): string {
  const filled = Math.round((remaining / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

const BLOCKS = '▁▂▃▄▅▆▇█'

// One glyph per slice of the range, the remaining percentage held at its end;
// a space where nothing was known yet.
export function textSparkline(
  samples: readonly UsageSample[],
  range: UsageRange,
  now: number,
  width = 24,
): string {
  const span = RANGE_MS[range]
  let glyphs = ''
  for (let i = 1; i <= width; i++) {
    const end = now - span + (span * i) / width
    const last = samples.findLast(one => one.at <= end)
    glyphs += last
      ? BLOCKS[Math.min(BLOCKS.length - 1, Math.floor((remainingOf(last.percentUsed) / 100) * BLOCKS.length))]
      : ' '
  }
  return glyphs
}
