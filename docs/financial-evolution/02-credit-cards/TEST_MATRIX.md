# Matriz de Pruebas Automatizadas — Fase 2 & Fase 2.1 (SQLite Real)

## Suite Completa: 32 Casos Ejecutados sobre `node:sqlite` Real y Repositorios de Producción

### Bloque 1: Pruebas Unitarias [UNIT] — Lógica y Matemática Pura
- **U01**: Ingreso ordinario aumenta activos, caja y patrimonio (`assetDelta = +amount`, `netWorthDelta = +amount`).
- **U02**: Gasto corriente disminuye activos, caja y patrimonio (`assetDelta = -total`, `consumption = total`).
- **U03**: Transferencia entre cuentas es neutral en patrimonio (`netWorthDelta = 0`).
- **U04**: Compra con tarjeta de crédito aumenta pasivos y genera consumo (`liabilityDelta = +amount`, `consumption = amount`).
- **U05**: Pago de tarjeta desglosa capital e interés sin duplicar consumo.
- **U06**: Saldo de apertura de tarjeta (`card_opening_balance`) es un pasivo inicial (`liabilityDelta = +amount`, `consumption = 0`).
- **U07**: Conversión de Tasa EA a EM exacta con fórmula colombiana: $EM = (1 + EA)^{1/12} - 1$.
- **U08**: Cuota fija francesa exacta con tasa 0% vs tasa positiva.
- **U09**: Fechas de ciclo bancario (Día 15 corte, Día 5 pago).

### Bloque 2: Batería de Tarjetas de Crédito [T01 a T30] (Fase 2 Base)
- **T01**: Creación atómica de compra con tarjeta reduce el cupo disponible exactamente en el capital no pagado.
- **T02**: Abono a tarjeta libera cupo disponible únicamente por el capital amortizado pagado.
- **T24**: Extracto pagado en su totalidad pasa a estado `PAID`.
- **T25**: Extracto vencido con saldo pendiente pasa a `OVERDUE`.
- **T26**: Rechazo de extracto duplicado para el mismo ciclo de facturación.
- **T27**: Rechazo de pago superior a la deuda actual de la tarjeta.
- **T30**: Verificación estricta: Cupo liberado === Capital amortizado aplicado.

### Bloque 3: Batería de Integridad Contable [T31 a T46] (Fase 2.1)
- **T31**: `totalCurrentDebt = principalDebt + nonPrincipalDebt` sin duplicar cargos ni compras.
- **T32**: Consistencia matemática de los 3 saldos: `TOTAL CURRENT DEBT = BILLED DEBT + UNBILLED DEBT`.
- **T33**: Detección de inconsistencia cuando `billedStatementDebt > totalCurrentDebt` sin clamping silencioso (`hasInconsistency = true`).
- **T34**: Separación explícita de `billedPrincipalRemaining` y `unbilledPrincipalRemaining`.
- **T35**: Saldo de Apertura (`createOpeningBalanceSnapshot`) audita transacción y reduce cupo por capital.
- **T36**: Bloqueo estricto de un segundo Opening Balance para la misma tarjeta.
- **T37**: Payment allocations acumulativas descuentan conceptos pendientes reales en abonos sucesivos.
- **T38**: RappiCard Policy aplica prelación con Collection Fee en primer orden (`collectionFeeApplied`).
- **T39**: Bancolombia Policy marca `isEstimated = true` y rechaza pagos dirigidos.
- **T40**: Nu Policy declara `supportsDirectedPayment = false` y aplica prelación global.
- **T41**: Imputación de pago divide `statement_applied` y `unbilled_applied` cuando el pago supera el extracto.
- **T42**: Reversión determinista de pago de tarjeta usando `statement_applied` y `principal_applied`.
- **T43**: Reversión de `card_opening_balance` restaura cupo y elimina extracto asociado.
- **T44**: Conciliación de Capital (`differenceCategory = "capital"`) modifica `available_limit`.
- **T45**: Conciliación no capital (`differenceCategory = "fees" | "interest"`) NO modifica cupo pero suma a `nonPrincipalDebt`.
- **T46**: Conciliación sin clasificar (`differenceCategory = "unclassified"`) queda pendiente (`pending_review`) y luego se clasifica.

---

### Comando de Verificación
```bash
node --test tests/financialEngine.test.ts
```
**Resultado**:
```text
ℹ tests 32
ℹ suites 4
ℹ pass 32
ℹ fail 0
```
