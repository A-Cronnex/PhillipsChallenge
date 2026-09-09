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
  background: '#FFFBFE',
  surface: '#FFFFFF',
  surfaceVariant: '#E7E0EC',
  outline: '#79747E',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  primary: '#0F62A6',
  onPrimary: '#FFFFFF',
  error: '#B3261E',
  errorContainer: '#F9DEDC',
  success: '#1B5E20',
  successContainer: '#D7EBD8',
  pending: '#7A5900',
  pendingContainer: '#FFEFC2',
  disabled: '#C4C7C5',
} as const;

export const typography = {
  titleLarge: { fontSize: 22, fontWeight: '600' as const },
  titleMedium: { fontSize: 16, fontWeight: '600' as const },
  bodyLarge: { fontSize: 16, fontWeight: '400' as const },
  bodyMedium: { fontSize: 14, fontWeight: '400' as const },
  labelMedium: { fontSize: 12, fontWeight: '600' as const },
} as const;

/** Android/iOS minimum recommended touch target. */
export const MIN_TOUCH_TARGET = 48;
