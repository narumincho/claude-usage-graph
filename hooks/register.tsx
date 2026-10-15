import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { UsageWindow } from '../types'
import {
  LOW_COLOR,
  MINUTE,
  RANGES,
  addSamples,
  barSvg,
  byKind,
  chartSvg,
  colorOf,
  labelOf,
  remainingOf,
  resetText,
  textBar,
  textSparkline,
  toSamples,
} from './chart'

const PANE = 'usage-graph'
const TITLE = '残り使用量'
const STORE_KEY = 'history'

const windows = atom({ plugin: 'usage-graph', key: 'windows' } as const, [])
const history = atom({ plugin: 'usage-graph', key: 'history' } as const, [])
const now = atom({ plugin: 'usage-graph', key: 'now' } as const, 0)
const range = atom({ plugin: 'usage-graph', key: 'range' } as const, '24h')

// Takes a reading: the windows as they stand, one more point of history
// (kept in $.store across sessions), and the clock the countdowns read.
async function record($: EngineInterface, limits: readonly SessionRateLimit[]) {
  const at = await $.clock.now()
  const fresh: UsageWindow[] = limits
    .map(({ kind, percentUsed, resetsAt }) =>
      resetsAt === undefined ? { kind, percentUsed } : { kind, percentUsed, resetsAt },
    )
    .sort((a, b) => byKind(a.kind, b.kind))
  const merged = addSamples(toSamples(await $.store.get(STORE_KEY)), fresh, at)
  await $.store.set(STORE_KEY, merged)
  await update($, windows, () => fresh)
  await update($, history, () => merged)
  await update($, now, () => at)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-graph',
      description: 'Show the remaining rate-limit usage as a graph in a pane',
    })
    const at = await $.clock.now()
    const stored = toSamples(await $.store.get(STORE_KEY))
    await update($, history, () => addSamples(stored, [], at))
    await update($, now, () => at)
    $.clock.every(MINUTE, () => {
      void $.clock.now().then(t => update($, now, () => t))
    })
    try {
      const usage = await $.session.usage()
      if (usage.rateLimits.length > 0) await record($, usage.rateLimits)
    } catch {
      // No reading yet: the first session.measure brings one.
    }
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'usage-graph' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: '残り使用量のペインを開きました。' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await record($, e.rateLimits)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const Svg = e.surface === 'terminal' ? undefined : $.ui.resolve(e).Svg
    const list = await read($, windows)
    const past = await read($, history)
    const at = await read($, now)
    const shown = await read($, range)

    if (list.length === 0 && past.length === 0) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text>まだレート制限の値がありません。</Text>
          <Text dimColor>
            サブスクリプション(Pro / Max など)でログインしていれば、次の応答のあとに表示されます。API
            キーでの利用では表示されません。
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        {list.map(window => {
          const remaining = remainingOf(window.percentUsed)
          const color = remaining < 10 ? LOW_COLOR : colorOf(window.kind)
          const reset = resetText(window, at)
          return (
            <Box key={`window-${window.kind}`} flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text weight="semibold">{labelOf(window.kind)}</Text>
                <Text color={color} weight="bold" tabular>
                  {`残り ${remaining}%`}
                </Text>
              </Box>
              {Svg ? (
                <Svg source={barSvg(remaining, color)} alt={`残り ${remaining}%`} />
              ) : (
                <Text color={color}>{textBar(remaining)}</Text>
              )}
              {reset && <Text dimColor>{reset}</Text>}
            </Box>
          )
        })}
        <Box flexDirection="row" gap={1}>
          {RANGES.map(one => (
            <Button
              key={`range-${one}`}
              label={one}
              variant={one === shown ? 'primary' : 'secondary'}
              onPress={() => void update($, range, () => one)}
            />
          ))}
        </Box>
        {Svg ? (
          <Box key="chart">
            <Svg source={chartSvg(past, list, shown, at)} alt={`直近 ${shown} の残り使用量の推移`} />
          </Box>
        ) : (
          <Box key="chart" flexDirection="column">
            {[...new Set(past.map(one => one.kind))].sort(byKind).map(kind => (
              <Text>
                <Text color={colorOf(kind)}>{labelOf(kind).padEnd(6, ' ')}</Text>
                {textSparkline(
                  past.filter(one => one.kind === kind),
                  shown,
                  at,
                )}
              </Text>
            ))}
          </Box>
        )}
        <Box flexDirection="row" gap={2}>
          {[...new Set([...list.map(one => one.kind), ...past.map(one => one.kind)])]
            .sort(byKind)
            .map(kind => (
              <Text color={colorOf(kind)}>
                {`● ${labelOf(kind)}`}
              </Text>
            ))}
        </Box>
      </Box>
    )
  })
}
