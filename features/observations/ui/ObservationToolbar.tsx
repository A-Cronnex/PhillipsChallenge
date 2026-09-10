import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../../lib/theme';
import type { ObservationSortOrder } from '../domain/observation-record';
import { OBSERVATION_SORT_ORDERS } from '../domain/observation-record';

const SORT_LABELS: Record<ObservationSortOrder, string> = {
  visit_date_desc: 'Más reciente primero',
  visit_date_asc: 'Más antigua primero',
  brand_asc: 'Marca (A-Z)',
};

/**
 * Search and sort controls above the observation list.
 *
 * Search matches brand/model/modality/notes
 * (domain/observation-record.ts's matchesObservationQuery) — the fields a
 * field user would actually remember and search by. The sort menu is
 * deliberately small: docs/domain-model.md does not specify one, so this
 * offers the two orderings that are unambiguous from the entity itself
 * (visit date, brand) rather than guessing a larger set.
 */
export function ObservationToolbar({
  query,
  onQueryChange,
  sortOrder,
  onSortOrderChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  sortOrder: ObservationSortOrder;
  onSortOrderChange: (value: ObservationSortOrder) => void;
}) {
  return (
    <View style={styles.container} testID="observation-toolbar">
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={onQueryChange}
        placeholder="Buscar por marca, modelo, modalidad o nota…"
        placeholderTextColor={colors.outline}
        accessibilityLabel="Buscar observaciones"
        testID="observation-search"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.sortRow}
        contentContainerStyle={styles.sortRowContent}
        accessibilityRole="radiogroup"
        accessibilityLabel="Orden de la lista"
      >
        {OBSERVATION_SORT_ORDERS.map((order) => {
          const isSelected = order === sortOrder;
          return (
            <Pressable
              key={order}
              onPress={() => onSortOrderChange(order)}
              style={[styles.chip, isSelected && styles.chipSelected]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              testID={`sort-${order}`}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {SORT_LABELS[order]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  search: {
    ...typography.bodyLarge,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 4,
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  sortRow: { flexGrow: 0 },
  sortRowContent: { gap: spacing.sm },
  chip: {
    minHeight: MIN_TOUCH_TARGET - 8,
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
