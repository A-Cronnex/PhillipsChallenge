import { View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing, typography } from '../../lib/theme';

/**
 * Determinate progress for a long operation the user is waiting on.
 *
 * Announced as a progress bar with its percentage rather than relying on the
 * filled width alone, so the state is available without sight and without
 * colour (CLAUDE.md §13).
 */
export function ProgressBar({ fraction, label, testID }: {
  /** 0–1. Values outside the range are clamped rather than overflowing the track. */
  fraction: number;
  label?: string;
  testID?: string;
}) {
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const percent = Math.round(clamped * 100);
  return (
    <View style={styles.container} testID={testID}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={label ?? 'Progreso'}
        accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent}%` }}
      >
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.percent} accessibilityElementsHidden importantForAccessibility="no">
        {percent}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs, alignSelf: 'stretch' },
  label: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
  track: { height: 8, borderRadius: radii.sm, backgroundColor: colors.surfaceVariant, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.sm, backgroundColor: colors.primary },
  percent: { ...typography.labelMedium, color: colors.onSurfaceVariant, textAlign: 'right' },
});
