import { Pressable, StyleSheet, Text, type ButtonProps } from 'react-native';
import { colors, MIN_TOUCH_TARGET, radii, spacing, typography } from '../../lib/theme';

/** Shared, scalable touch target; keeps the native Button contract for existing forms. */
export function AppButton({ title, onPress, disabled, accessibilityLabel, testID }: ButtonProps) {
  return <Pressable onPress={onPress} disabled={disabled} testID={testID}
    accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled }}
    style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && { opacity: 0.8 }]}>
    <Text style={styles.label}>{title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  label: { ...typography.titleMedium, color: colors.onPrimary, textAlign: 'center' },
});
