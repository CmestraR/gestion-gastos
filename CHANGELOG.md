# Changelog
Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/)
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.0.1] - 2026-08-31

### Added
- **Fase 0 - Sistema de Versionado y Actualizaciones:**
  - Servicio de actualización `src/utils/updateService.ts` conectado a `expo-updates`.
  - Tarjeta de información de versión y build nativo en `SettingsScreen.tsx`.
  - Botón interactivo "Buscar Actualizaciones" con feedback claro al usuario.
  - Verificación en segundo plano no bloqueante al iniciar la aplicación.
- **Fase 1 - Motor Financiero e Integridad:**
  - Motor central de efectos financieros `src/utils/financialCore.ts` definiendo las matrices de Efectos Contables (`CONSUMPTION`, `CASH_INFLOW`, `CASH_OUTFLOW`, `ASSETS`, `LIABILITIES`, `NET_WORTH`).
  - Índices de rendimiento en SQLite (`transactions_date_idx`, `transactions_account_idx`, `transactions_card_idx`, `card_purchases_card_idx`, `card_installments_purchase_idx`, `card_installments_due_date_idx`).
  - Batería de pruebas automatizadas en `tests/financialEngine.test.ts` con cobertura de los 20 casos críticos y bordes financieros.
  - Ajuste de residuo en amortización francesa para cuadre exacto de centavos/enteros ($sum(capital) \equiv Monto$).

### Changed
- **Atomicidad Transaccional:**
  - `TransactionRepository.create`, `delete` y `update` ahora ejecutan dentro de bloques atómicos `db.withTransactionAsync`.
  - `CardRepository.createPurchase` y `markInstallmentAsPaid` protegidos con transacciones atómicas.
- **Métricas de Gastos:**
  - `TransactionsScreen` y `FinancialContext` ahora incorporan correctamente el impuesto 4x1000 (`gmfAmount`) dentro de los gastos totales del mes.

### Fixed
- **Reversión Universal de Pagos de Tarjeta:**
  - Corregido error en `TransactionRepository.delete` donde al eliminar un `card_payment` no se reintegraba el dinero a la cuenta bancaria origen.
- **Reversión de Compras con Tarjeta:**
  - Al eliminar un `card_purchase`, se eliminan en cascada sus cuotas pendientes y se restaura el cupo disponible de la tarjeta.

---

## [1.0.0] - 2026-08-31
- Lanzamiento inicial de la aplicación con soporte para cuentas bancarias, deudas personales, tarjetas de crédito, impuesto 4x1000 y clasificador inteligente de categorías.
