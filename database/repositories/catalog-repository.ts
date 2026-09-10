import type * as SQLite from 'expo-sqlite';
import { validateSite, type CatalogRepository } from '../../features/catalog/application/ports';
import type { CurrentUser } from '../../features/authentication/application/ports';

export async function enqueueCreate(db: Pick<SQLite.SQLiteDatabase, 'runAsync'>, newId: () => string,
  entityType: string, entityId: string, timestamp: string): Promise<void> {
  await db.runAsync(`INSERT INTO sync_records
    (id, entity_type, entity_id, operation, sync_status, local_version, created_at, updated_at)
    VALUES (?, ?, ?, 'create', 'pending', 1, ?, ?)`,
    [newId(), entityType, entityId, timestamp, timestamp]);
}

export function createCatalogRepository(db: SQLite.SQLiteDatabase, newId: () => string): CatalogRepository {
  return {
    async createLocalUser(name) {
      const clean = name.trim();
      if (!clean || clean.length > 200) throw new Error('Escribe tu nombre (máximo 200 caracteres).');
      let user: CurrentUser;
      await db.withExclusiveTransactionAsync(async tx => {
        const existing = await tx.getFirstAsync<CurrentUser>('SELECT id, name, role FROM users ORDER BY created_at LIMIT 1');
        if (existing) { user = existing; return; }
        user = { id: newId(), name: clean, role: 'field_user' };
        const at = new Date().toISOString();
        await tx.runAsync(`INSERT INTO users (id, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          [user.id, user.name, user.role, at, at]);
      });
      return user!;
    },
    async createSite(draft) {
      validateSite(draft);
      const id = newId();
      const at = new Date().toISOString();
      const nullable = (value: string) => value.trim() || null;
      await db.withExclusiveTransactionAsync(async tx => {
        const duplicate = await tx.getFirstAsync(`SELECT id FROM sites WHERE lower(trim(name)) = lower(?)
          AND lower(coalesce(city, '')) = lower(?) AND lower(coalesce(country, '')) = lower(?)`,
          [draft.name.trim(), draft.city.trim(), draft.country.trim()]);
        if (duplicate) throw new Error('Ya existe un sitio con ese nombre, ciudad y país. Selecciónalo en la lista.');
        await tx.runAsync(`INSERT INTO sites (id, name, city, country, address, latitude, longitude, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, draft.name.trim(), nullable(draft.city), nullable(draft.country), nullable(draft.address), draft.latitude, draft.longitude, at, at]);
        await enqueueCreate(tx, newId, 'site', id, at);
      });
      return id;
    },
    listEquipment(siteId) {
      return db.getAllAsync('SELECT id, brand, model, modality FROM equipment WHERE site_id = ? ORDER BY brand, model, id', [siteId]);
    },
  };
}
