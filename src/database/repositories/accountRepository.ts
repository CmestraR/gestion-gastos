import { getDatabase } from '../database';
import { Account } from '../../types/finance';

export const AccountRepository = {
  async getAll(): Promise<Account[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      type: string;
      bank_name: string;
      balance: number;
      initial_balance: number;
      currency: string;
      color: string;
      icon: string;
      include_in_total?: number;
      has_gmf_4x1000?: number;
      is_archived: number;
      created_at: string;
    }>('SELECT * FROM accounts WHERE is_archived = 0 ORDER BY created_at ASC');

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type as Account['type'],
      bankName: r.bank_name,
      balance: r.balance,
      initialBalance: r.initial_balance,
      currency: r.currency,
      color: r.color,
      icon: r.icon,
      includeInTotal: r.include_in_total !== 0,
      hasGmf4x1000: r.has_gmf_4x1000 === 1,
      isArchived: r.is_archived === 1,
      createdAt: r.created_at,
    }));
  },

  async create(account: Account): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO accounts (id, name, type, bank_name, balance, initial_balance, currency, color, icon, include_in_total, has_gmf_4x1000, is_archived, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        account.id,
        account.name,
        account.type,
        account.bankName,
        account.balance,
        account.initialBalance,
        account.currency,
        account.color,
        account.icon,
        account.includeInTotal !== false ? 1 : 0,
        account.hasGmf4x1000 ? 1 : 0,
        account.isArchived ? 1 : 0,
        account.createdAt,
      ]
    );
  },

  async update(account: Account): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE accounts 
       SET name = ?, type = ?, bank_name = ?, balance = ?, currency = ?, color = ?, icon = ?, include_in_total = ?, has_gmf_4x1000 = ?
       WHERE id = ?`,
      [
        account.name,
        account.type,
        account.bankName,
        account.balance,
        account.currency,
        account.color,
        account.icon,
        account.includeInTotal !== false ? 1 : 0,
        account.hasGmf4x1000 ? 1 : 0,
        account.id,
      ]
    );
  },

  async updateBalance(id: string, delta: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE accounts SET balance = balance + ? WHERE id = ?`,
      [delta, id]
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    await db.execAsync(`
      DELETE FROM transactions WHERE account_id = '${id}' OR to_account_id = '${id}';
      DELETE FROM accounts WHERE id = '${id}';
    `);
  },
};
