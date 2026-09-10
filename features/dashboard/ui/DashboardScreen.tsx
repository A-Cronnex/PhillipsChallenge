import { SyncIconButton } from '../../synchronization/ui/SyncIconButton';
import { SyncPanel } from '../../synchronization/ui/SyncPanel';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/ScreenStates';
import { colors, spacing, typography } from '../../../lib/theme';
import { SYNC_STATUSES } from '../../../types/domain';
import type {
  AgeBucketCount,
  CategoryCount,
  SiteMetrics,
} from '../domain/metrics';
import {
  AGING_SITES_CAPTION,
  ageBucketLabel,
  COMPLETENESS_LABELS,
  CONFIDENCE_LABELS,
  countryLabel,
  daysAgoLabel,
  modalityLabel,
  STALE_SITES_CAPTION,
} from './labels';
import { useDashboard } from './useDashboard';

/**
 * Local analytics over what this device has captured.
 *
 * Every number on this screen is computed from SQLite rows on the device. The
 * screen never waits on a network request and never hides a record because it
 * has not been uploaded — a dashboard that only counted synchronized rows
 * would read as empty on a device that captured all day (CLAUDE.md §6,
 * docs/offline-sync.md §2).
 *
 * Synchronization status is shown in its own panel, clearly separated from the
 * business numbers (docs/architecture.md §10).
 */
export function DashboardScreen() {
  const dashboard = useDashboard();

  if (dashboard.phase === 'loading') {
    return <LoadingState message="Calculando métricas locales…" />;
  }

  if (dashboard.phase === 'unavailable' || !dashboard.data) {
    return (
      <ErrorState
        title="No se pudo calcular el tablero"
        message={
          dashboard.error ??
          'Ocurrió un error inesperado al leer los datos locales.'
        }
        onRetry={dashboard.reload}
      />
    );
  }

  const { metrics, sync, computedFor } = dashboard.data;

  if (metrics.totals.observations === 0) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <SyncIconButton onComplete={dashboard.reload} />
        </View>
        <SyncPanel />
        <EmptyState
          title="Todavía no hay observaciones"
          message="Registra una observación en Captura o con el Agente y las métricas aparecerán aquí. El tablero se calcula en el dispositivo, sin conexión."
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="dashboard-screen"
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={dashboard.reload}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.topBar}>
        <SyncIconButton onComplete={dashboard.reload} />
      </View>
      <SyncPanel />
      <Text style={styles.caption} testID="dashboard-scope">
        Calculado en este dispositivo el {computedFor}, a partir de{' '}
        {metrics.totals.observations} observación(es) guardada(s) localmente.
        Incluye lo que aún no se ha sincronizado.
      </Text>

      <View style={styles.tiles}>
        <Tile label="Sitios" value={metrics.totals.sites} testID="tile-sites" />
        <Tile
          label="Observaciones"
          value={metrics.totals.observations}
          testID="tile-observations"
        />
        <Tile
          label="Unidades reportadas"
          value={metrics.totals.reportedUnits}
          testID="tile-units"
        />
        <Tile
          label="Modalidades"
          value={metrics.totals.modalities}
          testID="tile-modalities"
        />
        <Tile label="Marcas" value={metrics.totals.brands} testID="tile-brands" />
      </View>

      {/*
        Said once, at the top, rather than qualifying every number below:
        these are field reports, not a verified installed base. Until duplicate
        detection exists, two colleagues reporting the same scanner are two
        observations (docs/domain-model.md §5–§6).
      */}
      <Text style={styles.caption}>
        Son observaciones de campo, no un inventario verificado: todavía no se
        detectan duplicados entre reportes.
      </Text>

      <Section title="Equipos por modalidad" testID="section-modality">
        <CategoryList
          items={metrics.byModality}
          labelOf={modalityLabel}
          testIDPrefix="modality"
        />
      </Section>

      <Section title="Equipos por país" testID="section-country">
        <CategoryList
          items={metrics.byCountry}
          labelOf={countryLabel}
          testIDPrefix="country"
        />
      </Section>

      <Section title="Equipos por antigüedad estimada" testID="section-age">
        {metrics.byAge.map((bucket: AgeBucketCount) => (
          <Row
            key={bucket.bucket}
            label={ageBucketLabel(bucket.bucket)}
            value={`${bucket.units} unidad(es)`}
            testID={`age-${bucket.bucket}`}
          />
        ))}
      </Section>

      <Section title="Confianza de la información" testID="section-confidence">
        {(['high', 'medium', 'low', 'unrated'] as const).map((level) => (
          <Row
            key={level}
            label={CONFIDENCE_LABELS[level]}
            value={`${metrics.byConfidence[level]} observación(es)`}
            testID={`confidence-${level}`}
          />
        ))}
      </Section>

      <Section title="Información incompleta" testID="section-completeness">
        <Row
          label="Observaciones completas"
          value={String(metrics.completeness.complete)}
          testID="completeness-complete"
        />
        <Row
          label="Observaciones incompletas"
          value={String(metrics.completeness.incomplete)}
          testID="completeness-incomplete"
        />
        {Object.entries(metrics.completeness.missingByField).map(
          ([field, count]) => (
            <Row
              key={field}
              label={COMPLETENESS_LABELS[field as keyof typeof COMPLETENESS_LABELS]}
              value={String(count)}
              testID={`missing-${field}`}
            />
          )
        )}
      </Section>

      <Section
        title="Oportunidades de renovación"
        caption={AGING_SITES_CAPTION}
        testID="section-aging"
      >
        <SiteList
          sites={metrics.agingSites}
          emptyMessage="Ningún sitio registra equipos de esa antigüedad."
          detailOf={(site) =>
            `${site.oldestEquipmentAge} años · ${site.reportedUnits} unidad(es)`
          }
          testIDPrefix="aging"
        />
      </Section>

      <Section
        title="Información sin actualizar"
        caption={STALE_SITES_CAPTION}
        testID="section-stale"
      >
        <SiteList
          sites={metrics.staleSites}
          emptyMessage="Todos los sitios se visitaron recientemente."
          detailOf={(site) => `Última visita ${daysAgoLabel(site.daysSinceLastVisit)}`}
          testIDPrefix="stale"
        />
      </Section>

      <Section title="Sitios actualizados recientemente" testID="section-recent">
        <SiteList
          sites={metrics.recentlyUpdatedSites}
          emptyMessage="Sin visitas registradas."
          detailOf={(site) =>
            `${site.lastVisitDate} · ${site.observations} observación(es)`
          }
          testIDPrefix="recent"
        />
      </Section>

      {/*
        Sync state lives in its own section, below the business numbers and
        visually separated: the dashboard reports it, it does not own it
        (docs/architecture.md §10), and it must never look like a metric.
      */}
      <Section
        title="Estado de sincronización"
        caption="No afecta a las métricas anteriores: todo lo guardado localmente ya está contado."
        testID="section-sync"
      >
        {sync === null ? (
          <Text style={styles.empty} testID="sync-unavailable">
            No se pudo leer el estado de sincronización. Las métricas de arriba
            siguen siendo correctas.
          </Text>
        ) : sync.total === 0 ? (
          <Text style={styles.empty} testID="sync-empty">
            No hay registros en cola de sincronización.
          </Text>
        ) : (
          SYNC_STATUSES.filter((status) => sync.byStatus[status] > 0).map(
            (status) => (
              <Row
                key={status}
                label={status}
                value={String(sync.byStatus[status])}
                testID={`sync-${status}`}
              />
            )
          )
        )}
      </Section>
    </ScrollView>
  );
}

function Tile({
  label,
  value,
  testID,
}: {
  label: string;
  value: number;
  testID?: string;
}) {
  return (
    <View style={styles.tile} testID={testID} accessibilityRole="summary">
      <Text style={styles.tileValue} testID={testID ? `${testID}-value` : undefined}>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  caption,
  children,
  testID,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.section} testID={testID}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}) {
  return (
    <View style={styles.row} testID={testID}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} testID={testID ? `${testID}-value` : undefined}>
        {value}
      </Text>
    </View>
  );
}

function CategoryList({
  items,
  labelOf,
  testIDPrefix,
}: {
  items: CategoryCount[];
  labelOf: (key: string | null) => string;
  testIDPrefix: string;
}) {
  if (items.length === 0) {
    return <Text style={styles.empty}>Sin datos registrados.</Text>;
  }
  return (
    <>
      {items.map((item) => (
        <Row
          key={item.key ?? '__unrecorded__'}
          label={labelOf(item.key)}
          value={`${item.units} unidad(es) · ${item.observations} obs.`}
          testID={`${testIDPrefix}-${item.key ?? 'unrecorded'}`}
        />
      ))}
    </>
  );
}

function SiteList({
  sites,
  emptyMessage,
  detailOf,
  testIDPrefix,
}: {
  sites: SiteMetrics[];
  emptyMessage: string;
  detailOf: (site: SiteMetrics) => string;
  testIDPrefix: string;
}) {
  if (sites.length === 0) {
    return (
      <Text style={styles.empty} testID={`${testIDPrefix}-empty`}>
        {emptyMessage}
      </Text>
    );
  }
  return (
    <>
      {sites.map((site) => (
        <View
          key={site.siteId}
          style={styles.siteRow}
          testID={`${testIDPrefix}-${site.siteId}`}
        >
          <Text style={styles.rowLabel}>{site.name}</Text>
          <Text style={styles.siteDetail}>
            {[site.city, site.country].filter(Boolean).join(', ') ||
              'Ubicación sin detalle'}
          </Text>
          <Text style={styles.siteDetail}>{detailOf(site)}</Text>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  caption: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    minWidth: 96,
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
  },
  tileValue: { ...typography.titleLarge, color: colors.primary },
  tileLabel: { ...typography.labelMedium, color: colors.onSurfaceVariant },
  section: {
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
    gap: spacing.xs,
  },
  sectionTitle: {
    ...typography.titleMedium,
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  rowLabel: { ...typography.bodyMedium, color: colors.onSurface, flexShrink: 1 },
  rowValue: { ...typography.titleMedium, color: colors.onSurface },
  siteRow: { paddingVertical: spacing.xs },
  siteDetail: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
  empty: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
});
