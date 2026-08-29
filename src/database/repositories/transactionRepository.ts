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

    // Actualizar saldos de cuentas si corresponde
    if (tx.type === 'expense' && tx.accountId) {
      await AccountRepository.updateBalance(tx.accountId, -(tx.amount + (tx.gmfAmount || 0)));
    } else if (tx.type === 'income' && tx.accountId) {
      await AccountRepository.updateBalance(tx.accountId, tx.amount);
    } else if (tx.type === 'transfer' && tx.accountId && tx.toAccountId) {
      await AccountRepository.updateBalance(tx.accountId, -(tx.amount + (tx.gmfAmount || 0)));
      await AccountRepository.updateBalance(tx.toAccountId, tx.amount);
    } else if (tx.type === 'card_payment' && tx.accountId) {
      await AccountRepository.updateBalance(tx.accountId, -tx.amount);
    }
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    const tx = await db.getFirstAsync<{
      id: string;
      account_id: string | null;
      type: string;
      amount: number;
      to_account_id: string | null;
      gmf_amount?: number;
    }>('SELECT id, account_id, type, amount, to_account_id, gmf_amount FROM transactions WHERE id = ?', [id]);

    if (tx) {
      const gmf = tx.gmf_amount || 0;
      // Revertir efecto en saldo
      if (tx.type === 'expense' && tx.account_id) {
        await AccountRepository.updateBalance(tx.account_id, tx.amount + gmf);
      } else if (tx.type === 'income' && tx.account_id) {
        await AccountRepository.updateBalance(tx.account_id, -tx.amount);
      } else if (tx.type === 'transfer' && tx.account_id && tx.to_account_id) {
        await AccountRepository.updateBalance(tx.account_id, tx.amount + gmf);
        await AccountRepository.updateBalance(tx.to_account_id, -tx.amount);
      }
      await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
    }
  },

  async getMonthlyStats(monthYear: string): Promise<{ totalIncome: number; totalExpense: number }> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ type: string; total: number }>(
      `SELECT type, SUM(amount) as total 
       FROM transactions 
       WHERE date LIKE ? AND type IN ('income', 'expense', 'card_purchase')
       GROUP BY type`,
      [`${monthYear}%`]
    );

    let totalIncome = 0;
    let totalExpense = 0;

    for (const r of rows) {
      if (r.type === 'income') totalIncome += r.total;
      if (r.type === 'expense' || r.type === 'card_purchase') totalExpense += r.total;
    }

    return { totalIncome, totalExpense };
  },
};
