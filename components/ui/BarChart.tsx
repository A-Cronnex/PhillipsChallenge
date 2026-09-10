import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../lib/theme';

export interface BarChartDatum {
  key: string;
  /** X-axis label. */
  label: string;
  /** Y-axis value (a frequency/count). */
  value: number;
}

const TRACK_HEIGHT = 120;

/**
 * Vertical bar chart built from plain Views — no SVG/charting library is
 * installed (see `components/ui/RadialGauge.tsx`). Each bar's height is a
 * percentage of a fixed-height track, which React Native resolves against
 * the track's own explicit height.
 */
export function BarChart({
  data,
  testID,
}: {
  data: BarChartDatum[];
  testID?: string;
}) {
  const max = Math.max(1, ...data.map((datum) => datum.value));

  return (
    <View style={styles.chart} testID={testID}>
      {data.map((datum) => (
        <View
          key={datum.key}
          style={styles.column}
          testID={testID ? `${testID}-bar-${datum.key}` : undefined}
        >
          <Text style={styles.barValue}>{datum.value}</Text>
          <View style={styles.track}>
            <View
              style={[
                styles.bar,
                { height: `${Math.round((datum.value / max) * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.barLabel}>{datum.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    gap: spacing.sm,
  },
  column: { alignItems: 'center', flex: 1 },
  barValue: { ...typography.labelMedium, color: colors.onSurface, marginBottom: spacing.xs },
  track: {
    width: '70%',
    height: TRACK_HEIGHT,
    justifyContent: 'flex-end',
    backgroundColor: colors.surfaceVariant,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bar: { width: '100%', backgroundColor: colors.primary },
  barLabel: {
    ...typography.labelMedium,
    color: colors.onSurfaceVariant,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
