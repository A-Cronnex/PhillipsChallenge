/**
 * Which site an observation belongs to, decided from what the agent captured.
 *
 * The review screen used to render a picker over **every** locally stored
 * site. With a seeded installed base that meant a field user, who had just
 * told the agent "estoy en el Hospital Santo Tomás", was shown a list of other
 * hospitals and had to find theirs again — and picking the wrong one silently
 * attached the observation to the wrong customer (reported 2026-09-10).
 *
 * So the site is *resolved*, not *chosen*: the name the conversation captured
 * is matched against the local catalogue, and only the outcome of that match
 * is shown. The full list stays available behind an explicit opt-in, for the
 * case where the agent misheard the name.
 *
 * Pure and port-typed rather than repository-typed: it takes the already
 * loaded summaries, so it is testable without a database (CLAUDE.md §5).
 */
import type { SiteSummary } from '../../sites/application/ports';
import type { SiteDraft } from '../../catalog/application/ports';
import { isKnown, type ConversationState } from '../domain/conversation';

/**
 * Comparison form for a site name.
 *
 * Accent- and case-insensitive, whitespace-collapsed: a name dictated by voice
 * and transcribed comes back as "hospital santo tomas" often enough that
 * treating it as a different hospital from "Hospital Santo Tomás" would defeat
 * the point of matching at all.
 */
export function normalizeSiteName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export type SiteResolution =
  /** Exactly one local site carries this name. Nothing to choose. */
  | { kind: 'matched'; site: SiteSummary; capturedName: string }
  /** The conversation named a site the catalogue does not have yet. */
  | { kind: 'new'; draft: SiteDraft; capturedName: string }
  /** Several local sites share the name; only those are offered. */
  | { kind: 'ambiguous'; candidates: SiteSummary[]; capturedName: string }
  /** The conversation never captured a site name; the full list is the only option. */
  | { kind: 'unnamed' };

function captured(conversation: ConversationState, field: 'siteName' | 'city' | 'country'): string {
  const state = conversation.fields[field];
  return isKnown(state) && state.value !== null ? String(state.value).trim() : '';
}

/**
 * Resolves the site for a conversation against the locally stored sites.
 *
 * Matching is two-pass on purpose. An exact normalized equality is the
 * confident case. Only if that finds nothing does it fall back to containment
 * ("Santo Tomás" vs "Hospital Santo Tomás"), and only when containment yields
 * exactly one candidate — a loose match that picked one of several would be
 * the same silent mis-attachment this module exists to prevent.
 */
export function resolveSite(
  conversation: ConversationState,
  sites: SiteSummary[]
): SiteResolution {
  const capturedName = captured(conversation, 'siteName');
  if (!capturedName) return { kind: 'unnamed' };

  const needle = normalizeSiteName(capturedName);
  const exact = sites.filter((site) => normalizeSiteName(site.name) === needle);
  const candidates =
    exact.length > 0
      ? exact
      : sites.filter((site) => {
          const name = normalizeSiteName(site.name);
          return name.includes(needle) || needle.includes(name);
        });

  if (candidates.length === 1) return { kind: 'matched', site: candidates[0], capturedName };
  if (candidates.length > 1) return { kind: 'ambiguous', candidates, capturedName };

  return {
    kind: 'new',
    capturedName,
    draft: {
      name: capturedName,
      city: captured(conversation, 'city'),
      country: captured(conversation, 'country'),
      address: '',
      // Coordinates are not something a capture conversation produces
      // (docs/maps.md §6); the site is stored without a map position and the
      // map screen lists it as unmappable rather than hiding it.
      latitude: null,
      longitude: null,
    },
  };
}

/** One-line description of a site for the review header. */
export function describeSite(site: Pick<SiteSummary, 'name' | 'city' | 'country'>): string {
  const place = [site.city, site.country].filter(Boolean).join(', ');
  return place ? `${site.name} — ${place}` : site.name;
}
