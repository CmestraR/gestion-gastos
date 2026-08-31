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
