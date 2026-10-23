import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Reading, Snap } from '../types'

const reading = atom({ plugin: 'claudiostat-rings', key: 'reading' } as const, null as Reading | null)

const USAGE = 'https://api.anthropic.com/api/oauth/usage'
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const EVERY = 3 * MINUTE
// ponytail: six hours of samples is plenty for the 30 min and 1 h speeds; after a longer idle stretch the first
// readings have no base and pace stays blank for ten minutes.
const KEEP = 6 * HOUR
const WORK_HOURS = 8

// ClaudioStat's website colors, as its widgets wear them.
const PEACH = '#ffb266'
const ORANGE = '#ee7048'
const ROSE = '#cd3e48'
const STAR = '#ffc094'

type Pace = 'ok' | 'fast' | 'tooFast'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void refresh($)
    $.clock.every(EVERY, () => void refresh($))

    return started
  })

  // The desktop app draws a mod only in a pane or this band above the prompt, not in the hint line under it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, reading)
    if (!r || e.props.hasSurvey) return next(e)
    const v = view(r, await $.clock.now())
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui

    return (
      <Box flexDirection="row" alignItems="center" gap="sm">
        {'Svg' in ui && (
          <ui.Svg source={rings(v)} alt={v.items.map(item => item.text).join(', ')} width={18} height={18} isInteractive />
        )}
        {v.items.map(item => (
          <Text color={v.isStale ? undefined : item.color} dimColor={v.isStale || !item.color} tabular>
            {item.text}
          </Text>
        ))}
      </Box>
    )
  })
}

// Several sessions share one reading through the store: whichever timer fires first fetches, the rest reuse it.
// ponytail: two sessions writing the samples at once can drop one sample; harmless for a 3 min series.
async function refresh($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  let samples = ((await $.store.get('samples')) as Snap[] | undefined) ?? []
  if (now - (samples.at(-1)?.at ?? 0) >= EVERY - 30_000) {
    const fresh = await fetchSnap($, now)
    if (fresh) {
      samples = [...samples.filter(one => one.at > now - KEEP), fresh]
      await $.store.set('samples', samples)
    }
  }
  const latest = samples.at(-1)
  if (!latest) return
  const next: Reading = {
    ...latest,
    sSpeed: speed(samples, 's', 5 * HOUR, 30 * MINUTE),
    wSpeed: speed(samples, 'w', 7 * DAY, HOUR),
  }
  await update($, reading, () => next)
}

async function fetchSnap($: EngineInterface, now: number): Promise<Snap | null> {
  const auth = await $.session.authorize()
  if (!auth) return null
  try {
    const reply = await $.http.fetch(USAGE, { auth: auth.handle, headers: { 'anthropic-beta': 'oauth-2025-04-20' } })

    return reply.ok ? snapshot(JSON.parse(reply.text), now) : null
  } catch {
    return null
  }
}

/** The usage reply as ClaudioStat reads it: five_hour is S, seven_day is W, the first Fable window is F. */
export function snapshot(reply: any, at: number): Snap | null {
  const isFable = (name: unknown) => typeof name === 'string' && name.toLowerCase().includes('fable')
  const row = (reply?.limits ?? []).find(
    (one: any) => one?.kind === 'weekly_scoped' && isFable(one?.scope?.model?.display_name),
  )
  // At 0% Fable use the reply has no model_scoped entry, only the limits row.
  const fable =
    (reply?.model_scoped ?? []).find((one: any) => isFable(one?.display_name)) ??
    (row && { utilization: row.percent, resets_at: row.resets_at })
  const s = limit(reply?.five_hour)
  const w = limit(reply?.seven_day)
  const f = limit(fable)

  return s || w ? { at, ...(s && { s }), ...(w && { w }), ...(f && { f }) } : null
}

function limit(window: any): Limit | undefined {
  if (typeof window?.utilization !== 'number') return undefined
  const reset = typeof window.resets_at === 'string' ? Date.parse(window.resets_at) : NaN

  return { pct: Math.floor(window.utilization), reset: Number.isNaN(reset) ? null : reset }
}

/**
 * ClaudioStat's speed(): how fast a limit rose since the last reading at least `window` old, in percent per hour.
 * A limit that started over inside the window rose from 0; with no reading that old, the oldest of the same window
 * at least ten minutes old stands in.
 */
export function speed(samples: Snap[], key: 's' | 'w', length: number, window: number): number | null {
  const latest = samples.at(-1)
  const now = latest?.[key]
  if (!latest || !now || now.reset === null) return null
  const start = latest.at - window
  if (now.reset - length >= start) return (now.pct * HOUR) / window
  const same = samples.filter(one => sameWindow(one[key], now))
  const before = same.filter(one => one.at <= start).at(-1) ?? same.find(one => one.at <= latest.at - 10 * MINUTE)
  if (!before) return null

  return (Math.max(0, now.pct - before[key]!.pct) * HOUR) / (latest.at - before.at)
}

// resets_at drifts by fractions of a second between replies; real windows are hours apart.
const sameWindow = (a: Limit | undefined, b: Limit) => a?.reset != null && b.reset !== null && Math.abs(a.reset - b.reset) < HOUR

/** B: what's left of the week over the whole days until the reset, rounded down. */
export function budget(week: Limit, now: number): number | null {
  const remaining = Math.max(0, 100 - week.pct)
  if (remaining === 0) return 0
  if (week.reset === null) return null
  // The epsilon keeps float noise (3.000000001) from rounding up to the next day.
  const days = Math.ceil((week.reset - now) / DAY - 1e-9)

  return days <= 0 ? remaining : Math.floor(remaining / days)
}

/** S against an even spread of what's left until its reset: orange once faster, red 5 points per hour past it. */
function sessionPace(s: Limit, sSpeed: number | null, now: number): Pace {
  if (sSpeed === null || s.reset === null || s.reset <= now) return 'ok'
  const needed = (Math.max(0, 100 - s.pct) * HOUR) / (s.reset - now)

  return sSpeed > needed + 5 ? 'tooFast' : sSpeed > needed ? 'fast' : 'ok'
}

/** P against B: orange past the budget, red from twice it. */
const overBudget = (p: number | null, b: number | null): Pace =>
  p === null || b === null ? 'ok' : p > 0 && p >= 2 * b ? 'tooFast' : p > b ? 'fast' : 'ok'

const PACE_COLOR: Record<Pace, string | undefined> = { ok: undefined, fast: ORANGE, tooFast: ROSE }

type Item = { text: string; color?: string | undefined }
type View = { items: Item[]; isStale: boolean; title: string; rings: { pct: number; color: string }[] }

export function view(r: Reading, now: number): View {
  const p = r.wSpeed === null ? null : r.wSpeed * WORK_HOURS
  const b = r.w ? budget(r.w, now) : null
  const short = (n: number) => `${Math.round(n * 10) / 10}`
  const items: Item[] = []
  const titles: string[] = []
  const add = (letter: string, name: string, l: Limit | undefined, color: string | undefined) => {
    if (!l) return
    items.push({ text: `${letter} ${l.pct}%`, color })
    if (l.reset !== null && l.reset > now) titles.push(`${name} resets in ${timeLeft(l.reset - now)}`)
  }
  add('S', 'Session', r.s, r.s && PACE_COLOR[sessionPace(r.s, r.sSpeed, now)])
  add('W', 'Week', r.w, PACE_COLOR[overBudget(p, b)])
  add('F', 'Fable', r.f, undefined)
  if (p !== null) items.push({ text: `P ${short(p)}%/day` })
  if (b !== null) items.push({ text: `B ${b}%/day` })

  return {
    items,
    isStale: now - r.at > HOUR,
    title: titles.join('\n'),
    rings: [
      ...(r.s ? [{ pct: r.s.pct, color: ORANGE }] : []),
      ...(r.w ? [{ pct: r.w.pct, color: PEACH }] : []),
      ...(r.f ? [{ pct: r.f.pct, color: STAR }] : []),
    ],
  }
}

export function timeLeft(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / MINUTE))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)

  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes % 60}m`
}

// Session outside, week inside, Fable innermost, each filled to its percentage; hovering shows the resets.
function rings(v: View): string {
  const width = 11
  const arcs = v.rings.map((ring, index) => {
    const r = 44.5 - index * 15
    const fill = Math.min(100, Math.max(0, ring.pct))
    const arc = fill > 0
      ? `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${ring.color}" stroke-width="${width}" stroke-linecap="round" pathLength="100" stroke-dasharray="${fill} 100" transform="rotate(-90 50 50)"/>`
      : ''

    return `<circle class="st" cx="50" cy="50" r="${r}" fill="none" stroke-width="${width}" stroke-opacity=".18"/>${arc}`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<title>${v.title}</title>
<style>.st{stroke:#1f0d0b}@media (prefers-color-scheme:dark){.st{stroke:#fff4e6}}</style>
${arcs.join('')}
</svg>`
}
