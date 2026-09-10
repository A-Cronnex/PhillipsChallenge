import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/ScreenStates';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../../lib/theme';
import { basemapConfig } from '../../../services/maps/tile-source';
import { hasBasemap, resolveMapStyle } from '../../../services/maps/style';
import { sitesToFeatureCollection } from '../domain/geojson';
import { equipmentForSite } from '../domain/map-features';
import { useMapData } from './useMapData';

const SITES_SOURCE_ID = 'sites';
const SITE_CIRCLES_LAYER_ID = 'site-circles';
const SITE_SELECTED_LAYER_ID = 'site-selected';

/** Fallback camera position when no site can be placed. */
const FALLBACK_CENTER: [number, number] = [0, 0];
const FALLBACK_ZOOM = 1;

/**
 * Map of locally stored sites and their equipment.
 *
 * Everything drawn here comes from SQLite. No network request is made: the
 * basemap style is either built in code or served from the project's own
 * infrastructure (docs/tech-stack.md §4a), and the site and equipment data are
 * local rows.
 */
export function MapScreen() {
  const map = useMapData();
  const router = useRouter();

  const mapStyle = useMemo(() => {
    try {
      return { style: resolveMapStyle(), error: null as string | null };
    } catch (error) {
      // A misconfigured basemap must not take the whole screen down — the
      // sites are still worth showing on a plain background.
      return {
        style: resolveMapStyle({ mode: 'none' }),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, []);

  const collection = useMemo(
    () => sitesToFeatureCollection(map.data?.dataset.sites ?? []),
    [map.data]
  );

  if (map.phase === 'loading') {
    return <LoadingState message="Cargando sitios y equipos guardados…" />;
  }

  if (map.phase === 'unavailable' || !map.data) {
    return (
      <ErrorState
        title="No se pudo cargar el mapa"
        message={map.error ?? 'Ocurrió un error inesperado al leer los datos locales.'}
        onRetry={map.reload}
      />
    );
  }

  const { dataset, regions, center } = map.data;
  const hasAnySite = dataset.sites.length > 0 || dataset.unmappableSites.length > 0;

  if (!hasAnySite) {
    return (
      <EmptyState
        title="No hay sitios guardados"
        message="Cuando registres o sincronices sitios aparecerán aquí. El mapa no descarga datos por sí solo."
      />
    );
  }

  function handleSitePress(
    event: NativeSyntheticEvent<PressEventWithFeatures>
  ): void {
    // A press on a feature bubbles from the Source up to the Map's own
    // onPress unless stopped (@maplibre/maplibre-react-native's own
    // documented behaviour). Without this, selecting a site immediately
    // triggered the Map's onPress={map.clearSelection} right after —
    // selection and deselection in the same tap, so nothing ever appeared
    // selected.
    event.stopPropagation();
    const feature = event.nativeEvent.features[0];
    const siteId = feature?.properties?.siteId;
    if (typeof siteId === 'string') map.selectSite(siteId);
  }

  const selectedEquipment = map.selectedSiteId
    ? equipmentForSite(dataset, map.selectedSiteId)
    : [];

  return (
    <View style={styles.screen}>
      <View style={styles.mapContainer}>
        <Map
          style={styles.map}
          mapStyle={mapStyle.style}
          onPress={map.clearSelection}
          testID="maplibre-map"
        >
          <Camera
            initialViewState={{
              center: center
                ? [center.longitude, center.latitude]
                : FALLBACK_CENTER,
              zoom: center ? 5 : FALLBACK_ZOOM,
            }}
          />

          <GeoJSONSource
            id={SITES_SOURCE_ID}
            data={collection}
            onPress={handleSitePress}
            // A site's circle can render as small as a 7px radius (paint
            // below, for a site with little equipment) — well under the
            // 48dp touch target CLAUDE.md §13 requires. The library's own
            // default hitbox (44x44) already pads the tap point, but this
            // widens it further so a field user does not have to land on
            // the rendered dot pixel-for-pixel.
            hitbox={{ top: 32, bottom: 32, left: 32, right: 32 }}
          >
            <Layer
              id={SITE_CIRCLES_LAYER_ID}
              source={SITES_SOURCE_ID}
              type="circle"
              paint={{
                // Radius grows with the number of equipment units recorded, so
                // the map reads as "where is our installed base concentrated"
                // rather than just "where have we been".
                'circle-radius': [
                  'interpolate',
                  ['linear'],
                  ['get', 'equipmentUnitCount'],
                  0,
                  7,
                  50,
                  24,
                ],
                'circle-color': colors.primary,
                'circle-opacity': 0.75,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#FFFFFF',
              }}
            />
            <Layer
              id={SITE_SELECTED_LAYER_ID}
              source={SITES_SOURCE_ID}
              type="circle"
              filter={['==', ['get', 'siteId'], map.selectedSiteId ?? '']}
              paint={{
                'circle-radius': [
                  'interpolate',
                  ['linear'],
                  ['get', 'equipmentUnitCount'],
                  0,
                  11,
                  50,
                  28,
                ],
                'circle-color': 'transparent',
                'circle-stroke-width': 3,
                'circle-stroke-color': colors.pending,
              }}
            />
          </GeoJSONSource>
        </Map>
      </View>

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        {mapStyle.error ? (
          <Banner tone="error" title="Mapa base desactivado" testID="basemap-error">
            {mapStyle.error}
          </Banner>
        ) : null}

        {!hasBasemap(basemapConfig) ? (
          <Banner tone="info" title="Sin mapa base" testID="no-basemap">
            Se muestran los sitios sobre un fondo liso. Todavía no hay un
            archivo de teselas auto-hospedado configurado.
          </Banner>
        ) : null}

        {dataset.unmappableSites.length > 0 ? (
          <Banner
            tone="warning"
            title={`${dataset.unmappableSites.length} sitio(s) sin coordenadas`}
            testID="unmappable-sites"
          >
            {dataset.unmappableSites.map((site) => site.name).join(', ')}. Están
            guardados pero no se pueden ubicar en el mapa.
          </Banner>
        ) : null}

        {map.selectedSite ? (
          <View testID="site-detail">
            <Text style={styles.detailTitle}>{map.selectedSite.name}</Text>
            <Text style={styles.detailSubtitle}>
              {[map.selectedSite.city, map.selectedSite.country]
                .filter(Boolean)
                .join(', ') || 'Ubicación sin detalle'}
            </Text>
            <Text style={styles.detailMeta}>
              {map.selectedSite.equipmentCount} registro(s) de equipo ·{' '}
              {map.selectedSite.equipmentUnitCount} unidad(es)
            </Text>
            {/*
              Stated once per site rather than once per equipment row: every
              piece of equipment at a customer site shares that site's
              coordinates by design (docs/maps.md §6).
            */}
            <Text style={styles.derivedPosition}>
              Equipos ubicados en las coordenadas del sitio del cliente.
            </Text>

            {selectedEquipment.length === 0 ? (
              <Text style={styles.detailEmpty}>
                No hay equipos registrados en este sitio.
              </Text>
            ) : (
              selectedEquipment.map((item) => (
                <View key={item.equipmentId} style={styles.equipmentRow}>
                  <Text style={styles.equipmentTitle}>
                    {[item.brand, item.model].filter(Boolean).join(' ') ||
                      'Equipo sin marca ni modelo'}
                  </Text>
                  <Text style={styles.equipmentMeta}>
                    {[
                      item.modality,
                      item.quantity !== null ? `${item.quantity} unidad(es)` : null,
                      item.installationYear !== null
                        ? `instalado ${item.installationYear}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Sin atributos registrados'}
                  </Text>
                </View>
              ))
            )}

            <Pressable
              onPress={() => router.push({ pathname: '/site/[siteId]', params: { siteId: map.selectedSite!.siteId } })}
              style={styles.observationsButton}
              accessibilityRole="button"
              accessibilityLabel="Ver observaciones de este sitio"
              testID="view-observations"
            >
              <Text style={styles.observationsButtonText}>Ver observaciones</Text>
            </Pressable>

            <Pressable
              onPress={map.clearSelection}
              style={styles.clearButton}
              accessibilityRole="button"
              accessibilityLabel="Quitar selección"
              testID="clear-selection"
            >
              <Text style={styles.clearButtonText}>Quitar selección</Text>
            </Pressable>
          </View>
        ) : (
          <View testID="map-summary">
            <Text style={styles.detailTitle}>
              {dataset.sites.length} sitio(s) en el mapa
            </Text>
            <Text style={styles.detailSubtitle}>
              Toca un punto para ver sus equipos.
            </Text>
          </View>
        )}

        <View style={styles.regionSection} testID="map-cache-state">
          <Text style={styles.sectionTitle}>Regiones de mapa descargadas</Text>
          {regions.length === 0 ? (
            <Text style={styles.detailEmpty}>
              Ninguna región descargada.
            </Text>
          ) : (
            regions.map((region) => {
              const canDownload =
                region.status === 'not_downloaded' || region.status === 'failed';
              return (
                <View key={region.id} style={styles.regionItem}>
                  <Text style={styles.regionRow}>
                    {region.name} — {region.status}
                    {region.status === 'downloading'
                      ? ` (${Math.round(region.progress * 100)}%)`
                      : ''}
                    {region.lastError ? ` · ${region.lastError}` : ''}
                  </Text>
                  {canDownload ? (
                    <Pressable
                      onPress={() => void map.downloadRegion(region.id)}
                      style={styles.downloadButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Descargar región ${region.name}`}
                      testID={`download-region-${region.id}`}
                    >
                      <Text style={styles.downloadButtonText}>Descargar</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}
          <Text style={styles.regionNote}>
            Las regiones de mapa y los datos de negocio se descargan por
            separado: descargar un mapa no descarga sitios ni equipos.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Banner({
  tone,
  title,
  children,
  testID,
}: {
  tone: 'info' | 'warning' | 'error';
  title: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const background =
    tone === 'error'
      ? colors.errorContainer
      : tone === 'warning'
        ? colors.pendingContainer
        : colors.surfaceVariant;
  const foreground =
    tone === 'error'
      ? colors.error
      : tone === 'warning'
        ? colors.pending
        : colors.onSurfaceVariant;

  return (
    <View style={[styles.banner, { backgroundColor: background }]} testID={testID}>
      <Text style={[styles.bannerTitle, { color: foreground }]}>{title}</Text>
      <Text style={styles.bannerBody}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  mapContainer: { flex: 1, minHeight: 220 },
  map: { flex: 1 },
  panel: {
    maxHeight: '45%',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
    backgroundColor: colors.surface,
  },
  panelContent: { padding: spacing.md, gap: spacing.sm },
  banner: { padding: spacing.sm, borderRadius: 4, gap: spacing.xs },
  bannerTitle: { ...typography.labelMedium },
  bannerBody: { ...typography.bodyMedium, color: colors.onSurface },
  detailTitle: { ...typography.titleMedium, color: colors.onSurface },
  detailSubtitle: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  detailMeta: {
    ...typography.bodyMedium,
    color: colors.onSurface,
    marginTop: spacing.xs,
  },
  detailEmpty: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  equipmentRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surfaceVariant,
  },
  equipmentTitle: { ...typography.bodyLarge, color: colors.onSurface },
  equipmentMeta: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  derivedPosition: {
    ...typography.labelMedium,
    color: colors.onSurfaceVariant,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  observationsButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  observationsButtonText: { ...typography.titleMedium, color: colors.onPrimary },
  clearButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  clearButtonText: { ...typography.titleMedium, color: colors.onSurface },
  regionSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
  },
  sectionTitle: { ...typography.titleMedium, color: colors.onSurface },
  regionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  regionRow: {
    ...typography.bodyMedium,
    color: colors.onSurface,
    flex: 1,
  },
  downloadButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  downloadButtonText: { ...typography.labelMedium, color: colors.onPrimary },
  regionNote: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    marginTop: spacing.sm,
  },
});
