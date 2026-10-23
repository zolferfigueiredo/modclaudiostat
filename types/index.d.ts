export type Limit = { pct: number; reset: number | null }

export type Snap = { at: number; s?: Limit; w?: Limit; f?: Limit }

export type Reading = Snap & { sSpeed: number | null; wSpeed: number | null }

declare module 'claude-code' {
  interface PluginState {
    'claudiostat-rings': { reading: Reading | null }
  }
}
