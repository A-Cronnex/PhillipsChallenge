import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CurrentUser } from '../../authentication/application/ports';
import type { SiteSummary } from '../../sites/application/ports';
import { getRepositories } from '../../../lib/container';
import { newId } from '../../../lib/id';
import type { SyncStatus } from '../../../types/domain';
import {
  captureObservation,
  toIsoDate,
} from '../application/capture-observation';
import type { ValidationIssue } from '../domain/validation';
import {
  emptyFormValues,
  toDraft,
  type ObservationFormValues,
} from './form-mapping';

export type CaptureScreenPhase = 'loading' | 'ready' | 'unavailable';

export interface SavedConfirmation {
  observationId: string;
  syncStatus: SyncStatus;
}

/**
 * Binds the capture screen to the application service.
 *
 * The hook holds screen state and calls `captureObservation`. It contains no
 * business rule and no SQL: validation lives in the domain, persistence behind
 * a repository port (docs/architecture.md §6).
 */
export function useObservationCapture() {
  const submitting = useRef(false);
  const [phase, setPhase] = useState<CaptureScreenPhase>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [values, setValues] = useState<ObservationFormValues>(() =>
    emptyFormValues({ visitDate: toIsoDate(new Date()) })
  );
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<SavedConfirmation | null>(
    null
  );

  const load = useCallback(async () => {
    setPhase('loading');
    setLoadError(null);
    try {
      const repositories = await getRepositories();
      const [loadedSites, user] = await Promise.all([
        repositories.sites.listSites(),
        repositories.users.getCurrentUser(),
      ]);
      setSites(loadedSites);
      setCurrentUser(user);
      setPhase('ready');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setPhase('unavailable');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    (patch: Partial<ObservationFormValues>) => {
      setValues((current) => ({ ...current, ...patch }));
      // Clearing the confirmation as soon as the user edits again avoids a
      // stale "saved" banner sitting above a half-typed new observation.
      setConfirmation(null);
    },
    []
  );

  const replaceValues = useCallback((next: ObservationFormValues) => {
    setValues(next);
    setConfirmation(null);
  }, []);

  const submit = useCallback(async () => {
    if (!currentUser || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setSaveError(null);

    try {
      const repositories = await getRepositories();
      const outcome = await captureObservation(
        toDraft(values),
        currentUser.id,
        { repository: repositories.observations, now: () => new Date(), newId }
      );

      if (outcome.status === 'validation_failed') {
        setIssues(outcome.issues);
        setConfirmation(null);
        return;
      }

      if (outcome.status === 'failed') {
        // The draft is deliberately left untouched so nothing the user typed
        // is lost (CLAUDE.md §6).
        setSaveError(outcome.reason);
        return;
      }

      setIssues([]);
      setConfirmation({
        observationId: outcome.saved.id,
        syncStatus: outcome.saved.syncStatus,
      });
      // Site and visit date are kept: a field user usually records several
      // pieces of equipment during the same visit.
      setValues(
        emptyFormValues({ siteId: values.siteId, visitDate: values.visitDate })
      );
    } catch {
      setSaveError("No se pudo guardar. Los datos siguen en el formulario.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }, [currentUser, values]);

  const canSubmit = useMemo(
    () => phase === 'ready' && !!currentUser && sites.length > 0 && !saving,
    [phase, currentUser, sites.length, saving]
  );

  return {
    phase,
    loadError,
    sites,
    currentUser,
    values,
    issues,
    saving,
    saveError,
    confirmation,
    canSubmit,
    update,
    replaceValues,
    submit,
    reload: load,
  };
}
