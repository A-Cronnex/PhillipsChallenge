import type { CurrentUser } from '../../authentication/application/ports';

export interface SiteDraft {
  name: string;
  city: string;
  country: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}
export interface EquipmentSummary {
  id: string;
  brand: string | null;
  model: string | null;
  modality: string | null;
}
export interface CatalogRepository {
  createLocalUser(name: string): Promise<CurrentUser>;
  createSite(draft: SiteDraft): Promise<string>;
  listEquipment(siteId: string): Promise<EquipmentSummary[]>;
}

export function validateSite(draft: SiteDraft): void {
  if (!draft.name.trim() || draft.name.trim().length > 200) {
    throw new Error('Escribe un nombre de sitio de hasta 200 caracteres.');
  }
  if ([draft.city, draft.country, draft.address].some(value => value.length > 500)) {
    throw new Error('Los datos del sitio son demasiado largos.');
  }
  if ((draft.latitude === null) !== (draft.longitude === null)) {
    throw new Error('Indica ambas coordenadas o deja ambas vacías.');
  }
  for (const [value, limit] of [[draft.latitude, 90], [draft.longitude, 180]] as const) {
    if (value !== null && (!Number.isFinite(value) || Math.abs(value) > limit)) {
      throw new Error('Las coordenadas no son válidas.');
    }
  }
}
