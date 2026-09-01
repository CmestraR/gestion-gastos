import { getDatabase } from '../database.ts';
import type { Transaction } from '../../types/finance.ts';
import { AccountRepository } from './accountRepository.ts';
import { ReconciliationRepository } from './reconciliationRepository.ts';

export interface TransactionFilter {
  monthYear?: string; // 'YYYY-MM'
  accountId?: string;
  cardId?: string;
  categoryId?: string;
  type?: Transaction['type'];
}

export const TransactionRepository = {
  async getAll(filter?: TransactionFilter): Promise<Transaction[]> {
    const db = await getDatabase();
    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params: (string | number)[] = [];

    if (filter?.monthYear) {
      query += ' AND date LIKE ?';
      params.push(`${filter.monthYear}%`);
    }

    if (filter?.accountId) {
      query += ' AND (account_id = ? OR to_account_id = ?)';
      params.push(filter.accountId, filter.accountId);
    }

    if (filter?.cardId) {
      query += ' AND card_id = ?';
      params.push(filter.cardId);
    }

    if (filter?.categoryId) {
      query += ' AND category_id = ?';
      params.push(filter.categoryId);
    }

    if (filter?.type) {
      query += ' AND type = ?';
      params.push(filter.type);
    }

    query += ' ORDER BY date DESC, created_at DESC';

    const rows = await db.getAllAsync<{
      id: string;
      account_id: string | null;
      card_id: string | null;
      type: string;
      amount: number;
      category_id: string;
      description: string;
      notes: string | null;
      date: string;
      to_account_id: string | null;
      card_purchase_id: string | null;
      card_installment_id: string | null;
      principal_amount?: number;
      interest_amount?: number;
      gmf_amount?: number;
      created_at: string;
    }>(query, params);

    return rows.map((r) => ({
      id: r.id,
      accountId: r.account_id || undefined,
      cardId: r.card_id || undefined,
      type: r.type as Transaction['type'],
      amount: r.amount,
      categoryId: r.category_id,
      description: r.description,
      notes: r.notes || undefined,
      date: r.date,
      toAccountId: r.to_account_id || undefined,
      cardPurchaseId: r.card_purchase_id || undefined,
      cardInstallmentId: r.card_installment_id || undefined,
      principalAmount: r.principal_amount || undefined,
      interestAmount: r.interest_amount || undefined,
      gmfAmount: r.gmf_amount || undefined,
      createdAt: r.created_at,
    }));
  },

  async create(tx: Transaction): Promise<void> {
    if (!tx.amount || tx.amount <= 0) {
      throw new Error('El monto de la transacción debe ser mayor a cero.');
    }

    if (tx.type === 'transfer' && (!tx.accountId || !tx.toAccountId || tx.accountId === tx.toAccountId)) {
      throw new Error('La cuenta de origen y destino de una transferencia deben ser diferentes.');
    }

    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      const gmf = tx.gmfAmount || 0;

      // 1. Validaciones financieras y de estado previas a cualquier mutación
      if (tx.type === 'card_payment' && tx.cardId && !tx.cardPurchaseId && !tx.cardInstallmentId) {
        const card = await db.getFirstAsync<{
          credit_limit: number;
          available_limit: number;
          is_archived: number;
        }>('SELECT credit_limit, available_limit, is_archived FROM credit_cards WHERE id = ?', [tx.cardId]);

        if (!card || card.is_archived === 1) {
          throw new Error('La tarjeta de crédito no existe o está archivada.');
        }

        const currentDebt = Math.max(0, +(card.credit_limit - card.available_limit).toFixed(2));
        if (tx.amount > currentDebt) {
          throw new Error(`El monto del abono ($${tx.amount}) no puede ser superior a la deuda actual de la tarjeta ($${currentDebt}).`);
        }
      }

      // 2. Insertar registro en tabla transactions
      await db.runAsync(
        `INSERT INTO transactions (
          id, account_id, card_id, type, amount, category_id, description, notes, date,
          to_account_id, card_purchase_id, card_installment_id, principal_amount, interest_amount, gmf_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tx.id,
          tx.accountId || null,
          tx.cardId || null,
          tx.type,
          tx.amount,
          tx.categoryId,
          tx.description,
          tx.notes || null,
          tx.date,
          tx.toAccountId || null,
          tx.cardPurchaseId || null,
          tx.cardInstallmentId || null,
          tx.principalAmount || 0,
          tx.interestAmount || 0,
          tx.gmfAmount || 0,
          tx.createdAt,
        ]
      );

      // 3. Actualizar saldos de cuentas y límites de tarjetas de manera atómica (ÚNICA FUENTE DE VERDAD)
      if (tx.type === 'expense' && tx.accountId) {
        await AccountRepository.updateBalance(tx.accountId, -(tx.amount + gmf));
      } else if (tx.type === 'income' && tx.accountId) {
        await AccountRepository.updateBalance(tx.accountId, tx.amount);
      } else if (tx.type === 'transfer' && tx.accountId && tx.toAccountId) {
        await AccountRepository.updateBalance(tx.accountId, -(tx.amount + gmf));
        await AccountRepository.updateBalance(tx.toAccountId, tx.amount);
      } else if (tx.type === 'card_payment') {
        if (tx.accountId) {
          await AccountRepository.updateBalance(tx.accountId, -tx.amount);
        }
        if (tx.cardId && !tx.cardPurchaseId && !tx.cardInstallmentId) {
          // Abono general a tarjeta: libera cupo por el valor abonado
          const cardRes = await db.runAsync(
            'UPDATE credit_cards SET available_limit = MIN(credit_limit, available_limit + ?) WHERE id = ?',
            [tx.amount, tx.cardId]
          );
          if (cardRes.changes === 0) {
            throw new Error('No se pudo actualizar el cupo de la tarjeta de crédito.');
          }
        }
      }
    });
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      const tx = await db.getFirstAsync<{
        id: string;
        account_id: string | null;
        card_id: string | null;
        type: string;
        amount: number;
        to_account_id: string | null;
        card_purchase_id: string | null;
        card_installment_id: string | null;
        statement_id?: string | null;
        principal_amount?: number;
        interest_amount?: number;
        gmf_amount?: number;
        date: string;
        created_at: string;
      }>('SELECT id, account_id, card_id, type, amount, to_account_id, card_purchase_id, card_installment_id, statement_id, principal_amount, interest_amount, gmf_amount, date, created_at FROM transactions WHERE id = ?', [id]);

      if (!tx) return;

      // 1. Prohibir eliminación directa de ajustes de conciliación
      if (tx.type === 'balance_adjustment') {
        throw new Error('Los ajustes de conciliación deben corregirse desde el módulo de Conciliación.');
      }

      const gmf = tx.gmf_amount || 0;

      // Reversión universal y simétrica según el tipo de movimiento
      if (tx.type === 'expense' && tx.account_id) {
        // Reintegrar dinero gastado + impuesto GMF
        await AccountRepository.updateBalance(tx.account_id, tx.amount + gmf);
      } else if (tx.type === 'income' && tx.account_id) {
        // Deducir ingreso revertido
        await AccountRepository.updateBalance(tx.account_id, -tx.amount);
      } else if (tx.type === 'transfer' && tx.account_id && tx.to_account_id) {
        // Devolver a origen (monto + GMF) y restar de destino
        await AccountRepository.updateBalance(tx.account_id, tx.amount + gmf);
        await AccountRepository.updateBalance(tx.to_account_id, -tx.amount);
      } else if (tx.type === 'card_payment') {
        // 1. Reintegrar el dinero total pagado a la cuenta bancaria de origen
        if (tx.account_id) {
          await AccountRepository.updateBalance(tx.account_id, tx.amount);
        }

        // 2. Reversión determinista en la tarjeta de crédito
        if (tx.card_installment_id) {
          // Si era pago de una cuota específica: revertir cuota, compra y cupo por el capital exacto
          const principal = tx.principal_amount || tx.amount;

          // Marcar cuota como pendiente
          await db.runAsync(
            'UPDATE card_installments SET is_paid = 0, paid_date = NULL WHERE id = ?',
            [tx.card_installment_id]
          );

          // Decrementar cuotas pagadas en la compra y reactivarla
          if (tx.card_purchase_id) {
            await db.runAsync(
              `UPDATE card_purchases 
               SET installments_paid = MAX(0, installments_paid - 1),
                   status = 'active'
               WHERE id = ?`,
              [tx.card_purchase_id]
            );
          }

          // Re-consumir el cupo por el valor del CAPITAL exacto (no incluir intereses)
          if (tx.card_id) {
            await db.runAsync(
              'UPDATE credit_cards SET available_limit = MAX(0, available_limit - ?) WHERE id = ?',
              [principal, tx.card_id]
            );
          }
        } else if (tx.card_id) {
          // Consultar si tiene asignación de pago registrada
          const alloc = await db.getFirstAsync<{
            id: string;
            principal_applied: number;
            statement_applied: number;
            minimum_applied: number;
            statement_id: string | null;
            collection_fee_applied: number;
            late_interest_applied: number;
            current_interest_applied: number;
            handling_fee_applied: number;
            taxes_and_fees_applied: number;
          }>('SELECT * FROM card_payment_allocations WHERE transaction_id = ?', [tx.id]);

          const principalToReconsume = alloc ? alloc.principal_applied : (tx.principal_amount || tx.amount);

          // Re-consumir el cupo disponible ÚNICAMENTE por la fracción de capital aplicada
          await db.runAsync(
            'UPDATE credit_cards SET available_limit = MAX(0, available_limit - ?) WHERE id = ?',
            [principalToReconsume, tx.card_id]
          );

          // Si estaba vinculado a un extracto, revertir el acumulado pagado usando statement_applied y minimum_applied
          const targetStatementId = alloc?.statement_id || tx.statement_id;
          if (targetStatementId) {
            const stmt = await db.getFirstAsync<{
              total_statement_balance: number;
              due_date: string;
              minimum_payment_original: number;
              statement_balance_paid: number;
              minimum_payment_paid: number;
            }>('SELECT total_statement_balance, due_date, minimum_payment_original, statement_balance_paid, minimum_payment_paid FROM card_statements WHERE id = ?', [targetStatementId]);

            if (stmt) {
              const statementDeltaToReverse = alloc ? alloc.statement_applied : Math.min(stmt.total_statement_balance, tx.amount);
              const minimumDeltaToReverse = alloc ? alloc.minimum_applied : Math.min(stmt.minimum_payment_original, tx.amount);

              const newPaid = Math.max(0, +(stmt.statement_balance_paid - statementDeltaToReverse).toFixed(2));
              const newMinPaid = Math.max(0, +(stmt.minimum_payment_paid - minimumDeltaToReverse).toFixed(2));
              
              let newStatus = 'open';
              if (newPaid >= stmt.total_statement_balance) newStatus = 'paid';
              else if (newMinPaid >= stmt.minimum_payment_original) newStatus = 'minimum_covered';
              else if (newPaid > 0) newStatus = 'partially_paid';

              const today = new Date().toISOString().split('T')[0];
              if (today > stmt.due_date && newStatus !== 'paid' && newStatus !== 'minimum_covered') {
                newStatus = 'overdue';
              }

              await db.runAsync(
                'UPDATE card_statements SET statement_balance_paid = ?, minimum_payment_paid = ?, status = ? WHERE id = ?',
                [newPaid, newMinPaid, newStatus, targetStatementId]
              );
            }
          }

          // Revertir amortizaciones de conciliaciones bancarias consultando la relación exacta en card_payment_reconciliation_allocations
          if (alloc) {
            await ReconciliationRepository.revertPaymentForAllocation(alloc.id);
          }

          // Eliminar fila en asignaciones
          await db.runAsync('DELETE FROM card_payment_allocations WHERE transaction_id = ?', [tx.id]);
        }
      } else if (tx.type === 'card_opening_balance') {
        if (tx.card_id) {
          // Bloquear eliminación si existen transacciones o pagos posteriores que dependan del opening balance
          const subsequent = await db.getFirstAsync<{ count: number }>(
            `SELECT count(*) as count FROM transactions 
             WHERE card_id = ? AND id != ? AND (date > ? OR (date = ? AND created_at > ?))`,
            [tx.card_id, tx.id, tx.date, tx.date, tx.created_at]
          );

          if (subsequent && subsequent.count > 0) {
            throw new Error('No es posible eliminar el Saldo de Apertura porque existen movimientos o pagos posteriores que dependen de él.');
          }

          // Revertir cupo consumido por el saldo de apertura
          const principalToRestore = tx.principal_amount || tx.amount;
          await db.runAsync(
            'UPDATE credit_cards SET available_limit = MIN(credit_limit, available_limit + ?) WHERE id = ?',
            [principalToRestore, tx.card_id]
          );

          if (tx.statement_id) {
            await db.runAsync('DELETE FROM card_statements WHERE id = ?', [tx.statement_id]);
          }
        }
      } else if (tx.type === 'card_purchase') {
        // Si se intenta eliminar una compra con tarjeta
        const purchaseId = tx.card_purchase_id;
        if (purchaseId) {
          const purchase = await db.getFirstAsync<{
            installments_paid: number;
          }>('SELECT installments_paid FROM card_purchases WHERE id = ?', [purchaseId]);

          if (purchase && purchase.installments_paid > 0) {
            throw new Error('Esta compra tiene cuotas pagadas y movimientos relacionados. No puede eliminarse directamente.');
          }

          await db.runAsync('DELETE FROM card_installments WHERE purchase_id = ?', [purchaseId]);
          await db.runAsync('DELETE FROM card_purchases WHERE id = ?', [purchaseId]);
        }
        if (tx.card_id) {
          await db.runAsync(
            'UPDATE credit_cards SET available_limit = MIN(credit_limit, available_limit + ?) WHERE id = ?',
            [tx.amount, tx.card_id]
          );
        }
      }

      await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
    });
  },

  async update(id: string, updatedTx: Transaction): Promise<void> {
    if (!updatedTx.amount || updatedTx.amount <= 0) {
      throw new Error('El monto de la transacción debe ser mayor a cero.');
    }

    if (updatedTx.type === 'transfer' && (!updatedTx.accountId || !updatedTx.toAccountId || updatedTx.accountId === updatedTx.toAccountId)) {
      throw new Error('La cuenta de origen y destino de una transferencia deben ser diferentes.');
    }

    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      // 1. Consultar estado anterior
      const oldTx = await db.getFirstAsync<{
        id: string;
        account_id: string | null;
        card_id: string | null;
        type: string;
        amount: number;
        to_account_id: string | null;
        card_purchase_id: string | null;
        card_installment_id: string | null;
        statement_id?: string | null;
        principal_amount?: number;
        interest_amount?: number;
        gmf_amount?: number;
      }>('SELECT id, account_id, card_id, type, amount, to_account_id, card_purchase_id, card_installment_id, statement_id, principal_amount, interest_amount, gmf_amount FROM transactions WHERE id = ?', [id]);

      if (!oldTx) return;

      // 2. BLOQUEO ESTRUCTURAL DE EDICIÓN PARA card_payment
      if (oldTx.type === 'card_payment') {
        const hasStructuralChanges =
          oldTx.amount !== updatedTx.amount ||
          (oldTx.account_id || null) !== (updatedTx.accountId || null) ||
          (oldTx.card_id || null) !== (updatedTx.cardId || null) ||
          (oldTx.statement_id || null) !== (updatedTx.statementId || null) ||
          (oldTx.principal_amount || 0) !== (updatedTx.principalAmount || 0) ||
          (oldTx.interest_amount || 0) !== (updatedTx.interestAmount || 0) ||
          oldTx.type !== updatedTx.type;

        if (hasStructuralChanges) {
          throw new Error('Los pagos de tarjeta no pueden modificarse directamente. Revierte el pago y regístralo nuevamente.');
        }

        // Permitir actualizar únicamente notas y descripción sin alterar contabilidad
        await db.runAsync(
          'UPDATE transactions SET description = ?, notes = ? WHERE id = ?',
          [updatedTx.description, updatedTx.notes || null, id]
        );
        return;
      }

      // 3. BLOQUEO ESTRUCTURAL DE EDICIÓN PARA balance_adjustment
      if (oldTx.type === 'balance_adjustment') {
        const hasStructuralChanges =
          oldTx.amount !== updatedTx.amount ||
          (oldTx.card_id || null) !== (updatedTx.cardId || null) ||
          oldTx.type !== updatedTx.type;

        if (hasStructuralChanges) {
          throw new Error('Los ajustes de conciliación deben corregirse desde el módulo de Conciliación.');
        }

        await db.runAsync(
          'UPDATE transactions SET description = ?, notes = ? WHERE id = ?',
          [updatedTx.description, updatedTx.notes || null, id]
        );
        return;
      }

      // REGLA DE INTEGRIDAD: Si es un pago vinculado a cuota, no permitir cambios de montos/cuentas estructurales
      if (oldTx.card_installment_id && (oldTx.amount !== updatedTx.amount || oldTx.account_id !== updatedTx.accountId || oldTx.card_id !== updatedTx.cardId)) {
        throw new Error('No es posible modificar montos o cuentas de un pago vinculado a una cuota. Debe revertir el pago e ingresar uno nuevo.');
      }

      const oldGmf = oldTx.gmf_amount || 0;

      // 1. Revertir efectos del movimiento anterior
      if (oldTx.type === 'expense' && oldTx.account_id) {
        await AccountRepository.updateBalance(oldTx.account_id, oldTx.amount + oldGmf);
      } else if (oldTx.type === 'income' && oldTx.account_id) {
        await AccountRepository.updateBalance(oldTx.account_id, -oldTx.amount);
      } else if (oldTx.type === 'transfer' && oldTx.account_id && oldTx.to_account_id) {
        await AccountRepository.updateBalance(oldTx.account_id, oldTx.amount + oldGmf);
        await AccountRepository.updateBalance(oldTx.to_account_id, -oldTx.amount);
      }

      // 2. Aplicar efectos del movimiento actualizado
      const newGmf = updatedTx.gmfAmount || 0;
      if (updatedTx.type === 'expense' && updatedTx.accountId) {
        await AccountRepository.updateBalance(updatedTx.accountId, -(updatedTx.amount + newGmf));
      } else if (updatedTx.type === 'income' && updatedTx.accountId) {
        await AccountRepository.updateBalance(updatedTx.accountId, updatedTx.amount);
      } else if (updatedTx.type === 'transfer' && updatedTx.accountId && updatedTx.toAccountId) {
        await AccountRepository.updateBalance(updatedTx.accountId, -(updatedTx.amount + newGmf));
        await AccountRepository.updateBalance(updatedTx.toAccountId, updatedTx.amount);
      }

      // 3. Actualizar registro en base de datos
      await db.runAsync(
        `UPDATE transactions SET
          account_id = ?, card_id = ?, type = ?, amount = ?, category_id = ?,
          description = ?, notes = ?, date = ?, to_account_id = ?, card_purchase_id = ?,
          card_installment_id = ?, principal_amount = ?, interest_amount = ?, gmf_amount = ?
         WHERE id = ?`,
        [
          updatedTx.accountId || null,
          updatedTx.cardId || null,
          updatedTx.type,
          updatedTx.amount,
          updatedTx.categoryId,
          updatedTx.description,
          updatedTx.notes || null,
          updatedTx.date,
          updatedTx.toAccountId || null,
          updatedTx.cardPurchaseId || null,
          updatedTx.cardInstallmentId || null,
          updatedTx.principalAmount || 0,
          updatedTx.interestAmount || 0,
          newGmf,
          id,
        ]
      );
    });
  },

  async getMonthlyStats(monthYear: string): Promise<{ totalIncome: number; totalExpense: number }> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ type: string; total: number; total_gmf: number }>(
      `SELECT type, SUM(amount) as total, SUM(COALESCE(gmf_amount, 0)) as total_gmf 
       FROM transactions 
       WHERE date LIKE ? AND type IN ('income', 'expense', 'card_purchase')
       GROUP BY type`,
      [`${monthYear}%`]
    );

    let totalIncome = 0;
    let totalExpense = 0;

    for (const r of rows) {
      if (r.type === 'income') {
        totalIncome += r.total;
      }
      if (r.type === 'expense' || r.type === 'card_purchase') {
        totalExpense += (r.total + (r.total_gmf || 0));
      }
    }

    return { totalIncome, totalExpense };
  },
};
