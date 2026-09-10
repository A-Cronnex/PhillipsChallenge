/**
 * Design tokens.
 *
 * Material Design spacing and type scale (CLAUDE.md §13) expressed as plain
 * values. No UI component library is used: none is chosen in the
 * documentation, and adding one would be an undeclared architectural
 * dependency (CLAUDE.md §18).
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const colors = {
  background: '#0B1019',
  surface: '#141D2A',
  surfaceVariant: '#202C3D',
  outline: '#7D8CA3',
  onSurface: '#F1F5FC',
  onSurfaceVariant: '#ACBAD0',
  primary: '#A7CAFF',
  onPrimary: '#102746',
  error: '#FFB4B4',
  errorContainer: '#42252E',
  success: '#9DDBB6',
  successContainer: '#193A30',
  pending: '#E9CE91',
  pendingContainer: '#3A3222',
  disabled: '#455166',
  border: 'rgba(199, 219, 255, 0.14)',
  glass: 'rgba(26, 38, 56, 0.88)',
  glow: '#75A9ED',
  scrim: 'rgba(3, 7, 13, 0.78)',
} as const;

export const radii = { sm: 12, md: 20, lg: 28 } as const;

export const typography = {
  titleLarge: { fontSize: 22, fontWeight: '600' as const },
  titleMedium: { fontSize: 16, fontWeight: '600' as const },
  bodyLarge: { fontSize: 16, fontWeight: '400' as const },
  bodyMedium: { fontSize: 14, fontWeight: '400' as const },
  labelMedium: { fontSize: 12, fontWeight: '600' as const },
} as const;

/** Android/iOS minimum recommended touch target. */
export const MIN_TOUCH_TARGET = 48;
