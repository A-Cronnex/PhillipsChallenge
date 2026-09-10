import { useEffect, useState } from 'react';
import type { SiteSummary } from '../../sites/application/ports';
import { getRepositories } from '../../../lib/container';
import { newId } from '../../../lib/id';
import { emptyFormValues, toDraft } from '../../observations/ui/form-mapping';
import { attributeConfidenceRecords } from '../domain/confidence';
import { isKnown, type ConversationState } from '../domain/conversation';
import { saveConversation } from '../application/save-conversation';

export function useConversationReview(conversation: ConversationState, onSaved: () => void) {
  const [sites, setSites] = useState<SiteSummary[]>([]);
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
  async function loadSites() { setSites(await (await getRepositories()).sites.listSites()); }
  useEffect(() => { void loadSites().catch(() => setError('No se pudieron cargar los sitios.')); }, []);
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await saveConversation(conversation, toDraft(values), { repository: (await getRepositories()).conversations, now: () => new Date(), newId });
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  return { sites, values, setValues, error, busy, loadSites, save };
}
