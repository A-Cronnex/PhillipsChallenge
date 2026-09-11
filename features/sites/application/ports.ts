/**
 * Ports for reading sites.
 *
 * Capture needs to attach an observation to a site, so it reads through this
 * interface rather than querying the database directly.
 */

/** The minimum a picker needs; not the full Site entity. */
export interface SiteSummary {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
}

export interface SiteRepository {
  /** Locally available sites, ordered by name. Never performs a network call. */
  listSites(): Promise<SiteSummary[]>;

  /**
   * One site by id, for a screen that identifies its subject from a route
   * param rather than from an already-loaded list (e.g. the observation
   * history screen, reached by id from the map). Null if no such site is
   * stored locally.
   */
  getSite(siteId: string): Promise<SiteSummary | null>;
}
