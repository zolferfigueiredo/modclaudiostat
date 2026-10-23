import { expect, mock, test } from 'claude-code/testing'

import { budget, snapshot, speed, timeLeft } from './register'

const NOW = Date.parse('2026-10-24T12:00:00Z')
const HOUR = 3_600_000

const reply = (s: number, w: number) => ({
  five_hour: { utilization: s, resets_at: '2026-10-24T14:00:00+00:00' },
  seven_day: { utilization: w, resets_at: '2026-10-27T18:00:00+00:00' },
  limits: [
    {
      kind: 'weekly_scoped',
      percent: 10,
      resets_at: '2026-10-27T18:00:00+00:00',
      scope: { model: { display_name: 'Fable' } },
    },
  ],
})

const BAND = {
  plugin: 'claudiostat-rings',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('the strip shows S, W, F, pace and budget from the account', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  // An hour ago W was 10 points lower and S 40 lower: both well past what lasts until their resets.
  mock.store(on, { samples: [snapshot(reply(20, 9), NOW - HOUR)] })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.authorize', () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(reply(60, 19)) } }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const value = async (text: RegExp) => ui.find({ type: 'Text', text })
  expect((await value(/^60%$/))?.props.color).toBe('#cd3e48')
  expect((await value(/^19%$/))?.props.color).toBe('#cd3e48')
  expect(await value(/^10%$/)).toBeDefined()
  // Per working hour by default: W rose 10 points in an hour, against 81% left over 26 working hours.
  expect(await value(/^10%\/h$/)).toBeDefined()
  expect(await value(/^3\.1%\/h$/)).toBeDefined()

  expect((await ui.find({ type: 'Text', in: 'gear' }))?.props.size).toBe('title')
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'gear' })
  await ui.press({ key: 'day' })
  // Per day: 80%/day over 8 working hours, against 81% left over 4 days.
  expect(await value(/^80%\/day$/)).toBeDefined()
  expect(await value(/^20%\/day$/)).toBeDefined()
  await ui.unmount()

  expect(budget({ pct: 100, reset: NOW + HOUR }, { unit: 'hour', workHours: 8 }, NOW)).toBe(0)
  expect(speed([], 'w', 7 * 24 * HOUR, HOUR)).toBe(null)
  expect(timeLeft(45 * 60_000)).toBe('45m')
})
