import { expect, mock, test } from 'claude-code/testing'

import { addSamples, chartSvg, remainingOf, textSparkline } from '../hooks/chart'

const START = Date.parse('2026-10-15T00:00:00Z')
const HOUR = 3_600_000
const PANE = { plugin: 'usage-graph', component: 'Pane', requestId: 'usage-graph' } as const
const PANE_PROPS = {
  title: '残り使用量',
  isFocused: false,
  bodyColumns: 40,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const
const CONTEXT = { window: 200_000 }

const limits = (fiveHour: number, sevenDay: number) => [
  { kind: 'five_hour', percentUsed: fiveHour, resetsAt: new Date(START + 3 * HOUR).toISOString() },
  { kind: 'seven_day', percentUsed: sevenDay, resetsAt: new Date(START + 50 * HOUR).toISOString() },
]

test('remaining is 100 minus used, held between 0 and 100', () => {
  expect(remainingOf(23.5)).toBe(76.5)
  expect(remainingOf(130)).toBe(0)
  expect(remainingOf(-1)).toBe(100)
})

test('a repeated reading is not stored again within ten minutes', () => {
  const one = addSamples([], [{ kind: 'five_hour', percentUsed: 10 }], START)
  const two = addSamples(one, [{ kind: 'five_hour', percentUsed: 10 }], START + 60_000)
  const three = addSamples(two, [{ kind: 'five_hour', percentUsed: 12 }], START + 120_000)
  expect(two).toHaveLength(1)
  expect(three).toHaveLength(2)
})

test('the chart draws one line per window and the sparkline fills its width', () => {
  const samples = addSamples([], limits(20, 40), START)
  const svg = chartSvg(samples, limits(20, 40), '5h', START + HOUR)
  expect(svg.match(/<path /g)).toHaveLength(2)
  expect(textSparkline(samples.filter(s => s.kind === 'five_hour'), '5h', START + HOUR)).toHaveLength(24)
})

test('the pane shows each window after a measurement, on every surface', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: START })
  on('session.usage', () => ({ value: { startedAt: START, context: CONTEXT, rateLimits: [] } }))
  on('session.start', () => ({ cwd: '/' }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('command.register', () => ({ value: { command: 'usage-graph' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const empty = await $.ui.mount({ ...PANE, surface, props: PANE_PROPS })
    expect(await empty.find({ text: /まだレート制限の値がありません/ })).toBeDefined()
    await empty.unmount()
  }

  await $.session.measure({ context: CONTEXT, rateLimits: limits(23.5, 60), changed: ['rateLimits'] })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: PANE_PROPS })
    expect(await ui.find({ text: '残り 76.5%' })).toBeDefined()
    expect(await ui.find({ text: '残り 40%' })).toBeDefined()
    expect(await ui.find({ text: /リセットまで 3時間0分/ })).toBeDefined()
    await ui.press({ key: 'range-7d' })
    expect(await ui.find({ key: 'chart' })).toBeDefined()
    await ui.unmount()
  }
})
