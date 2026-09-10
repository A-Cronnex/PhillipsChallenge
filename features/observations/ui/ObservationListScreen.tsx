import { FlatList, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/ScreenStates';
import { colors, spacing, typography } from '../../../lib/theme';
import { ObservationCard } from './ObservationCard';
import { ObservationNoteModal } from './ObservationNoteModal';
import { ObservationToolbar } from './ObservationToolbar';
import { SiteHeader } from './SiteHeader';
import { useObservationList } from './useObservationList';

/**
 * Observation history for one site (docs/manual-capture.md §8 — until now,
 * "no listing of saved observations" was a documented gap).
 *
 * Thin composition, per CLAUDE.md §5: this screen owns loading and screen
 * state; ObservationCard owns presenting one record; useObservationList owns
 * search/sort/selection state and the (currently stubbed) edit/delete
 * actions.
 */
export function ObservationListScreen({ siteId }: { siteId: string }) {
  const list = useObservationList(siteId);

  if (list.phase === 'loading') {
    return <LoadingState message="Cargando observaciones…" />;
  }

  if (list.phase === 'site_not_found') {
    return (
      <ErrorState
        title="Sitio no encontrado"
        message="Este sitio ya no está guardado en este dispositivo."
      />
    );
  }

  if (list.phase === 'unavailable' || !list.site) {
    return (
      <ErrorState
        title="No se pudieron cargar las observaciones"
        message={list.error ?? 'Ocurrió un error inesperado al leer los datos locales.'}
        onRetry={list.reload}
      />
    );
  }

  if (!list.hasAnyObservations) {
    return (
      <View style={styles.screen}>
        <SiteHeader site={list.site} />
        <EmptyState
          title="Sin observaciones"
          message="Todavía no se registró ninguna observación para este sitio."
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SiteHeader site={list.site} />
      <ObservationToolbar
        query={list.query}
        onQueryChange={list.setQuery}
        sortOrder={list.sortOrder}
        onSortOrderChange={list.setSortOrder}
      />

      {list.observations.length === 0 ? (
        <View style={styles.noResults} testID="observation-no-results">
          <Text style={styles.noResultsText}>
            Ninguna observación coincide con "{list.query}".
          </Text>
        </View>
      ) : (
        <FlatList
          data={list.observations}
          keyExtractor={(observation) => observation.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ObservationCard
              observation={item}
              expanded={list.expandedId === item.id}
              selected={list.selectedIds.has(item.id)}
              onToggleExpanded={() => list.toggleExpanded(item.id)}
              onToggleSelected={() => list.toggleSelected(item.id)}
              onOpenNote={() => list.openNote(item)}
              onEdit={list.requestEdit}
              onDelete={list.requestDelete}
            />
          )}
        />
      )}

      <ObservationNoteModal observation={list.noteObservation} onClose={list.closeNote} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, gap: spacing.md },
  noResults: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  noResultsText: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
});
