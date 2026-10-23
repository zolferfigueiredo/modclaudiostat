export type Limit = { pct: number; reset: number | null }

export type Snap = { at: number; s?: Limit; w?: Limit; f?: Limit }

export type Reading = Snap & { sSpeed: number | null; wSpeed: number | null }

/** As in ClaudioStat: P and B per working hour or per day, and how many hours a working day has. */
export type RingSettings = { unit: 'hour' | 'day'; workHours: number }

declare module 'claude-code' {
  interface PluginState {
    'claudiostat-rings': { reading: Reading | null; settings: RingSettings; isSettingsOpen: boolean }
  }
}
