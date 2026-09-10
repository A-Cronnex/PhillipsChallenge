import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { getRepositories } from '../../../lib/container';
import { loadObservationHistory } from '../application/list-observations';
import {
  matchesObservationQuery,
  sortObservations,
  type ObservationRecord,
  type ObservationSortOrder,
} from '../domain/observation-record';
import type { SiteSummary } from '../../sites/application/ports';

export type ObservationListPhase = 'loading' | 'ready' | 'site_not_found' | 'unavailable';

/**
 * Screen state for the observation-history screen.
 *
 * Loads the site and its observations, then applies search and sort
 * entirely in memory: a site's history is, at field-work scale, a few dozen
 * rows at most, and re-querying SQLite on every keystroke would be work for
 * no benefit a local `.filter()` doesn't already give for free.
 */
export function useObservationList(siteId: string) {
  const [phase, setPhase] = useState<ObservationListPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [site, setSite] = useState<SiteSummary | null>(null);
  const [observations, setObservations] = useState<ObservationRecord[]>([]);

  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<ObservationSortOrder>('visit_date_desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [noteObservation, setNoteObservation] = useState<ObservationRecord | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const repositories = await getRepositories();
      const outcome = await loadObservationHistory(siteId, {
        sites: repositories.sites,
        observations: repositories.observations,
      });

      if (outcome.status === 'site_not_found') {
        setPhase('site_not_found');
        return;
      }
      if (outcome.status === 'failed') {
        setError(outcome.reason);
        setPhase('unavailable');
        return;
      }

      setSite(outcome.data.site);
      setObservations(outcome.data.observations);
      setPhase('ready');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPhase('unavailable');
    }
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleObservations = useMemo(() => {
    const matching = observations.filter((observation) => matchesObservationQuery(observation, query));
    return sortObservations(matching, sortOrder);
  }, [observations, query, sortOrder]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openNote = useCallback((observation: ObservationRecord) => {
    setNoteObservation(observation);
  }, []);
  const closeNote = useCallback(() => setNoteObservation(null), []);

  // Neither edit nor delete has an implementation to call into — see
  // docs/manual-capture.md §8 and CLAUDE.md §18 (soft-delete strategy is a
  // blocking, unresolved decision; observations are append-only by design,
  // domain-model.md §14). Both are wired to say so rather than doing
  // nothing silently or performing a database change nothing in the
  // architecture currently sanctions.
  const requestEdit = useCallback(() => {
    Alert.alert(
      'Edición no disponible',
      'Todavía no existe un flujo para editar una observación guardada. Esta acción queda pendiente de diseño.'
    );
  }, []);

  const requestDelete = useCallback(() => {
    Alert.alert(
      'Eliminar observación',
      '¿Confirmas que quieres eliminar esta observación? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Eliminación no disponible',
              'El proyecto aún no define una estrategia de borrado (soft-delete) y las observaciones se conservan como historial (CLAUDE.md §9). No se eliminó nada.'
            );
          },
        },
      ]
    );
  }, []);

  return {
    phase,
    error,
    site,
    observations: visibleObservations,
    hasAnyObservations: observations.length > 0,
    query,
    setQuery,
    sortOrder,
    setSortOrder,
    expandedId,
    toggleExpanded,
    selectedIds,
    toggleSelected,
    noteObservation,
    openNote,
    closeNote,
    requestEdit,
    requestDelete,
    reload: load,
  };
}
