import { StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../../lib/theme';

const SEGMENT_COUNT = 24;

/**
 * Circular dial made of evenly spaced tick segments, colored up to `value`.
 *
 * No SVG or charting library is installed (`lib/theme.ts` treats that as a
 * deliberate decision, not a gap), so this avoids the usual two-half-circle
 * overlay technique for a progress ring — that needs `overflow: 'hidden'`
 * tricks that are hard to verify without a device. Placing a small bar at
 * `rotate` then `translateY(-radius)` (each tick's own local axis, after its
 * own rotation) is the standard no-SVG way to arrange elements evenly around
 * a circle, and is trivial to verify: each tick is just a rectangle.
 */
export function RadialGauge({
  value,
  size = 160,
  label,
  testID,
}: {
  /** 0–100. Values outside that range are clamped. */
  value: number;
  size?: number;
  label?: string;
  testID?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const activeSegments = Math.round((clamped / 100) * SEGMENT_COUNT);
  const radius = size / 2;
  const segmentLength = size * 0.16;
  const segmentWidth = Math.max(3, size * 0.03);

  return (
    <View
      style={[styles.wrapper, { width: size, height: size }]}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      {Array.from({ length: SEGMENT_COUNT }).map((_, index) => {
        const angle = (360 / SEGMENT_COUNT) * index;
        const active = index < activeSegments;
        return (
          <View
            key={index}
            style={[
              styles.segment,
              {
                width: segmentWidth,
                height: segmentLength,
                borderRadius: segmentWidth / 2,
                backgroundColor: active ? colors.primary : colors.surfaceVariant,
                transform: [
                  { rotate: `${angle}deg` },
                  { translateY: -(radius - segmentLength / 2) },
                ],
              },
            ]}
          />
        );
      })}
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.value} testID={testID ? `${testID}-value` : undefined}>
          {Math.round(clamped)}%
        </Text>
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  segment: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
  value: { ...typography.titleLarge, color: colors.onSurface },
  label: { ...typography.labelMedium, color: colors.onSurfaceVariant },
});
