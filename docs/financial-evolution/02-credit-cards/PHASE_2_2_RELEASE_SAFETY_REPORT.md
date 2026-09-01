# PHASE 2.2 — RELEASE SAFETY REPORT: PARCHE FINAL PARA PUBLICACIÓN Y USO DIARIO

**Fecha:** 2026-09-01  
**Versión:** 1.0.0 (Native Runtime 1.0.0)  
**Motor Financiero:** SQLite Real (`node:sqlite` & Repositorios de Producción)  
**Estado:** VALIDADO Y APROBADO 100%  

---

# Reconciled Non-Principal Debt

### Diagnóstico del Problema
Previamente, `getCardStatementSummary()` acumulaba todas las conciliaciones no capitales aplicadas (`interest`, `fees`, `taxes`, `collection`) sumándolas a `nonPrincipalDebt`. Sin embargo:
1. `payCreditCardAtomic()` no suministraba estos conceptos no facturados en el contexto enviado a `issuerPolicy.allocatePayment()`.
2. Las filas en `card_reconciliations` no poseían un mecanismo para registrar pagos o amortizaciones parciales o totales.
3. Esto provocaba que una comisión conciliada continuara adeudada indefinidamente en `nonPrincipalDebt` tras haber sido pagada, o fuera absorbida erróneamente como capital consumiendo cupo.

### Solución Implementada
1. **Columna `amount_paid` en Base de Datos**:
   Se añadió la columna `amount_paid REAL NOT NULL DEFAULT 0` a la tabla `card_reconciliations` tanto en el DDL inicial como mediante migración idempotente en `src/database/database.ts`.
2. **Consulta Determinista de Pendientes**:
   Se implementó `ReconciliationRepository.getPendingNonPrincipalSummary(cardId)`, el cual consulta todas las conciliaciones aplicadas no capitales y calcula el saldo pendiente real:
   $$\text{remainingAmount} = \max(0, \text{difference\_amount} - \text{amount\_paid})$$
   Agrupándolo en: `interestPending`, `feesPending`, `taxesPending`, `collectionPending` y `totalPending`.
3. **Amortización Atómica de Conciliaciones**:
   Se implementó `ReconciliationRepository.applyPaymentToReconciliations(cardId, applied)`, el cual actualiza `amount_paid` en las conciliaciones correspondientes en estricto orden cronológico (FIFO).
4. **Reversión Simétrica**:
   Se implementó `ReconciliationRepository.revertPaymentFromReconciliations(cardId, reverted)`. Al eliminar o revertir un pago de tarjeta mediante `TransactionRepository.delete()`, se restaura `amount_paid` en orden inverso, dejando las conciliaciones exactamente con su deuda pendiente previa.

---

# Allocation Changes

### Desglose Multi-Concepto en Imputación de Pagos
La imputación de pagos (`Payment Allocation`) distingue ahora de forma precisa tres fuentes de deuda:
1. **Statement Concepts (Deuda Facturada)**:
   - `collection_fee`, `late_interest`, `handling_fee`, `taxes_and_fees`, `current_interest`, `billed_principal`.
2. **Unbilled / Reconciled Non-Principal (Deuda No Facturada de Conciliación)**:
   - `unbilledCollectionPending`, `unbilledLateInterestPending`, `unbilledFeesPending`, `unbilledTaxesPending`, `unbilledCurrentInterestPending`.
3. **Unbilled Principal (Capital No Facturado)**:
   - Compras post-corte y saldo remanente de capital que consume cupo disponible.

### Integración en Políticas Bancarias
Todas las políticas de emisor (`NuPolicy`, `BancolombiaPolicy`, `RappiCardPolicy`, `GenericPolicy`) implementan el procesamiento de conceptos no facturados respetando la prelación oficial de cada entidad:
- **RappiCard Policy**: `collectionFee` $\to$ `lateInterest` $\to$ `currentInterest` $\to$ `taxesAndFees` $\to$ `handlingFee` $\to$ `unbilledCollection` $\to$ `unbilledLateInterest` $\to$ `unbilledCurrentInterest` $\to$ `unbilledTaxes` $\to$ `unbilledFees` $\to$ `principal`.
- **Bancolombia Policy**: `lateInterest` $\to$ `handlingFee` $\to$ `taxesAndFees` $\to$ `currentInterest` $\to$ `unbilledLateInterest` $\to$ `unbilledFees` $\to$ `unbilledTaxes` $\to$ `unbilledCurrentInterest` $\to$ `principal`.
- **Nu Policy**: `taxesAndFees` $\to$ `handlingFee` $\to$ `lateInterest` $\to$ `currentInterest` $\to$ `unbilledTaxes` $\to$ `unbilledFees` $\to$ `unbilledLateInterest` $\to$ `unbilledCurrentInterest` $\to$ `principal`.
- **Generic Policy**: Cascada estándar protegiendo la amortización de capital en último término.

---

# Principal Cap

### Guarda Estricta de Dominio: `principalApplied <= principalDebt`
Para evitar que un pago con montos combinados o excedentes libere más cupo del efectivamente utilizado por capital adeudado:
1. Se implementó una guarda matemática estricta a nivel de política y a nivel de repositorio (`CardRepository.payCreditCardAtomic`):
   $$\text{principalApplied} \le \min(\text{remainingPayment}, \text{principalDebt})$$
   donde $\text{principalDebt} = \max(0, \text{creditLimit} - \text{availableLimit})$.
2. **Ejemplo Validado**:
   - Tarjeta: Cupo $5.000.000, Disponible $4.500.000 ($\text{principalDebt} = \$500.000$).
   - Conciliación comisiones: $\$50.000$ ($\text{nonPrincipalDebt} = \$50.000$).
   - Pago recibido: $\$550.000$.
   - **Resultado Obligatorio**: $\text{feesApplied} = \$50.000$, $\text{principalApplied} = \$500.000$.
   - En ningún escenario $\text{principalApplied}$ puede ser $\$550.000$.
3. Cualquier excedente monetario tras cancelar el 100% de los cargos exigibles y el 100% del capital adeudado se asigna a `creditBalanceApplied` (saldo a favor).

---

# Payment Editing Policy

### Bloqueo Estructural de Edición para `card_payment`
`TransactionRepository.update()` eliminó toda la lógica heredada que modificaba cupos basándose en deltas simples (`oldTx.amount` vs `updatedTx.amount`).
1. **Regla de Inmutabilidad Estructural**:
   Se bloquea cualquier intento de actualizar los siguientes campos en transacciones de tipo `card_payment`:
   - `amount`
   - `accountId`
   - `cardId`
   - `statementId`
   - `principalAmount`
   - `interestAmount`
   - `type`
2. **Mensaje de Excepción Controlado**:
   > *"Los pagos de tarjeta no pueden modificarse directamente. Revierte el pago y regístralo nuevamente."*
3. **Edición No Estructural Permitida**:
   Se permite únicamente actualizar de forma segura los campos informativos `description` y `notes`, sin alterar saldos bancarios, cupos de tarjetas ni asignaciones de extractos.

---

# Balance Adjustment Integrity

### Bloqueo de Eliminación y Edición Directa de `balance_adjustment`
Las transacciones generadas por el módulo de Conciliación Bancaria (`type === 'balance_adjustment'`) son registros de auditoría vinculados a un ajuste contable en `card_reconciliations`.
1. **Bloqueo en `delete()`**:
   Se bloquea la eliminación directa de transacciones `balance_adjustment` desde el listado general con el mensaje:
   > *"Los ajustes de conciliación deben corregirse desde el módulo de Conciliación."*
2. **Bloqueo en `update()`**:
   Se bloquea la modificación de montos o tarjetas de ajustes de conciliación.

---

# Opening Balance Dependency Protection

### Protección de Dependencias en `card_opening_balance`
1. El saldo de apertura de una tarjeta (`card_opening_balance`) establece la línea base contable y el extracto de apertura inicial.
2. `TransactionRepository.delete()` comprueba si existen transacciones o pagos posteriores dependientes sobre la tarjeta.
3. Si existen movimientos posteriores registrados, la eliminación es rechazada con el mensaje:
   > *"No es posible eliminar el Saldo de Apertura porque existen movimientos o pagos posteriores que dependen de él."*
4. Si no existen dependencias posteriores, la transacción de apertura puede revertirse de forma limpia, restaurando el cupo consumido y eliminando el extracto asociado.

---

# Tests T47-T55

La suite completa de pruebas automatizadas sobre SQLite real (`node:sqlite`) y repositorios de producción incluye la totalidad de las pruebas unitarias y de integración [U01–U09], [T01–T30], [T31–T46] y los nuevos casos [T47–T55]:

| ID | Nombre y Descripción de la Prueba | Resultado |
| :--- | :--- | :---: |
| **T47** | **Conciliación no principal + pago total**: Capital 500k, Fees 35k, Pago 535k $\to$ `principalApplied: 500k`, `feesApplied: 35k`, cupo 100% disponible, `totalCurrentDebt: 0`. | **PASÓ** |
| **T48** | **Pago parcial de conciliación no principal**: Fees 50k, Pago 20k $\to$ Pendiente fees 30k. No libera cupo. | **PASÓ** |
| **T49** | **Segundo pago completa conciliación**: Pago 30k subsiguiente $\to$ fees pendiente = 0, `totalCurrentDebt = 0`. | **PASÓ** |
| **T50** | **Revertir pago de conciliación**: DELETE payment $\to$ Fees vuelve a quedar pendiente ($35.000) simétricamente. | **PASÓ** |
| **T51** | **Principal Applied Cap**: Principal debt 500k, Non-principal 50k, Pago 550k $\to$ `principalApplied` es exactamente 500k. | **PASÓ** |
| **T52** | **Editar card_payment estructural**: Intento de modificar monto $\to$ lanza error, cuenta, tarjeta y allocation intactos. | **PASÓ** |
| **T53** | **Editar solo notes/description de card_payment**: Modificar notas $\to$ SUCCESS sin tocar ningún saldo ni cupo. | **PASÓ** |
| **T54** | **DELETE balance_adjustment**: Intento de eliminar transacción de ajuste $\to$ Rechazado con mensaje oficial. | **PASÓ** |
| **T55** | **Opening Balance con pagos posteriores**: Intento de eliminar opening balance con pagos existentes $\to$ Rechazado. | **PASÓ** |

### Resultado de la Ejecución Automatizada:
```text
✔ 1. Pruebas Unitarias [UNIT] - Lógica y Matemática Pura (9/9)
✔ 2. Batería de Tarjetas de Crédito [T01 a T30] (7/7)
✔ 3. Batería de Integridad Contable Fase 2.1 [T31 a T46] (16/16)
✔ 4. Batería de Seguridad Operativa Fase 2.2 [T47 a T55] (9/9)
Total: 41 tests pasados / 0 fallos (100% de éxito)
```

---

# Remaining Limitations

Las siguientes limitaciones se mantienen intencionalmente por alcance de diseño y serán abordadas en fases subsiguientes del roadmap:
1. **Simulador Interactivo de Compras (Fase 2B)**: El comparador interactivo multidía y optimizador de fechas de compra no forma parte del motor contable base de Fase 2A/2.2.
2. **Deudas y Préstamos Personales (Fase 3)**: El módulo de préstamos a terceros, deudas bancarias no rotativas y amortizaciones fijas se implementará en la Fase 3.
3. **Múltiples Saldos de Apertura**: Por diseño estricto de integridad contable (ADR-007), solo se admite un único Opening Balance inicial por tarjeta; cualquier desajuste posterior se gestiona mediante Conciliación Bancaria.

---

# DAILY USE VERDICT

> [!IMPORTANT]
> **VEREDICTO OFICIAL: `READY_FOR_DAILY_USE`**
>
> El subsistema de Tarjetas de Crédito de `gestion-gastos` satisface todos los requisitos de:
> 1. Exactitud contable en la fórmula de 3 saldos.
> 2. Prelación legal y financiera por entidad emisora (Nu, Bancolombia, RappiCard, Genérica).
> 3. Amortización, trazabilidad y reversibilidad simétrica de conciliaciones no principales.
> 4. Guardas inviolables para protección del cupo disponible (`principalApplied <= principalDebt`).
> 5. Bloqueo de ediciones y eliminaciones destructivas en el libro mayor.
>
> **La aplicación está formalmente lista y verificada para su uso diario confiable.**
