# Decisiones de Arquitectura Financiera (Fases 1 & 1.1)

## ADR 01: Matriz de Efectos Financieros Centralizada
- **Contexto:** Distintas pantallas (`DashboardScreen`, `TransactionsScreen`, `FinancialContext`) calculaban ingresos, gastos y flujos con reglas ad-hoc.
- **Decisión:** Crear `src/utils/financialCore.ts` con la función pura `evaluateTransactionEffects(tx)`. Esta función formaliza la separación entre **Consumo (Causación)**, **Flujo de Caja Consolidado**, **Movimiento Físico por Cuenta**, **Activos**, **Pasivos** y **Patrimonio Neto**.
- **Consecuencias:** Cualquier nuevo tipo de transacción añadido en futuras fases (ej. CDTs, inversiones) solo requerirá añadir una rama a esta matriz y será interpretado de forma consistente en toda la app.

---

## ADR 02: Atomicidad Transaccional SQLite
- **Contexto:** Operaciones compuestas (transferencias, compras a cuotas, pagos) ejecutaban múltiples `runAsync` independientes. Si la app se cerraba a mitad de camino, podían quedar cuotas huérfanas o balances desincronizados.
- **Decisión:** Envolver todas las mutaciones multi-tabla de `TransactionRepository` y `CardRepository` en `db.withTransactionAsync`.
- **Consecuencias:** Garantía de propiedades ACID a nivel de base de datos local ante excepciones o interrupciones.

---

## ADR 03: Reversibilidad Universal Simétrica
- **Contexto:** Al eliminar un `card_payment`, el dinero no se devolvía a la cuenta bancaria de origen.
- **Decisión:** Implementar en `TransactionRepository.delete` y `TransactionRepository.update` una lógica de reversión universal para todos los tipos: `expense` (restituye monto + GMF), `income` (deduce monto), `transfer` (restituye origen + GMF y debita destino), `card_payment` (restituye cuenta origen y reduce cupo disponible en tarjeta).
- **Consecuencias:** Cualquier movimiento ordinario puede eliminarse o editarse en cualquier momento sin desincronizar los saldos reales de cuentas y tarjetas.

---

## ADR 04: Tratamiento Conceptual del 4x1000 (GMF)
- **Contexto:** El 4x1000 era omitido en algunas sumatorias de gastos mensuales en el historial.
- **Decisión:** El impuesto 4x1000 es un gasto financiero real (pérdida patrimonial). En transferencias propias, el monto transferido no es gasto (es permuta interna de activos), pero el GMF generado sí es gasto corriente. En gastos y compras, el GMF se suma al total del consumo.
- **Consecuencias:** El total de egresos coincide exactamente con los extractos bancarios del usuario.

---

## ADR 05: Cuadre Exacto de Amortización Francesa
- **Contexto:** Al dividir cuotas con decimales o tasa 0%, los redondeos podían generar discrepancias de centavos entre la suma de cuotas y el capital original.
- **Decisión:** En `generateAmortizationSchedule`, la última cuota ($N$) ajusta el capital restante exacto ($principalAmount = remainingPrincipal$).
- **Consecuencias:** $\sum_{i=1}^N principal_i \equiv P$ con 100% de exactitud matemática.

---

## ADR 06: Única Fuente de Verdad para Cupo y Saldos en Pagos de Tarjeta (Fase 1.1)
- **Contexto:** Se detectó ambigüedad donde `FinancialContext` realizaba `updateAvailableLimit` y `updateBalance` de forma paralela a `TransactionRepository.create(tx)`.
- **Decisión:** Centralizar **100% de las mutaciones de saldo y cupo en el repositorio transaccional**.
  - Abono General a Tarjeta: Gestionado exclusivamente por `TransactionRepository.create(tx)` dentro de `withTransactionAsync`.
  - Pago de Cuota Específica: Gestionado exclusivamente por `CardRepository.payInstallmentAtomic()` dentro de `withTransactionAsync`.
- **Consecuencias:** Se elimina de raíz cualquier riesgo de doble liberación de cupo o doble débito en cuentas bancarias.

---

## ADR 07: Política de Bloqueo de Borrado para Operaciones con Dependencias (Fase 1.1)
- **Contexto:** Si una compra diferida a 12 cuotas ya tiene 5 cuotas pagadas y movimientos asociados, un `DELETE` directo de la compra original corrompería el historial histórico y la contabilidad.
- **Decisión:**
  - Si una compra tiene `installments_paid > 0` o pagos posteriores, la eliminación directa está **BLOQUEADA** lanzando una excepción con mensaje claro.
  - Si la compra no tiene pagos asociados (`installments_paid === 0`), se permite su eliminación limpia revirtiendo cuotas y cupo.
- **Consecuencias:** Protección contra borrados accidentales de operaciones con dependencias financieras posteriores.
