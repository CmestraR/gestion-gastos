/**
 * Formatea montos en la moneda especificada (COP, USD, EUR, MXN, etc.)
 */
export function formatCurrency(amount: number, currency: string = 'COP', includeDecimals: boolean = false): string {
  if (isNaN(amount)) amount = 0;
  
  const isCOP = currency.toUpperCase() === 'COP';
  const showDecimals = includeDecimals && !isCOP;

  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: currency || 'COP',
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    }).format(amount);
  } catch {
    // Fallback if currency string is not standard
    const formatted = Math.abs(amount)
      .toFixed(showDecimals ? 2 : 0)
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const sign = amount < 0 ? '-' : '';
    return `${sign}$ ${formatted}`;
  }
}

/**
 * Formatea una fecha YYYY-MM-DD a formato amigable en español (ej. "15 de Septiembre, 2026")
 */
export function formatDate(dateString: string): string {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Formato relativo corto (ej. "Hoy", "Ayer", "15 Ago")
 */
export function formatRelativeDate(dateString: string): string {
  if (!dateString) return '';
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const dateOnly = dateString.split('T')[0];

  if (dateOnly === todayStr) return 'Hoy';
  if (dateOnly === yesterdayStr) return 'Ayer';

  return formatDate(dateOnly);
}

/**
 * Obtiene el nombre del mes en español
 */
export function getMonthName(monthIndex: number): string {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[monthIndex] || '';
}

/**
 * Formatea un valor numérico mientras el usuario escribe,
 * añadiendo automáticamente puntos separadores de miles (ej. 100000 -> 100.000).
 */
export function formatInputNumber(value: string | number): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Mantener solo dígitos
  const clean = str.replace(/\D/g, '');
  if (!clean) return '';
  // Separador de miles con puntos
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Convierte un texto con separadores de miles formateados a número puro (ej. "100.000" -> 100000).
 */
export function parseInputNumber(value: string): number {
  if (!value) return 0;
  const clean = String(value).replace(/\./g, '').replace(/,/g, '').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

