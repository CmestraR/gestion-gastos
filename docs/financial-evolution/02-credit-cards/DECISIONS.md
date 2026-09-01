# Registro de Decisiones de Arquitectura (ADR) — Fase 2 & Fase 2.1: Tarjetas de Crédito

## ADR-005: Modelo de 3 Saldos y Fórmula de Deuda Total Actual
- **Contexto**: El cálculo previo `totalCurrentDebt = creditLimit - availableLimit` solo reflejaba deuda por capital que consume cupo, ignorando intereses acumulados, cuotas de manejo no cubiertas o cobranza.
- **Decisión**: La Deuda Total Actual es la suma formal de dos componentes ortogonales:
  $$\text{totalCurrentDebt} = \text{principalDebt} + \text{nonPrincipalDebt}$$
  donde $\text{principalDebt} = \max(0, \text{creditLimit} - \text{availableLimit})$ y $\text{nonPrincipalDebt}$ es la suma neta de cargos e intereses pendientes.
  Adicionalmente: $\text{totalCurrentDebt} = \text{billedStatementDebtRemaining} + \text{unbilledDebt}$.
- **Consecuencias**: Exactitud matemática total al conciliar con extractos bancarios. Si el extracto supera la deuda global, se marca `hasInconsistency: true` sin ocultar el desajuste.

## ADR-006: Imputación de Pagos Acumulativa (Cumulative Payment Allocations)
- **Contexto**: Cuando el usuario realiza múltiples abonos a un extracto en el mismo ciclo, calcular la prelación sobre los valores históricos originales provocaba pagos dobles a intereses y menor amortización a capital.
- **Decisión**: `StatementRepository.getPendingConcepts(statementId)` consulta la suma de imputaciones previas en `card_payment_allocations` y calcula los saldos pendientes netos de cada concepto antes de aplicar la política de emisor.
- **Consecuencias**: Cada abono sucesivo cubre exactamente lo que queda pendiente en la cascada de prelación.

## ADR-007: Unicidad de Saldo de Apertura (Opening Balance Snapshot)
- **Contexto**: Un usuario podía registrar múltiples extractos de saldo de apertura, corrompiendo la línea base histórica de la tarjeta.
- **Decisión**: Se restringe a un único saldo de apertura (`is_opening_balance = 1`) por tarjeta mediante validación estricta en repositorio y base de datos. Cualquier ajuste posterior debe realizarse mediante el módulo de Conciliación Bancaria.
- **Consecuencias**: Integridad histórica garantizada.

## ADR-008: Honorarios de Cobranza en RappiCard y Políticas Declarativas
- **Contexto**: RappiCard antepone honorarios de cobranza pre-jurídica en el primer nivel de imputación. Bancolombia no expone prelación exacta y Nu no permite pagos dirigidos.
- **Decisión**:
  - `RappiCardPolicy`: Cascada de 6 niveles con `collectionFee` en prioridad 1.
  - `NuPolicy`: `supportsDirectedPayment = false`, `isEstimated = false`.
  - `BancolombiaPolicy`: `isEstimated = true`, `supportsDirectedPayment = false`.
- **Consecuencias**: Fiel reflejo del comportamiento contractual de cada emisor bancario en Colombia.

## ADR-009: Categorización y Aislamiento en Conciliación Bancaria
- **Contexto**: Las diferencias encontradas al conciliar se aplicaban indiferenciadamente al cupo disponible.
- **Decisión**: `CardReconciliation` clasifica la diferencia en: `capital`, `interest`, `fees`, `taxes`, `collection`, `unclassified`. Solo `capital` modifica `available_limit`. Las diferencias no clasificadas (`unclassified`) quedan con estado `pending_review` sin alterar el cupo hasta que el usuario las clasifique.
- **Consecuencias**: Cero impacto no deseado en el cupo disponible ante discrepancias por cargos o seguros bancarios.

## ADR-010: Ciclo Completo y Amortización de Conciliaciones No Principales (Fase 2.2)
- **Contexto**: Las conciliaciones no capitales (comisiones, intereses, impuestos) sumaban a `nonPrincipalDebt` pero no eran amortizables mediante pagos atómicos ni registraban pagos parciales/totales.
- **Decisión**: Se añadió la columna `amount_paid` a `card_reconciliations` y se integró `ReconciliationRepository.applyPaymentToReconciliations()` y `revertPaymentFromReconciliations()` en el flujo de pagos y reversiones.
- **Consecuencias**: Las conciliaciones no capitales pueden extinguirse mediante pagos reales y volver a activarse ante reversiones con 100% de simetría contable.

## ADR-011: Guarda de Dominio para Cupo y Capital (`principalApplied <= principalDebt`)
- **Contexto**: En pagos mixtos o con excedentes, un cálculo descuidado podía imputar más capital que la deuda real, inflando el cupo disponible.
- **Decisión**: Se estableció una guarda inviolable a nivel de dominio y repositorio: `res.principalApplied = Math.min(res.principalApplied, summary.principalDebt)`. Cualquier excedente pasa a saldo a favor (`creditBalanceApplied`).
- **Consecuencias**: Invariante garantizada: `availableLimit <= creditLimit` y jamás se libera más cupo que el consumido por capital.

## ADR-012: Inmutabilidad Estructural de Transacciones `card_payment`
- **Contexto**: La edición de transacciones `card_payment` modificaba directamente el cupo en repositorio mediante heurísticas antiguas sin actualizar las asignaciones contables ni los extractos asociados.
- **Decisión**: `TransactionRepository.update()` bloquea cualquier cambio en campos estructurales (`amount`, `accountId`, `cardId`, `statementId`, `principalAmount`, `interestAmount`, `type`) exigiendo revertir y volver a crear. Únicamente se permite actualizar `description` y `notes`.
- **Consecuencias**: Cero riesgo de corrupción de saldos por ediciones directas en pagos de tarjetas.

## ADR-013: Bloqueo de Eliminación y Edición Directa de `balance_adjustment`
- **Contexto**: Los ajustes de conciliación auditados podían borrarse o editarse desde el listado de transacciones, rompiendo la trazabilidad del módulo de conciliación.
- **Decisión**: `TransactionRepository.delete()` y `update()` bloquean operaciones directas sobre transacciones de tipo `balance_adjustment`, instruyendo al usuario a gestionarlas desde el módulo de Conciliación.
- **Consecuencias**: Integridad y consistencia absoluta entre auditoría contable y registros de conciliación.

## ADR-014: Protección de Eliminación de `card_opening_balance` con Dependencias
- **Contexto**: Eliminar un saldo de apertura cuando ya existían movimientos o pagos posteriores sobre la tarjeta dejaba la cuenta en un estado incoherente.
- **Decisión**: `TransactionRepository.delete()` comprueba la existencia de transacciones posteriores dependientes antes de permitir la eliminación de un `card_opening_balance`.
- **Consecuencias**: Blindaje ante borrados accidentales que puedan corromper la cronología de movimientos.

