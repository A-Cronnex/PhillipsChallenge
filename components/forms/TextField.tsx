import { StyleSheet, TextInput, type KeyboardTypeOptions } from 'react-native';

import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../lib/theme';
import { FormField } from './FormField';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  testID?: string;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  required,
  keyboardType,
  multiline,
  testID,
}: TextFieldProps) {
  return (
    <FormField label={label} hint={hint} error={error} required={required}>
      <TextInput
        style={[
          styles.input,
          multiline && styles.multiline,
          !!error && styles.inputInvalid,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.outline}
        keyboardType={keyboardType}
        multiline={multiline}
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={hint}
        // Announces the field as invalid rather than relying on the red border
        // alone, which conveys nothing to a screen reader (CLAUDE.md §13).
        accessibilityState={{ disabled: false }}
        aria-invalid={!!error}
      />
    </FormField>
  );
}

const styles = StyleSheet.create({
  input: {
    ...typography.bodyLarge,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  multiline: { minHeight: MIN_TOUCH_TARGET * 2, textAlignVertical: 'top' },
  inputInvalid: { borderColor: colors.error, borderWidth: 2 },
});
