export interface ReleaseChange {
  title: string;
  description: string;
}

export interface ReleaseInfo {
  version: string;
  codeName: string;
  buildDate: string;
  channel: string;
  highlights: string[];
}

export const APP_RELEASE_INFO: ReleaseInfo = {
  version: '2.0.1',
  codeName: 'Fase 2.2 — Hotfix Migraciones SQLite & Saldo Actual',
  buildDate: '1 Sep 2026',
  channel: 'Producción / Preview',
  highlights: [
    'Motor contable de Tarjetas de Crédito, Extractos y Cuotas',
    '3 Saldos financieros exactos: Deuda Total, Facturada y No Facturada',
    'Configurar Saldo Actual para tarjetas previas a la app',
    'Migraciones SQLite idempotentes y automáticas para bases existentes',
    'Conciliación Bancaria con trazabilidad individual y reversión',
  ],
};
