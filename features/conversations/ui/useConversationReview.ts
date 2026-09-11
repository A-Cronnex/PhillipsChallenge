import { useEffect, useMemo, useState } from 'react';
import type { SiteSummary } from '../../sites/application/ports';
import { getRepositories } from '../../../lib/container';
import { newId } from '../../../lib/id';
import { emptyFormValues, toDraft } from '../../observations/ui/form-mapping';
import { attributeConfidenceRecords } from '../domain/confidence';
import { isKnown, type ConversationState } from '../domain/conversation';
import { saveConversation } from '../application/save-conversation';
import { resolveSite, type SiteResolution } from '../application/site-resolution';

export function useConversationReview(conversation: ConversationState, onSaved: () => void) {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [loadedSites, setLoadedSites] = useState(false);
  /** Opt-in escape hatch: the full catalogue is hidden until the user asks for it. */
  const [browsingAll, setBrowsingAll] = useState(false);
  const [values, setValues] = useState(() => {
    const initial = emptyFormValues({ visitDate: new Date().toISOString().slice(0, 10) });
    for (const field of Object.keys(initial)) {
      const state = conversation.fields[field as keyof typeof conversation.fields];
      if (state && isKnown(state)) Object.assign(initial, { [field]: String(state.value) });
    }
    for (const row of attributeConfidenceRecords(conversation)) initial.attributeConfidence[row.attributeName] = row.confidenceLevel;
    return initial;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const resolution: SiteResolution = useMemo(
    () => resolveSite(conversation, sites),
    [conversation, sites]
  );

  async function loadSites() {
    setSites(await (await getRepositories()).sites.listSites());
    setLoadedSites(true);
  }
  useEffect(() => { void loadSites().catch(() => setError('No se pudieron cargar los sitios.')); }, []);

  // A single confident match needs no user action: attach the observation to it
  // and say so. Ambiguity and "not in the catalogue yet" stay explicit.
  useEffect(() => {
    if (resolution.kind === 'matched') {
      setValues(current => (current.siteId === resolution.site.id ? current : { ...current, siteId: resolution.site.id, equipmentId: null }));
    }
  }, [resolution]);

  /**
   * Creates the site the conversation named, then selects it.
   *
   * Stored with no coordinates, and deliberately so: a conversation says which
   * customer this is, not where the phone is. Reading the device position here
   * would attach a plausible but wrong point to any site dictated away from it
   * — from a hotel, or when writing the visit up the next day — and a wrong
   * coordinate is worse than none. A site with no coordinates is listed as
   * unmappable rather than drawn (docs/maps.md §9), which is the honest state.
   */
  async function createResolvedSite() {
    if (busy || resolution.kind !== 'new') return;
    setBusy(true); setError('');
    try {
      const id = await (await getRepositories()).catalog.createSite(resolution.draft);
      await loadSites();
      setValues(current => ({ ...current, siteId: id, equipmentId: null }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo crear el sitio.'); }
    finally { setBusy(false); }
  }

  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await saveConversation(conversation, toDraft(values), { repository: (await getRepositories()).conversations, now: () => new Date(), newId });
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  return { sites, loadedSites, values, setValues, error, busy, loadSites, save,
    resolution, browsingAll, setBrowsingAll, createResolvedSite };
}
