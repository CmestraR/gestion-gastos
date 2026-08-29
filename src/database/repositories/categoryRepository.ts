import { getDatabase } from '../database';
import { Category } from '../../types/finance';

export const CategoryRepository = {
  async getAll(): Promise<Category[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      type: string;
      icon: string;
      color: string;
      keywords?: string;
      is_default: number;
    }>('SELECT * FROM categories ORDER BY is_default DESC, name ASC');

    return rows.map((r) => {
      let keywordsArr: string[] = [];
      try {
        if (r.keywords) {
          keywordsArr = JSON.parse(r.keywords);
        }
      } catch (_) {}

      return {
        id: r.id,
        name: r.name,
        type: r.type as Category['type'],
        icon: r.icon,
        color: r.color,
        keywords: keywordsArr,
        isDefault: r.is_default === 1,
      };
    });
  },

  async create(category: Category): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO categories (id, name, type, icon, color, keywords, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        category.id,
        category.name,
        category.type,
        category.icon,
        category.color,
        category.keywords ? JSON.stringify(category.keywords) : null,
        category.isDefault ? 1 : 0,
      ]
    );
  },

  async update(category: Category): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE categories SET name = ?, type = ?, icon = ?, color = ?, keywords = ? WHERE id = ?`,
      [
        category.name,
        category.type,
        category.icon,
        category.color,
        category.keywords ? JSON.stringify(category.keywords) : null,
        category.id,
      ]
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM categories WHERE id = ? AND is_default = 0', [id]);
  },
};
