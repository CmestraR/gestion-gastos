import { getDatabase } from '../database';
import { Transaction } from '../../types/finance';
import { AccountRepository } from './accountRepository';

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
      gmfAmount: r.gmf_amount || undefined,
      createdAt: r.created_at,
    }));
  },

  async create(tx: Transaction): Promise<void> {
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO transactions (
          id, account_id, card_id, type, amount, category_id, description, notes, date, to_account_id, card_purchase_id, gmf_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          tx.gmfAmount || 0,
          tx.createdAt,
        ]
      );

      const gmf = tx.gmfAmount || 0;

      // Actualizar saldos de cuentas y límites de tarjetas de manera atómica (ÚNICA FUENTE DE VERDAD)
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
        if (tx.cardId && !tx.cardPurchaseId) {
          await db.runAsync(
            'UPDATE credit_cards SET available_limit = MIN(credit_limit, available_limit + ?) WHERE id = ?',
            [tx.amount, tx.cardId]
          );
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
        gmf_amount?: number;
      }>('SELECT id, account_id, card_id, type, amount, to_account_id, card_purchase_id, gmf_amount FROM transactions WHERE id = ?', [id]);

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
        // Reintegrar dinero a la cuenta bancaria origen
        if (tx.account_id) {
          await AccountRepository.updateBalance(tx.account_id, tx.amount);
        }
        // Restablecer la deuda en la tarjeta de crédito (disminuir cupo disponible)
        if (tx.card_id) {
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
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      // 1. Revertir efectos del movimiento anterior
      const oldTx = await db.getFirstAsync<{
        id: string;
        account_id: string | null;
        card_id: string | null;
        type: string;
        amount: number;
        to_account_id: string | null;
        gmf_amount?: number;
      }>('SELECT id, account_id, card_id, type, amount, to_account_id, gmf_amount FROM transactions WHERE id = ?', [id]);

      if (oldTx) {
        const oldGmf = oldTx.gmf_amount || 0;
        if (oldTx.type === 'expense' && oldTx.account_id) {
          await AccountRepository.updateBalance(oldTx.account_id, oldTx.amount + oldGmf);
        } else if (oldTx.type === 'income' && oldTx.account_id) {
          await AccountRepository.updateBalance(oldTx.account_id, -oldTx.amount);
        } else if (oldTx.type === 'transfer' && oldTx.account_id && oldTx.to_account_id) {
          await AccountRepository.updateBalance(oldTx.account_id, oldTx.amount + oldGmf);
          await AccountRepository.updateBalance(oldTx.to_account_id, -oldTx.amount);
        } else if (oldTx.type === 'card_payment' && oldTx.account_id) {
          await AccountRepository.updateBalance(oldTx.account_id, oldTx.amount);
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
      } else if (updatedTx.type === 'card_payment' && updatedTx.accountId) {
        await AccountRepository.updateBalance(updatedTx.accountId, -updatedTx.amount);
      }

      // 3. Actualizar registro en base de datos
      await db.runAsync(
        `UPDATE transactions SET
          account_id = ?, card_id = ?, type = ?, amount = ?, category_id = ?,
          description = ?, notes = ?, date = ?, to_account_id = ?, card_purchase_id = ?, gmf_amount = ?
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
