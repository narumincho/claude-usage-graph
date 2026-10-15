export type UsageWindow = { kind: string; percentUsed: number; resetsAt?: string }
export type UsageSample = { at: number; kind: string; percentUsed: number }
export type UsageRange = '5h' | '24h' | '7d'

declare module 'claude-code' {
  interface PluginState {
    'usage-graph': {
      windows: UsageWindow[]
      history: UsageSample[]
      now: number
      range: UsageRange
    }
  }
}
