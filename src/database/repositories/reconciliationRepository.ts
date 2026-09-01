import { getDatabase } from '../database.ts';
import type { CardReconciliation } from '../../types/finance.ts';

export const ReconciliationRepository = {
  /**
   * Registra una conciliación de tarjeta y opcionalmente un movimiento de ajuste auditado
   */
  async createReconciliation(rec: CardReconciliation): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const category = rec.differenceCategory || 'unclassified';
    let status = rec.status || (category === 'unclassified' && rec.differenceAmount !== 0 ? 'pending_review' : 'applied');

    await db.withTransactionAsync(async () => {
      const isCapital = category === 'capital';
      const isNegativeNonPrincipal = rec.differenceAmount < 0 && !isCapital && category !== 'unclassified';

      // REGLA PARA CONCILIACIONES NEGATIVAS NO PRINCIPALES (Item 9)
      // Si el banco reporta MENOS deuda que la app en un concepto no capital (intereses, cuotas, seguros):
      // Si existen conciliaciones previas pendientes en esa categoría, compensar/reducir la deuda previa.
      // Si no existen conciliaciones pendientes suficientes, marcar como 'pending_review' para evitar corromper la contabilidad.
      if (isNegativeNonPrincipal) {
        const absDiff = Math.abs(rec.differenceAmount);
        const pendingRecs = await db.getAllAsync<{ id: string; difference_amount: number; amount_paid: number }>(
          `SELECT id, difference_amount, amount_paid FROM card_reconciliations 
           WHERE card_id = ? AND status = 'applied' AND difference_category = ? AND difference_amount > 0 AND amount_paid < difference_amount
           ORDER BY reconciliation_date ASC, created_at ASC`,
          [rec.cardId, category]
        );

        const totalAvailableToOffset = pendingRecs.reduce((sum, r) => sum + (r.difference_amount - (r.amount_paid || 0)), 0);

        if (totalAvailableToOffset >= absDiff) {
          // Compensar reduciendo las conciliaciones pendientes existentes
          let remainingToOffset = absDiff;
          for (const r of pendingRecs) {
            if (remainingToOffset <= 0) break;
            const unpaid = +(r.difference_amount - (r.amount_paid || 0)).toFixed(2);
            const toOffset = Math.min(remainingToOffset, unpaid);
            await db.runAsync(
              'UPDATE card_reconciliations SET amount_paid = amount_paid + ? WHERE id = ?',
              [toOffset, r.id]
            );
            remainingToOffset = +(remainingToOffset - toOffset).toFixed(2);
          }
          status = 'applied';
        } else {
          // No hay deuda previa registrada suficiente para justificar la reducción automática sin revisión
          status = 'pending_review';
        }
      }

      // 1. Si existe una diferencia y NO es unclassified ni pending_review, registrar movimiento de ajuste auditado
      if (rec.differenceAmount !== 0 && category !== 'unclassified' && status === 'applied' && !rec.adjustmentTransactionId) {
        const adjTxId = `tx-rec-adj-${rec.cardId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        rec.adjustmentTransactionId = adjTxId;

        const principalAmount = isCapital ? Math.abs(rec.differenceAmount) : 0;
        const interestAmount = !isCapital ? Math.abs(rec.differenceAmount) : 0;

        // Registrar transacción de ajuste en el libro mayor de auditoría
        await db.runAsync(
          `INSERT INTO transactions (
            id, account_id, card_id, type, amount, category_id, description, notes, date,
            to_account_id, card_purchase_id, card_installment_id, statement_id, principal_amount, interest_amount, gmf_amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            adjTxId,
            null,
            rec.cardId,
            'balance_adjustment',
            Math.abs(rec.differenceAmount),
            'cat-financial',
            `Ajuste de Conciliación (${category.toUpperCase()})`,
            rec.notes || `Diferencia de conciliación con extracto bancario ($${rec.differenceAmount}) clasificada como ${category}`,
            rec.reconciliationDate,
            null,
            null,
            null,
            rec.statementId || null,
            principalAmount,
            interestAmount,
            0,
            now,
          ]
        );

        // SOLO el ajuste de capital modifica el cupo disponible (available_limit)
        if (isCapital) {
          await db.runAsync(
            'UPDATE credit_cards SET available_limit = MAX(0, MIN(credit_limit, available_limit - ?)) WHERE id = ?',
            [rec.differenceAmount, rec.cardId]
          );
        }
      }

      // 2. Insertar registro en card_reconciliations
      await db.runAsync(
        `INSERT INTO card_reconciliations (
          id, card_id, statement_id, reconciliation_date, app_calculated_debt,
          bank_reported_debt, difference_amount, difference_category, status,
          amount_paid, adjustment_transaction_id, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rec.id,
          rec.cardId,
          rec.statementId || null,
          rec.reconciliationDate,
          rec.appCalculatedDebt,
          rec.bankReportedDebt,
          rec.differenceAmount,
          category,
          status,
          rec.amountPaid || 0,
          rec.adjustmentTransactionId || null,
          rec.notes || null,
          rec.createdAt || now,
        ]
      );
    });
  },

  /**
   * Clasifica posteriormente una conciliación que estaba como 'unclassified'
   */
  async classifyReconciliation(
    id: string,
    newCategory: 'capital' | 'interest' | 'fees' | 'taxes' | 'collection',
    notes?: string
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const rec = await db.getFirstAsync<{
      id: string;
      card_id: string;
      statement_id: string | null;
      reconciliation_date: string;
      difference_amount: number;
      difference_category: string;
      adjustment_transaction_id: string | null;
      status: string;
    }>('SELECT * FROM card_reconciliations WHERE id = ?', [id]);

    if (!rec) throw new Error('Conciliación no encontrada.');
    if (rec.difference_category !== 'unclassified') {
      throw new Error('Esta conciliación ya se encuentra clasificada.');
    }

    await db.withTransactionAsync(async () => {
      let adjTxId = rec.adjustment_transaction_id;
      const isCapital = newCategory === 'capital';
      const principalAmount = isCapital ? Math.abs(rec.difference_amount) : 0;
      const interestAmount = !isCapital ? Math.abs(rec.difference_amount) : 0;

      if (!adjTxId && rec.difference_amount !== 0) {
        adjTxId = `tx-rec-adj-${rec.card_id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        await db.runAsync(
          `INSERT INTO transactions (
            id, account_id, card_id, type, amount, category_id, description, notes, date,
            to_account_id, card_purchase_id, card_installment_id, statement_id, principal_amount, interest_amount, gmf_amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            adjTxId,
            null,
            rec.card_id,
            'balance_adjustment',
            Math.abs(rec.difference_amount),
            'cat-financial',
            `Ajuste de Conciliación (${newCategory.toUpperCase()})`,
            notes || `Clasificación posterior como ${newCategory}`,
            rec.reconciliation_date,
            null,
            null,
            null,
            rec.statement_id,
            principalAmount,
            interestAmount,
            0,
            now,
          ]
        );
      }

      if (isCapital && rec.difference_amount !== 0) {
        await db.runAsync(
          'UPDATE credit_cards SET available_limit = MAX(0, MIN(credit_limit, available_limit - ?)) WHERE id = ?',
          [rec.difference_amount, rec.card_id]
        );
      }

      await db.runAsync(
        "UPDATE card_reconciliations SET difference_category = ?, status = 'applied', adjustment_transaction_id = ? WHERE id = ?",
        [newCategory, adjTxId || null, id]
      );
    });
  },

  /**
   * Obtiene el resumen de conceptos no capitales de conciliación pendientes de pago
   */
  async getPendingNonPrincipalSummary(cardId: string): Promise<{
    interestPending: number;
    feesPending: number;
    taxesPending: number;
    collectionPending: number;
    totalPending: number;
    pendingReconciliations: CardReconciliation[];
  }> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      card_id: string;
      statement_id: string | null;
      reconciliation_date: string;
      app_calculated_debt: number;
      bank_reported_debt: number;
      difference_amount: number;
      difference_category: string;
      status: string;
      amount_paid: number;
      adjustment_transaction_id: string | null;
      notes: string | null;
      created_at: string;
    }>(
      `SELECT * FROM card_reconciliations 
       WHERE card_id = ? 
         AND status = 'applied' 
         AND difference_category IN ('interest', 'fees', 'taxes', 'collection')
         AND difference_amount > 0
         AND (amount_paid < difference_amount)
       ORDER BY reconciliation_date ASC, created_at ASC`,
      [cardId]
    );

    let interestPending = 0;
    let feesPending = 0;
    let taxesPending = 0;
    let collectionPending = 0;

    const pendingReconciliations = rows.map((r) => {
      const remaining = Math.max(0, +(r.difference_amount - (r.amount_paid || 0)).toFixed(2));
      if (r.difference_category === 'interest') interestPending += remaining;
      else if (r.difference_category === 'fees') feesPending += remaining;
      else if (r.difference_category === 'taxes') taxesPending += remaining;
      else if (r.difference_category === 'collection') collectionPending += remaining;

      return {
        id: r.id,
        cardId: r.card_id,
        statementId: r.statement_id || undefined,
        reconciliationDate: r.reconciliation_date,
        appCalculatedDebt: r.app_calculated_debt,
        bankReportedDebt: r.bank_reported_debt,
        differenceAmount: r.difference_amount,
        differenceCategory: r.difference_category as any,
        status: r.status as any,
        amountPaid: r.amount_paid || 0,
        adjustmentTransactionId: r.adjustment_transaction_id || undefined,
        notes: r.notes || undefined,
        createdAt: r.created_at,
      };
    });

    interestPending = +interestPending.toFixed(2);
    feesPending = +feesPending.toFixed(2);
    taxesPending = +taxesPending.toFixed(2);
    collectionPending = +collectionPending.toFixed(2);
    const totalPending = +(interestPending + feesPending + taxesPending + collectionPending).toFixed(2);

    return {
      interestPending,
      feesPending,
      taxesPending,
      collectionPending,
      totalPending,
      pendingReconciliations,
    };
  },

  /**
   * Aplica un pago hacia las conciliaciones pendientes no capitales registrando
   * la relación exacta en card_payment_reconciliation_allocations
   */
  async applyPaymentToReconciliations(
    cardId: string,
    paymentAllocationId: string,
    applied: { interest?: number; fees?: number; taxes?: number; collection?: number }
  ): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const categories: Array<'interest' | 'fees' | 'taxes' | 'collection'> = ['collection', 'interest', 'fees', 'taxes'];

    for (const cat of categories) {
      let remainingToApply = applied[cat] || 0;
      if (remainingToApply <= 0) continue;

      const recs = await db.getAllAsync<{ id: string; difference_amount: number; amount_paid: number }>(
        `SELECT id, difference_amount, amount_paid FROM card_reconciliations 
         WHERE card_id = ? AND status = 'applied' AND difference_category = ? AND difference_amount > 0 AND (amount_paid < difference_amount)
         ORDER BY reconciliation_date ASC, created_at ASC`,
        [cardId, cat]
      );

      for (const r of recs) {
        if (remainingToApply <= 0) break;
        const unpaid = +(r.difference_amount - (r.amount_paid || 0)).toFixed(2);
        const toPay = Math.min(remainingToApply, unpaid);

        // 1. Guardar relación exacta en card_payment_reconciliation_allocations
        const relId = `cpr-alloc-${paymentAllocationId}-${r.id}-${Math.random().toString(36).substring(2, 7)}`;
        await db.runAsync(
          `INSERT INTO card_payment_reconciliation_allocations (
            id, payment_allocation_id, reconciliation_id, category, amount_applied, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [relId, paymentAllocationId, r.id, cat, toPay, now]
        );

        // 2. Actualizar monto pagado acumulado en la conciliación
        await db.runAsync(
          'UPDATE card_reconciliations SET amount_paid = amount_paid + ? WHERE id = ?',
          [toPay, r.id]
        );

        remainingToApply = +(remainingToApply - toPay).toFixed(2);
      }
    }
  },

  /**
   * Revierte exactamente las conciliaciones que fueron pagadas por una Payment Allocation específica
   * consultando la tabla card_payment_reconciliation_allocations
   */
  async revertPaymentForAllocation(paymentAllocationId: string): Promise<void> {
    const db = await getDatabase();
    const allocations = await db.getAllAsync<{
      id: string;
      reconciliation_id: string;
      category: string;
      amount_applied: number;
    }>(
      'SELECT id, reconciliation_id, category, amount_applied FROM card_payment_reconciliation_allocations WHERE payment_allocation_id = ?',
      [paymentAllocationId]
    );

    for (const alloc of allocations) {
      await db.runAsync(
        'UPDATE card_reconciliations SET amount_paid = MAX(0, amount_paid - ?) WHERE id = ?',
        [alloc.amount_applied, alloc.reconciliation_id]
      );
    }

    await db.runAsync(
      'DELETE FROM card_payment_reconciliation_allocations WHERE payment_allocation_id = ?',
      [paymentAllocationId]
    );
  },

  /**
   * Helper de compatibilidad para reversión general
   */
  async revertPaymentFromReconciliations(
    cardId: string,
    reverted: { interest?: number; fees?: number; taxes?: number; collection?: number }
  ): Promise<void> {
    const db = await getDatabase();
    const categories: Array<'interest' | 'fees' | 'taxes' | 'collection'> = ['taxes', 'fees', 'interest', 'collection'];

    for (const cat of categories) {
      let remainingToRevert = reverted[cat] || 0;
      if (remainingToRevert <= 0) continue;

      const recs = await db.getAllAsync<{ id: string; difference_amount: number; amount_paid: number }>(
        `SELECT id, difference_amount, amount_paid FROM card_reconciliations 
         WHERE card_id = ? AND status = 'applied' AND difference_category = ? AND amount_paid > 0
         ORDER BY reconciliation_date DESC, created_at DESC`,
        [cardId, cat]
      );

      for (const r of recs) {
        if (remainingToRevert <= 0) break;
        const toRevert = Math.min(remainingToRevert, r.amount_paid);
        await db.runAsync(
          'UPDATE card_reconciliations SET amount_paid = MAX(0, amount_paid - ?) WHERE id = ?',
          [toRevert, r.id]
        );
        remainingToRevert -= toRevert;
      }
    }
  },

  /**
   * Obtiene el historial de conciliaciones de una tarjeta
   */
  async getReconciliationsForCard(cardId: string): Promise<CardReconciliation[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      card_id: string;
      statement_id: string | null;
      reconciliation_date: string;
      app_calculated_debt: number;
      bank_reported_debt: number;
      difference_amount: number;
      difference_category: string;
      status: string;
      amount_paid: number;
      adjustment_transaction_id: string | null;
      notes: string | null;
      created_at: string;
    }>(
      'SELECT * FROM card_reconciliations WHERE card_id = ? ORDER BY reconciliation_date DESC',
      [cardId]
    );

    return rows.map((r) => ({
      id: r.id,
      cardId: r.card_id,
      statementId: r.statement_id || undefined,
      reconciliationDate: r.reconciliation_date,
      appCalculatedDebt: r.app_calculated_debt,
      bankReportedDebt: r.bank_reported_debt,
      differenceAmount: r.difference_amount,
      differenceCategory: r.difference_category as any,
      status: r.status as any,
      amountPaid: r.amount_paid || 0,
      adjustmentTransactionId: r.adjustment_transaction_id || undefined,
      notes: r.notes || undefined,
      createdAt: r.created_at,
    }));
  },
};
