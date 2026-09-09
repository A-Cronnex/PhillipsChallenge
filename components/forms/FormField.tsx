import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../lib/theme';

interface FormFieldProps {
  label: string;
  /** Rendered under the label; announced as part of the field. */
  hint?: string;
  /** Validation message. Its presence is what marks the field invalid. */
  error?: string;
  required?: boolean;
  children: ReactNode;
}

/**
 * Label, optional hint and validation message around a control.
 *
 * The error is announced through a polite live region so a screen-reader user
 * hears it when it appears, instead of only discovering it by navigating back
 * to the field (CLAUDE.md §13, accessible controls).
 */
export function FormField({
  label,
  hint,
  error,
  required,
  children,
}: FormFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
      {error ? (
        <Text
          style={styles.error}
          accessibilityLiveRegion="polite"
          testID={`error-${label}`}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { ...typography.titleMedium, color: colors.onSurface },
  required: { color: colors.error },
  hint: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    marginTop: spacing.xs,
  },
  error: {
    ...typography.bodyMedium,
    color: colors.error,
    marginTop: spacing.xs,
  },
});
