import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../lib/theme';
import { FormField } from './FormField';

export interface PickerOption {
  value: string;
  label: string;
  /** Secondary line, e.g. a site's city and country. */
  detail?: string;
}

interface OptionPickerProps {
  label: string;
  options: PickerOption[];
  selected: string | null;
  onSelect: (value: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Shown in place of the list when there is nothing to choose from. */
  emptyMessage?: string;
  testID?: string;
}

/**
 * Single-choice list.
 *
 * Rendered as radio-role rows rather than a native modal picker so that the
 * current selection and the available options are both visible without
 * opening anything — a field user checking their entry outdoors should not
 * have to tap to find out what is selected.
 */
export function OptionPicker({
  label,
  options,
  selected,
  onSelect,
  hint,
  error,
  required,
  emptyMessage,
  testID,
}: OptionPickerProps) {
  return (
    <FormField label={label} hint={hint} error={error} required={required}>
      {options.length === 0 ? (
        <Text style={styles.empty}>{emptyMessage}</Text>
      ) : (
        <ScrollView
          style={styles.list}
          nestedScrollEnabled
          testID={testID}
          accessibilityRole="radiogroup"
        >
          {options.map((option) => {
            const isSelected = option.value === selected;
            return (
              <Pressable
                key={option.value}
                onPress={() => onSelect(option.value)}
                style={[styles.option, isSelected && styles.optionSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={
                  option.detail ? `${option.label}, ${option.detail}` : option.label
                }
                testID={`option-${option.value}`}
              >
                <View style={styles.optionText}>
                  <Text
                    style={[
                      styles.optionLabel,
                      isSelected && styles.optionLabelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {option.detail ? (
                    <Text style={styles.optionDetail}>{option.detail}</Text>
                  ) : null}
                </View>
                {isSelected ? <Text style={styles.check}>✓</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </FormField>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 220,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 4,
  },
  option: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceVariant,
  },
  optionSelected: { backgroundColor: colors.surfaceVariant },
  optionText: { flexShrink: 1 },
  optionLabel: { ...typography.bodyLarge, color: colors.onSurface },
  optionLabelSelected: { fontWeight: '600' },
  optionDetail: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  check: { ...typography.bodyLarge, color: colors.primary, marginLeft: spacing.sm },
  empty: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
});
