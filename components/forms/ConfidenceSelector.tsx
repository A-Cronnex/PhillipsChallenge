import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CONFIDENCE_LEVELS, type ConfidenceLevel } from '../../types/domain';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../lib/theme';

const LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

interface ConfidenceSelectorProps {
  /** Name of the attribute this confidence applies to, for the announcement. */
  attributeLabel: string;
  value: ConfidenceLevel | undefined;
  onChange: (level: ConfidenceLevel | undefined) => void;
  testID?: string;
}

/**
 * Per-attribute confidence selector (docs/domain-model.md §7).
 *
 * Tapping the selected level clears it, so a user who set a confidence by
 * mistake can undo it without clearing the attribute value itself. An absent
 * selection means no confidence was recorded for the attribute — which is
 * different from recording low confidence, and is stored as no row rather than
 * as a guess.
 */
export function ConfidenceSelector({
  attributeLabel,
  value,
  onChange,
  testID,
}: ConfidenceSelectorProps) {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.caption}>Confianza</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {CONFIDENCE_LEVELS.map((level) => {
          const isSelected = value === level;
          return (
            <Pressable
              key={level}
              onPress={() => onChange(isSelected ? undefined : level)}
              style={[styles.chip, isSelected && styles.chipSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Confianza ${LEVEL_LABELS[level]} para ${attributeLabel}`}
              testID={`${testID}-${level}`}
            >
              <Text
                style={[styles.chipText, isSelected && styles.chipTextSelected]}
              >
                {LEVEL_LABELS[level]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.sm },
  caption: { ...typography.labelMedium, color: colors.onSurfaceVariant },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
  chipTextSelected: { color: colors.onPrimary, fontWeight: '600' },
});
