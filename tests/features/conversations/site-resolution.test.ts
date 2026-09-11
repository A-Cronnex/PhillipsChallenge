import { describeSite, normalizeSiteName, resolveSite } from '../../../features/conversations/application/site-resolution';
import { recordField, startConversation, type ConversationState } from '../../../features/conversations/domain/conversation';
import type { SiteSummary } from '../../../features/sites/application/ports';

const santoTomas: SiteSummary = { id: 's1', name: 'Hospital Santo Tomás', city: 'Ciudad de Panamá', country: 'Panamá' };
const otherSites: SiteSummary[] = [
  { id: 's2', name: 'Clínica San Fernando', city: 'Ciudad de Panamá', country: 'Panamá' },
  { id: 's3', name: 'Hospital Albert Einstein', city: 'São Paulo', country: 'Brasil' },
];

function withSite(name: string | null, extra: Partial<Record<'city' | 'country', string>> = {}): ConversationState {
  let state = startConversation('c1', 'u1', '2026-09-10T00:00:00Z');
  if (name !== null) state = recordField(state, 'siteName', { value: name, status: 'reported', confidence: 'high', source: 'voice' });
  for (const [field, value] of Object.entries(extra)) {
    state = recordField(state, field as 'city' | 'country', { value, status: 'reported', confidence: 'high', source: 'voice' });
  }
  return state;
}

test('normalizes case, accents and whitespace so a transcript still matches', () => {
  expect(normalizeSiteName('  Hospital   SANTO Tomás ')).toBe('hospital santo tomas');
});

test('matches the named site and never considers the rest of the catalogue', () => {
  const result = resolveSite(withSite('hospital santo tomas'), [...otherSites, santoTomas]);
  expect(result).toEqual({ kind: 'matched', site: santoTomas, capturedName: 'hospital santo tomas' });
});

test('matches on containment when there is exactly one candidate', () => {
  const result = resolveSite(withSite('Santo Tomás'), [...otherSites, santoTomas]);
  expect(result.kind === 'matched' && result.site.id).toBe('s1');
});

test('refuses to guess when several sites share the name', () => {
  const twin: SiteSummary = { ...santoTomas, id: 's9', city: 'Colón' };
  const result = resolveSite(withSite('Hospital Santo Tomás'), [santoTomas, twin, ...otherSites]);
  expect(result.kind).toBe('ambiguous');
  expect(result.kind === 'ambiguous' && result.candidates.map(s => s.id)).toEqual(['s1', 's9']);
});

test('a dictated site that already exists binds the observation to it, and offers no creation', () => {
  // The requirement, stated directly: dictating a site already in the database
  // attaches the observation to that row — keeping whatever coordinates it
  // already has — instead of creating a second one.
  const result = resolveSite(withSite('Hospital Santo Tomás'), [...otherSites, santoTomas]);
  expect(result.kind).toBe('matched');
  expect(result.kind === 'matched' && result.site.id).toBe('s1');
  // No draft on this branch, so nothing can create a duplicate site.
  expect(result).not.toHaveProperty('draft');
});

test('a site the conversation names but the catalogue lacks is stored without coordinates', () => {
  // Deliberate: a conversation says which customer this is, not where the
  // phone is. The site stays unmappable until real coordinates exist
  // (docs/maps.md §9) rather than being given a guessed point.
  const result = resolveSite(withSite('Hospital Nuevo'), otherSites);
  expect(result.kind === 'new' && result.draft.latitude).toBeNull();
  expect(result.kind === 'new' && result.draft.longitude).toBeNull();
});

test('proposes creating the site the conversation named, with its city and country', () => {
  const result = resolveSite(withSite('Hospital Nuevo', { city: 'David', country: 'Panamá' }), otherSites);
  expect(result).toEqual({ kind: 'new', capturedName: 'Hospital Nuevo',
    draft: { name: 'Hospital Nuevo', city: 'David', country: 'Panamá', address: '', latitude: null, longitude: null } });
});

test('falls back to the full catalogue only when no site name was captured', () => {
  expect(resolveSite(withSite(null), otherSites)).toEqual({ kind: 'unnamed' });
});

test('describes a site with its place, or just its name', () => {
  expect(describeSite(santoTomas)).toBe('Hospital Santo Tomás — Ciudad de Panamá, Panamá');
  expect(describeSite({ name: 'Sin lugar', city: null, country: null })).toBe('Sin lugar');
});
