import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit } from '../types'

const PANE = 'claudiostat-rings'
const limits = atom({ plugin: 'claudiostat-rings', key: 'limits' } as const, [] as Limit[])

// ClaudioStat's website colors, as its iPhone widget's rings wear them.
const PEACH = '#ffb266'
const ORANGE = '#ee7048'
const HOUR = 3_600_000

const LIMITS = [
  { kind: 'five_hour', label: 'Session', window: 5 * HOUR, color: ORANGE },
  { kind: 'seven_day', label: 'Week', window: 7 * 24 * HOUR, color: PEACH },
]

type Shown = { label: string; color: string; percent: number; leftMs: number | null; hand: number | null }

const show = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'ClaudioStat' })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const { rateLimits } = await $.session.usage()
    await update($, limits, () => rateLimits)
    void show($)

    return started
  })

  // Opened unasked at the start may wait until the desktop attaches.
  on('session.attach', ($, e, next) => (void show($), next(e)))

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => e.rateLimits)
    }
    void show($)

    return next(e)
  })

  // Always visible: a person's close is refused; the engine's own unload still closes it.
  on('ui.close', ($, e, next) => (e.id === PANE && e.origin.kind === 'person' ? { value: undefined } : next(e)))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const now = await $.clock.now()
    const readings = await read($, limits)
    const shown = LIMITS.flatMap((limit): Shown[] => {
      const reading = readings.find(one => one.kind === limit.kind)
      if (!reading) return []
      const resetsAt = reading.resetsAt ? Date.parse(reading.resetsAt) : NaN
      const leftMs = resetsAt > now ? resetsAt - now : null
      const hand = leftMs === null ? null : Math.min(1, Math.max(0, 1 - leftMs / limit.window))

      return [{ label: limit.label, color: limit.color, percent: reading.percentUsed, leftMs, hand }]
    })

    if (shown.length === 0) {
      return <Text dimColor>Your limits show after Claude's first reply.</Text>
    }

    return (
      <Box flexDirection="column" alignItems="center" gap="sm" padding="sm">
        {'Svg' in ui && (
          <ui.Svg
            source={rings(shown)}
            alt={shown.map(one => `${one.label} ${Math.round(one.percent)}%`).join(', ')}
            width={140}
            height={140}
          />
        )}
        {shown.map(one => (
          <Box flexDirection="row" gap="sm">
            <Text color={one.color} weight="bold" tabular>
              {one.label} {Math.round(one.percent)}%
            </Text>
            {one.leftMs !== null && <Text dimColor>resets in {timeLeft(one.leftMs)}</Text>}
          </Box>
        ))}
      </Box>
    )
  })
}

export function timeLeft(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)

  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes % 60}m`
}

// Session outside, week inside, each filled to its percentage, with a hand at the share of its window already passed:
// a ring ahead of its hand is faster than an even spread. The session's number is the big one in the middle.
function rings(shown: Shown[]): string {
  const width = 12
  const arcs = shown.map((one, index) => {
    const r = 51 - index * width * 1.32
    const fill = Math.min(100, Math.max(0, one.percent))
    const stroke = index === 0 ? 'url(#s)' : one.color
    const arc = fill > 0
      ? `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" pathLength="100" stroke-dasharray="${fill} 100" transform="rotate(-90 60 60)"/>`
      : ''
    const hand = one.hand === null ? '' : handLine(one.hand, r - width / 2 - 2, r + width / 2 + 2)

    return `<circle class="st" cx="60" cy="60" r="${r}" fill="none" stroke-width="${width}" stroke-opacity=".14"/>${arc}${hand}`
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
<style>.st{stroke:#1f0d0b}.fi{fill:#1f0d0b}@media (prefers-color-scheme:dark){.st{stroke:#fff4e6}.fi{fill:#fff4e6}}</style>
<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${PEACH}"/><stop offset="1" stop-color="${ORANGE}"/></linearGradient></defs>
${arcs.join('')}
<text class="fi" x="60" y="61" text-anchor="middle" dominant-baseline="central" font-family="system-ui,-apple-system,sans-serif" font-weight="700" font-size="24">${Math.round(shown[0]!.percent)}<tspan font-size="13">%</tspan></text>
</svg>`
}

function handLine(share: number, inner: number, outer: number): string {
  const radians = ((share * 360 - 90) * Math.PI) / 180
  const x = (r: number) => (60 + r * Math.cos(radians)).toFixed(2)
  const y = (r: number) => (60 + r * Math.sin(radians)).toFixed(2)

  return `<line class="st" x1="${x(inner)}" y1="${y(inner)}" x2="${x(outer)}" y2="${y(outer)}" stroke-width="3" stroke-linecap="round"/>`
}
