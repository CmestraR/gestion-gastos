import { getDatabase } from '../database.ts';
import type { Transaction } from '../../types/finance.ts';
import { AccountRepository } from './accountRepository.ts';

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
        principal_amount?: number;
        interest_amount?: number;
        gmf_amount?: number;
      }>('SELECT id, account_id, card_id, type, amount, to_account_id, card_purchase_id, card_installment_id, principal_amount, interest_amount, gmf_amount FROM transactions WHERE id = ?', [id]);

      if (!tx) return;

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
          // Si era un abono general no vinculado a cuota: re-consumir cupo por el monto abonado
          await db.runAsync(
            'UPDATE credit_cards SET available_limit = MAX(0, available_limit - ?) WHERE id = ?',
            [tx.amount, tx.card_id]
          );
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
        principal_amount?: number;
        interest_amount?: number;
        gmf_amount?: number;
      }>('SELECT id, account_id, card_id, type, amount, to_account_id, card_purchase_id, card_installment_id, principal_amount, interest_amount, gmf_amount FROM transactions WHERE id = ?', [id]);

      if (!oldTx) return;

      // REGLA DE INTEGRIDAD: Si es un pago vinculado a cuota, no permitir cambios de montos/cuentas estructurales
      if (oldTx.card_installment_id && (oldTx.amount !== updatedTx.amount || oldTx.account_id !== updatedTx.accountId || oldTx.card_id !== updatedTx.cardId)) {
        throw new Error('No es posible modificar montos o cuentas de un pago vinculado a una cuota. Debe revertir el pago e ingresar uno nuevo.');
      }

      // Validar límite de deuda en tarjeta para abono general
      if (updatedTx.type === 'card_payment' && updatedTx.cardId && !updatedTx.cardInstallmentId) {
        const card = await db.getFirstAsync<{ credit_limit: number; available_limit: number; is_archived: number }>(
          'SELECT credit_limit, available_limit, is_archived FROM credit_cards WHERE id = ?',
          [updatedTx.cardId]
        );
        if (!card || card.is_archived === 1) {
          throw new Error('La tarjeta de crédito no existe o está archivada.');
        }

        // Deuda considerando la reversión del pago anterior si era sobre la misma tarjeta
        const prevPaymentOnSameCard = (oldTx.card_id === updatedTx.cardId && oldTx.type === 'card_payment') ? oldTx.amount : 0;
        const currentDebtWithReversal = Math.max(0, +(card.credit_limit - (card.available_limit - prevPaymentOnSameCard)).toFixed(2));
        if (updatedTx.amount > currentDebtWithReversal) {
          throw new Error(`El monto del abono ($${updatedTx.amount}) no puede ser superior a la deuda actual de la tarjeta ($${currentDebtWithReversal}).`);
        }
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
      } else if (oldTx.type === 'card_payment') {
        if (oldTx.account_id) {
          await AccountRepository.updateBalance(oldTx.account_id, oldTx.amount);
        }
        if (oldTx.card_id && !oldTx.card_installment_id) {
          // Revertir cupo liberado anteriormente en tarjeta
          await db.runAsync(
            'UPDATE credit_cards SET available_limit = MAX(0, available_limit - ?) WHERE id = ?',
            [oldTx.amount, oldTx.card_id]
          );
        }
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
      } else if (updatedTx.type === 'card_payment') {
        if (updatedTx.accountId) {
          await AccountRepository.updateBalance(updatedTx.accountId, -updatedTx.amount);
        }
        if (updatedTx.cardId && !updatedTx.cardInstallmentId) {
          // Aplicar nuevo cupo en tarjeta de forma simétrica
          const cardRes = await db.runAsync(
            'UPDATE credit_cards SET available_limit = MIN(credit_limit, available_limit + ?) WHERE id = ?',
            [updatedTx.amount, updatedTx.cardId]
          );
          if (cardRes.changes === 0) {
            throw new Error('No se pudo actualizar el cupo de la tarjeta de crédito.');
          }
        }
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
          updatedTx.gmfAmount || 0,
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
