import { expect, mock, test } from 'claude-code/testing'

import { budget, snapshot, speed, timeLeft, view } from './register'

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
  // An hour ago W was 10 points lower and S 40 lower.
  mock.store(on, { samples: [snapshot(reply(20, 9), NOW - HOUR)] })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.authorize', () => ({ value: { handle: 'h', kind: 'bearer' } }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(reply(60, 19)) } }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const value = async (text: RegExp) => ui.find({ type: 'Text', text })
  // S's 60% sits right on the 60% of its window gone: orange, not yet past it.
  expect((await value(/^60%$/))?.props.color).toBe('#ee7048')
  // W's pace is high, but 19% is far behind the 54% of the week gone, so it stays uncolored.
  expect((await value(/^19%$/))?.props.color).toBeUndefined()
  expect(await value(/^10%$/)).toBeDefined()
  // Per working hour by default: W rose 10 points in an hour, against 81% left over 26 working hours.
  expect(await value(/^10%\/h$/)).toBeDefined()
  expect(await value(/^3\.1%\/h$/)).toBeDefined()
  // Session resets in 2 h, week in 3 d 6 h; Fable shares the week's reset, so its time is left out.
  expect(await value(/^2h$/)).toBeDefined()
  expect(await value(/^3d 6h$/)).toBeDefined()

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

test('F and its ring show only from 1%', async () => {
  const letters = (pct: number) => {
    const v = view({ at: NOW, f: { pct, reset: null }, sSpeed: null, wSpeed: null }, { unit: 'hour', workHours: 8 }, NOW)

    return [v.items.map(item => item.letter).join(''), v.rings.length]
  }
  expect(letters(0)).toEqual(['', 0])
  expect(letters(1)).toEqual(['F', 1])
})

test('P reads 0 until there is a pace to show', async () => {
  const pace = (unit: 'hour' | 'day') =>
    view({ at: NOW, w: { pct: 0, reset: null }, sSpeed: null, wSpeed: null }, { unit, workHours: 8 }, NOW).items.find(
      item => item.letter === 'P',
    )?.value
  expect(pace('hour')).toBe('0%/h')
  expect(pace('day')).toBe('0%/day')
})

test('S and W turn orange near their time mark and red past it while outrunning it', async () => {
  // Half of each window gone: both marks are at 50%. S's moves 20 points an hour, W's about 0.6.
  const color = (letter: 'S' | 'W', pct: number, speed: number | null) => {
    const s = { pct, reset: NOW + 2.5 * HOUR }
    const w = { pct, reset: NOW + 3.5 * 24 * HOUR }
    const r = letter === 'S' ? { s, sSpeed: speed, wSpeed: null } : { w, sSpeed: null, wSpeed: speed }

    return view({ at: NOW, ...r }, { unit: 'hour', workHours: 8 }, NOW).items.find(item => item.letter === letter)?.color
  }
  for (const [letter, fast, slow] of [['S', 30, 10], ['W', 50, 0.5]] as const) {
    // A high pace alone doesn't color it.
    expect(color(letter, 0, fast)).toBeUndefined()
    expect(color(letter, 44, fast)).toBeUndefined()
    expect(color(letter, 45, fast)).toBe('#ee7048')
    expect(color(letter, 50, fast)).toBe('#ee7048')
    expect(color(letter, 51, fast)).toBe('#cd3e48')
    // Past the mark but slower than it, or with no pace yet: the mark is catching up, so orange.
    expect(color(letter, 51, slow)).toBe('#ee7048')
    expect(color(letter, 51, null)).toBe('#ee7048')
  }
})
