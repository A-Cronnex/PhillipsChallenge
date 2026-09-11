import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../lib/theme';

/**
 * Loading, empty and error states shared by screens (CLAUDE.md §13).
 */

export function LoadingState({ message }: { message: string }) {
  return (
    <View style={styles.centered} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.message} testID="loading-state">
        {message}
      </Text>
    </View>
  );
}

export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View style={styles.centered} testID="empty-state">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centered} accessibilityLiveRegion="polite" testID="error-state">
      <Text style={[styles.title, styles.errorTitle]}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={styles.retry}
          accessibilityRole="button"
          accessibilityLabel="Reintentar"
          testID="retry-button"
        >
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: { ...typography.titleLarge, color: colors.onSurface, textAlign: 'center' },
  errorTitle: { color: colors.error },
  message: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  retry: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  retryText: { ...typography.titleMedium, color: colors.onPrimary },
});
