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
    const status = category === 'unclassified' && rec.differenceAmount !== 0 ? 'pending_review' : (rec.status || 'applied');

    await db.withTransactionAsync(async () => {
      // 1. Si existe una diferencia y NO es unclassified, registrar movimiento de ajuste
      if (rec.differenceAmount !== 0 && category !== 'unclassified' && !rec.adjustmentTransactionId) {
        const adjTxId = `tx-rec-adj-${rec.cardId}-${Date.now()}`;
        rec.adjustmentTransactionId = adjTxId;

        const isCapital = category === 'capital';
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
          adjustment_transaction_id, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        adjTxId = `tx-rec-adj-${rec.card_id}-${Date.now()}`;
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
      adjustmentTransactionId: r.adjustment_transaction_id || undefined,
      notes: r.notes || undefined,
      createdAt: r.created_at,
    }));
  },
};
