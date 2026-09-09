import { StyleSheet, Text, View } from 'react-native';

import type { SyncStatus } from '../../types/domain';
import { colors, spacing, typography } from '../../lib/theme';

/**
 * All six states from docs/offline-sync.md §4. `synchronized` and `conflict`
 * are unreachable today because no backend exists (docs/tech-stack.md §5);
 * they are rendered here so the badge does not have to change when one does.
 */
const PRESENTATION: Record<
  SyncStatus,
  { label: string; description: string; fg: string; bg: string }
> = {
  local_only: {
    label: 'Solo local',
    description: 'Guardado en este dispositivo. No se enviará al servidor.',
    fg: colors.onSurfaceVariant,
    bg: colors.surfaceVariant,
  },
  pending: {
    label: 'Pendiente de sincronizar',
    description:
      'Guardado en este dispositivo. Se enviará cuando haya un servidor disponible.',
    fg: colors.pending,
    bg: colors.pendingContainer,
  },
  syncing: {
    label: 'Sincronizando',
    description: 'Enviando al servidor.',
    fg: colors.pending,
    bg: colors.pendingContainer,
  },
  synchronized: {
    label: 'Sincronizado',
    description: 'Confirmado por el servidor.',
    fg: colors.success,
    bg: colors.successContainer,
  },
  failed: {
    label: 'Error de sincronización',
    description: 'No se pudo enviar. El registro sigue guardado localmente.',
    fg: colors.error,
    bg: colors.errorContainer,
  },
  conflict: {
    label: 'Conflicto',
    description: 'La versión local y la del servidor difieren.',
    fg: colors.error,
    bg: colors.errorContainer,
  },
};

interface SyncStatusBadgeProps {
  status: SyncStatus;
  /** Show the explanatory line under the badge. */
  showDescription?: boolean;
}

export function SyncStatusBadge({
  status,
  showDescription,
}: SyncStatusBadgeProps) {
  const presentation = PRESENTATION[status];
  return (
    <View>
      <View
        style={[styles.badge, { backgroundColor: presentation.bg }]}
        accessibilityRole="text"
        accessibilityLabel={`Estado de sincronización: ${presentation.label}`}
        testID={`sync-badge-${status}`}
      >
        <Text style={[styles.label, { color: presentation.fg }]}>
          {presentation.label}
        </Text>
      </View>
      {showDescription ? (
        <Text style={styles.description}>{presentation.description}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 4,
  },
  label: { ...typography.labelMedium },
  description: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    marginTop: spacing.xs,
  },
});
