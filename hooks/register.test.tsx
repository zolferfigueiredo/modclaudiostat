import { expect, mock, test } from 'claude-code/testing'

import { timeLeft } from './register'

const NOW = Date.parse('2026-10-23T12:00:00Z')

const PANE = {
  plugin: 'claudiostat-rings',
  component: 'Pane',
  requestId: 'claudiostat-rings',
  props: {
    title: 'ClaudioStat',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the panel shows session and week with their resets', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-23T14:10:00Z' },
      { kind: 'seven_day', percentUsed: 18.5, resetsAt: '2026-10-26T16:00:00Z' },
    ],
    changed: ['rateLimits'],
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })
  expect(svg?.props.alt).toBe('Session 42%, Week 19%')
  expect(svg?.props.source).toContain('stroke-dasharray="42 100"')
  expect((await ui.find({ type: 'Text', text: /2h 10m/ }))?.text).toBe('resets in 2h 10m')
  expect((await ui.find({ type: 'Text', text: /3d 4h/ }))?.text).toBe('resets in 3d 4h')
  await ui.unmount()

  expect(timeLeft(45 * 60_000)).toBe('45m')
})
