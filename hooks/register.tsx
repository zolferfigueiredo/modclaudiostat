import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Reading, RingSettings, Snap } from '../types'

const reading = atom({ plugin: 'claudiostat-rings', key: 'reading' } as const, null as Reading | null)
const settings = atom({ plugin: 'claudiostat-rings', key: 'settings' } as const, { unit: 'hour', workHours: 8 } as RingSettings)
const isSettingsOpen = atom({ plugin: 'claudiostat-rings', key: 'isSettingsOpen' } as const, false)

const USAGE = 'https://api.anthropic.com/api/oauth/usage'
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const EVERY = 3 * MINUTE
// ponytail: six hours of samples is plenty for the 30 min and 1 h speeds; after a longer idle stretch the first
// readings have no base and pace stays blank for ten minutes.
const KEEP = 6 * HOUR

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

  on('ui.message', async ($, e, next) => {
    if (e.element === 'gear') await update($, isSettingsOpen, open => !open)

    return next(e)
  })

  // The desktop app draws a mod only in a pane or this band above the prompt, not in the hint line under it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, reading)
    if (!r || e.props.hasSurvey) return next(e)
    const s = await read($, settings)
    const v = view(r, s, await $.clock.now())
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui

    return (
      <Box flexDirection="column" gap="xs">
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" width="100%">
          <Box flexDirection="row" alignItems="center" gap="sm">
            {'Svg' in ui && (
              <ui.Svg
                source={rings(v)}
                alt={v.items.map(item => `${item.letter} ${item.value}`).join(', ')}
                width={18}
                height={18}
                isInteractive
              />
            )}
            {v.items.map(item => (
              <Box flexDirection="row" gap="xs">
                <Text dimColor>{item.letter}</Text>
                <Text color={v.isStale ? undefined : item.color} dimColor={v.isStale} weight="semibold" tabular>
                  {item.value}
                </Text>
                {item.reset && (
                  <Text dimColor tabular>
                    {item.reset}
                  </Text>
                )}
              </Box>
            ))}
          </Box>
          {'Client' in ui && <ui.Client key="gear" module="./gear.tsx" />}
        </Box>
        {(await read($, isSettingsOpen)) && (
          <Box flexDirection="row" alignItems="center" gap="sm">
            <Text dimColor>Pace and budget</Text>
            {(['hour', 'day'] as const).map(unit => (
              <Button
                key={unit}
                label={unit === 'hour' ? 'Per hour' : 'Per day'}
                variant={s.unit === unit ? 'primary' : 'secondary'}
                onPress={() => change($, old => ({ ...old, unit }))}
              />
            ))}
            <Text dimColor>Working hours</Text>
            <Button key="fewer" label="-" onPress={() => change($, old => ({ ...old, workHours: Math.max(1, old.workHours - 1) }))} />
            <Text tabular>{s.workHours}</Text>
            <Button key="more" label="+" onPress={() => change($, old => ({ ...old, workHours: Math.min(24, old.workHours + 1) }))} />
            <Button key="done" label="Done" onPress={() => update($, isSettingsOpen, () => false)} />
          </Box>
        )}
      </Box>
    )
  })
}

// RingSettings are kept in the store, so every session and the next one use the same.
async function change($: EngineInterface, fn: (old: RingSettings) => RingSettings): Promise<void> {
  const next = fn(await read($, settings))
  await update($, settings, () => next)
  await $.store.set('settings', next)
}

// Several sessions share one reading through the store: whichever timer fires first fetches, the rest reuse it.
// ponytail: two sessions writing the samples at once can drop one sample; harmless for a 3 min series.
async function refresh($: EngineInterface): Promise<void> {
  const saved = (await $.store.get('settings')) as RingSettings | undefined
  if (saved) await update($, settings, () => saved)
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

/** B: what's left of the week over the whole days (or working hours) until the reset, rounded down. */
export function budget(week: Limit, s: RingSettings, now: number): number | null {
  const remaining = Math.max(0, 100 - week.pct)
  if (remaining === 0) return 0
  if (week.reset === null) return null
  const isHour = s.unit === 'hour'
  const left = (week.reset - now) * (isHour ? s.workHours / 24 : 1)
  // The epsilon keeps float noise (3.000000001) from rounding up to the next day.
  const units = Math.ceil(left / (isHour ? HOUR : DAY) - 1e-9)
  if (units <= 0) return remaining
  const steps = isHour ? 10 : 1

  return Math.floor((remaining * steps) / units) / steps
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

type Item = { letter: string; value: string; color?: string | undefined; reset?: string }
type Ring = { pct: number; color: string; hand: number | null }
type View = { items: Item[]; isStale: boolean; title: string; rings: Ring[] }

export function view(r: Reading, s: RingSettings, now: number): View {
  const p = r.wSpeed === null ? null : r.wSpeed * (s.unit === 'hour' ? 1 : s.workHours)
  const b = r.w ? budget(r.w, s, now) : null
  const per = s.unit === 'hour' ? '%/h' : '%/day'
  const rate = (n: number) => `${Math.round(n * 10) / 10}${per}`
  const items: Item[] = []
  const titles: string[] = []
  const add = (letter: string, name: string, l: Limit | undefined, color: string | undefined, showReset = true) => {
    if (!l) return
    const left = l.reset !== null && l.reset > now ? timeLeft(l.reset - now) : undefined
    items.push({ letter, value: `${l.pct}%`, color, ...(showReset && left ? { reset: left } : {}) })
    if (left) titles.push(`${name} resets in ${left}`)
  }
  add('S', 'Session', r.s, r.s && PACE_COLOR[sessionPace(r.s, r.sSpeed, now)])
  add('W', 'Week', r.w, PACE_COLOR[overBudget(p, b)])
  // Fable mostly resets with the week: its time only shows when it differs.
  add('F', 'Fable', r.f, undefined, !(r.f && r.w && sameWindow(r.f, r.w)))
  if (r.w) items.push({ letter: 'P', value: p === null ? '…' : rate(p) })
  if (p === null && r.w) titles.push('Pace shows after about ten minutes of readings')
  if (b !== null) items.push({ letter: 'B', value: rate(b) })

  return {
    items,
    isStale: now - r.at > HOUR,
    title: titles.join('\n'),
    rings: [
      ...(r.s ? [{ pct: r.s.pct, color: ORANGE, hand: passed(r.s, 5 * HOUR, now) }] : []),
      ...(r.w ? [{ pct: r.w.pct, color: PEACH, hand: passed(r.w, 7 * DAY, now) }] : []),
      ...(r.f ? [{ pct: r.f.pct, color: STAR, hand: passed(r.f, 7 * DAY, now) }] : []),
    ],
  }
}

export function timeLeft(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / MINUTE))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)

  const rest = (big: string, small: number, unit: string) => (small ? `${big} ${small}${unit}` : big)

  return days ? rest(`${days}d`, hours, 'h') : hours ? rest(`${hours}h`, minutes % 60, 'm') : `${minutes % 60}m`
}

// Session outside, week inside, Fable innermost, each filled to its percentage; hovering shows the resets.
/** How much of the limit's window has passed, for its hand; null without a future reset. */
const passed = (l: Limit, window: number, now: number) =>
  l.reset === null || l.reset <= now ? null : Math.min(1, Math.max(0, 1 - (l.reset - now) / window))

// A ring ahead of its hand is faster than an even spread, as on the ClaudioStat widgets.
function rings(v: View): string {
  const width = 11
  const arcs = v.rings.map((ring, index) => {
    const r = 42 - index * 14
    const fill = Math.min(100, Math.max(0, ring.pct))
    const arc = fill > 0
      ? `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${ring.color}" stroke-width="${width}" stroke-linecap="round" pathLength="100" stroke-dasharray="${fill} 100" transform="rotate(-90 50 50)"/>`
      : ''

    const hand = ring.hand === null ? '' : handLine(ring.hand, r - width / 2 - 2, r + width / 2 + 2)

    return `<circle class="st" cx="50" cy="50" r="${r}" fill="none" stroke-width="${width}" stroke-opacity=".18"/>${arc}${hand}`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<title>${v.title}</title>
<style>.st{stroke:#1f0d0b}@media (prefers-color-scheme:dark){.st{stroke:#fff4e6}}</style>
${arcs.join('')}
</svg>`
}

function handLine(share: number, inner: number, outer: number): string {
  const radians = ((share * 360 - 90) * Math.PI) / 180
  const x = (r: number) => (50 + r * Math.cos(radians)).toFixed(2)
  const y = (r: number) => (50 + r * Math.sin(radians)).toFixed(2)

  return `<line class="st" x1="${x(inner)}" y1="${y(inner)}" x2="${x(outer)}" y2="${y(outer)}" stroke-width="6" stroke-linecap="round"/>`
}
