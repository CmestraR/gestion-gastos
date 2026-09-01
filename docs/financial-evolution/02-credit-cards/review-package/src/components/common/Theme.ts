export const Theme = {
  colors: {
    // Fondos y Superficies
    background: '#0B0F19',
    surface: '#111827',
    surfaceCard: '#1E293B',
    surfaceElevated: '#334155',
    border: '#1E293B',
    borderLight: '#334155',

    // Textos
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    textInverse: '#0B0F19',

    // Acentos Financieros
    primary: '#6366F1', // Indigo Vibrant
    primaryLight: '#818CF8',
    primaryDark: '#4338CA',

    success: '#10B981', // Emerald para Ingresos / Ahorro
    successLight: '#34D399',
    successBg: 'rgba(16, 185, 129, 0.12)',

    danger: '#EF4444', // Red para Gastos
    dangerLight: '#F87171',
    dangerBg: 'rgba(239, 68, 68, 0.12)',

    warning: '#F59E0B', // Amber para Alertas de Corte / Pagos próximos
    warningLight: '#FBBF24',
    warningBg: 'rgba(245, 158, 11, 0.12)',

    info: '#06B6D4', // Cyan para Transferencias
    infoBg: 'rgba(6, 182, 212, 0.12)',

    purple: '#8B5CF6',
    purpleBg: 'rgba(139, 92, 246, 0.12)',

    // Gradientes para Tarjetas
    cardGradients: [
      ['#1E1B4B', '#4338CA'], // Indigo Dark
      ['#3B0764', '#7E22CE'], // Purple Nu
      ['#064E3B', '#059669'], // Emerald Bank
      ['#7C2D12', '#EA580C'], // Orange Titanium
      ['#0F172A', '#334155'], // Slate Stealth
      ['#831843', '#BE185D'], // Rose Gold
    ] as [string, string][],
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 14,
    lg: 20,
    xl: 28,
    full: 9999,
  },
};
