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

const HINT = {
  plugin: 'claudiostat-rings',
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '' },
} as const

test('the strip shows S, W, F, pace and budget from the account', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  // An hour ago W was 10 points lower and S 40 lower: S needs 20%/h to last its 2 h, W 20%/day for 4 days.
  mock.store(on, { samples: [snapshot(reply(20, 9), NOW - HOUR)] })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.authorize', () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(reply(60, 19)) } }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...HINT, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^S / }))?.props.color).toBe('#cd3e48')
  expect((await ui.find({ type: 'Text', text: /^W / }))?.text).toBe('W 19%')
  expect((await ui.find({ type: 'Text', text: /^F / }))?.text).toBe('F 10%')
  // W rose 10 points in an hour: 80%/day over 8 working hours, against 81% left over 4 days.
  expect((await ui.find({ type: 'Text', text: /^P / }))?.text).toBe('P 80%/day')
  expect((await ui.find({ type: 'Text', text: /^B / }))?.text).toBe('B 20%/day')
  expect((await ui.find({ type: 'Text', text: /^W / }))?.props.color).toBe('#cd3e48')
  await ui.unmount()

  expect(budget({ pct: 100, reset: NOW + HOUR }, NOW)).toBe(0)
  expect(speed([], 'w', 7 * 24 * HOUR, HOUR)).toBe(null)
  expect(timeLeft(45 * 60_000)).toBe('45m')
})
