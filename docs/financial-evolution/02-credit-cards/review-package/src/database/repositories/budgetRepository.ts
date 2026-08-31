import { getDatabase } from '../database';
import { Budget } from '../../types/finance';

export const BudgetRepository = {
  async getForMonth(monthYear: string): Promise<Budget[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      category_id: string;
      monthly_limit: number;
      month_year: string;
      created_at: string;
    }>('SELECT * FROM budgets WHERE month_year = ?', [monthYear]);

    return rows.map((r) => ({
      id: r.id,
      categoryId: r.category_id,
      monthlyLimit: r.monthly_limit,
      monthYear: r.month_year,
      createdAt: r.created_at,
    }));
  },

  async setBudget(budget: Budget): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO budgets (id, category_id, monthly_limit, month_year, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET monthly_limit = excluded.monthly_limit`,
      [budget.id, budget.categoryId, budget.monthlyLimit, budget.monthYear, budget.createdAt]
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM budgets WHERE id = ?', [id]);
  },
};
