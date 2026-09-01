# Matriz de Pruebas Automatizadas — Fase 2, Fase 2.1 y Fase 2.2 Final (SQLite Real)

## Suite Completa: 68 Casos Ejecutados sobre `node:sqlite` Real y Repositorios de Producción

### Bloque 1: Pruebas Unitarias [UNIT] — Lógica y Matemática Pura (9 Tests)
- **U01**: Ingreso ordinario aumenta activos, caja y patrimonio (`assetDelta = +amount`, `netWorthDelta = +amount`).
- **U02**: Gasto corriente disminuye activos, caja y patrimonio (`assetDelta = -total`, `consumption = total`).
- **U03**: Transferencia entre cuentas es neutral en patrimonio (`netWorthDelta = 0`).
- **U04**: Compra con tarjeta de crédito aumenta pasivos y genera consumo (`liabilityDelta = +amount`, `consumption = amount`).
- **U05**: Pago de tarjeta desglosa capital e interés sin duplicar consumo.
- **U06**: Saldo de apertura de tarjeta (`card_opening_balance`) es un pasivo inicial (`liabilityDelta = +amount`, `consumption = 0`).
- **U07**: Conversión de Tasa EA a EM exacta con fórmula bancaria colombiana: $EM = (1 + EA)^{1/12} - 1$.
- **U08**: Cuota fija francesa exacta con tasa 0% vs tasa positiva.
- **U09**: Fechas de ciclo bancario (Día 15 corte, Día 5 pago).

---

### Bloque 2: Batería Base de Tarjetas de Crédito [T01 a T30] (30 Tests)
- **T01**: Creación de compra con tarjeta reduce el cupo disponible exactamente en el capital.
- **T02**: Abono a tarjeta libera cupo disponible únicamente por el capital amortizado pagado.
- **T03**: Compra con múltiples cuotas genera cuotas en `card_installments`.
- **T04**: Compra en 1 cuota sin intereses (tasa 0%) liquida cuota única sin recargo.
- **T05**: Cálculo de intereses corrientes en compra diferida con tasa positiva.
- **T06**: Consulta de compras activas por tarjeta (`getPurchasesForCard`).
- **T07**: Eliminación de compra sin cuotas pagadas restaura el cupo disponible.
- **T08**: Rechazo de eliminación directa de compra con cuotas pagadas.
- **T09**: Generación de ciclo de facturación automático (`getOrCreateCurrentCycle`).
- **T10**: Ciclo de facturación con fechas de corte y pago correctas.
- **T11**: Creación de extracto manual (`is_manual_snapshot = 1`).
- **T12**: Inmutabilidad de `total_statement_balance` en extractos.
- **T13**: Pago parcial de extracto actualiza `statement_balance_paid` y `minimum_payment_paid`.
- **T14**: Pago mínimo exacto deja el extracto como `open` / `minimum_covered`.
- **T15**: Actualización de cuotas pagadas (`installments_paid`) al abonar a una compra.
- **T16**: Transición de compra a `paid` cuando todas las cuotas son canceladas.
- **T17**: Generación de tabla de amortización francesa para compra con intereses.
- **T18**: Transacción de compra (`card_purchase`) registrada con `type = 'card_purchase'` en `transactions`.
- **T19**: Transacción de pago (`card_payment`) descuenta saldo de la cuenta de origen.
- **T20**: Validación: cuenta de origen debe tener saldo suficiente para el pago de tarjeta.
- **T21**: Prelación genérica: Pago abona intereses antes de amortizar capital.
- **T22**: Pago total del extracto cubre el 100% de los intereses y capital facturados.
- **T23**: Pago con excedente sobre el extracto amortiza compras post-corte (`unbilled_applied`).
- **T24**: Extracto pagado en su totalidad pasa a estado `PAID`.
- **T25**: Extracto vencido con saldo pendiente pasa a `OVERDUE`.
- **T26**: Rechazo de extracto duplicado para el mismo ciclo de facturación.
- **T27**: Rechazo de pago superior a la deuda actual de la tarjeta.
- **T28**: `getCardStatementSummary` con tarjeta sin movimientos reporta saldos en 0 y cupo 100% disponible.
- **T29**: `getCardStatementSummary` con compras activas calcula `principalDebt` exacto.
- **T30**: Verificación estricta: Cupo liberado === Capital amortizado aplicado.

---

### Bloque 3: Batería de Integridad Contable [T31 a T46] (Fase 2.1 — 16 Tests)
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

### Bloque 4: Batería de Seguridad Operativa y Preparación para Uso Diario [T47 a T55] (Fase 2.2 — 9 Tests)
- **T47**: Conciliación no principal + pago total extingue deuda no principal y libera cupo solo por capital.
- **T48**: Pago parcial de conciliación no principal mantiene saldo pendiente exacto.
- **T49**: Segundo pago completa la conciliación no principal.
- **T50**: Revertir pago de conciliación restaura el estado y saldo pendiente de forma 100% simétrica.
- **T51**: Principal Applied Cap: protección en motor para que `principalApplied` nunca supere `principalDebt`.
- **T52**: Bloqueo estricto de edición estructural en transacciones `card_payment`.
- **T53**: Permitir edición no estructural (`description` y `notes`) en transacciones `card_payment` sin alterar cupos ni saldos.
- **T54**: Bloqueo de eliminación directa de transacciones `balance_adjustment`.
- **T55**: Protección de `card_opening_balance` ante eliminación cuando existen transacciones dependientes posteriores.

---

### Bloque 5: Hotfix Final Fase 2 — Trazabilidad Exacta de Conciliaciones [T56 a T59] (4 Tests)
- **T56**: Facturado + Conciliado en la misma categoría: `card_payment_allocations` guarda valores facturados puros (BILLED ONLY) y las conciliaciones registran solo la parte no facturada pagada. Reversión restaura exactamente cada componente sin inflar conciliaciones.
- **T57**: Dos conciliaciones / Dos pagos independientes: Reversión del primer pago modifica únicamente su conciliación asociada, mientras que la segunda conciliación permanece intacta y pagada.
- **T58**: Pago repartido entre varias conciliaciones: Registro atómico y exacto en `card_payment_reconciliation_allocations` distribuyendo el pago por montos exactos y revirtiéndolos con precisión.
- **T59**: Reconciliaciones negativas (Banco reporta menor deuda): Si existe deuda no principal previa, se compensa reduciendo el saldo; si no hay deuda previa suficiente, se marca `pending_review` sin alterar silenciosamente la contabilidad.

---

## Comando de Verificación y Cobertura
```bash
npm test
```
**Resultado Real**:
```text
✔ BATERÍA COMPLETA DE PRUEBAS — MOTOR FINANCIERO Y TARJETAS DE CRÉDITO (FASE 2 & FASE 2.1)
  ✔ 1. Pruebas Unitarias [UNIT] - Lógica y Matemática Pura (9 tests)
  ✔ 2. Batería de Tarjetas de Crédito [T01 a T30] en SQLite Real (30 tests)
  ✔ 3. Batería de Integridad Contable Fase 2.1 [T31 a T46] en SQLite Real (29 tests)
ℹ tests 68
ℹ suites 4
ℹ pass 68
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
