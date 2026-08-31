export interface AppDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(source: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params?: any[]): Promise<T | null>;
  withTransactionAsync<T>(action: () => Promise<T>): Promise<T>;
}

let dbInstance: AppDatabase | null = null;
let testDbInstance: AppDatabase | null = null;

/**
 * Permite inyectar un adaptador SQLite de pruebas (ej. motor SQLite en memoria)
 */
export function setTestDatabase(db: AppDatabase | null): void {
  testDbInstance = db;
}

export async function getDatabase(): Promise<AppDatabase> {
  if (testDbInstance) {
    return testDbInstance;
  }
  if (!dbInstance) {
    const SQLite = await import('expo-sqlite');
    dbInstance = (await SQLite.openDatabaseAsync('gestion_gastos.db')) as unknown as AppDatabase;
    await initDatabase(dbInstance);
  }
  return dbInstance;
}

export async function initDatabase(db: AppDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      initial_balance REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'COP',
      color TEXT NOT NULL,
      icon TEXT NOT NULL,
      include_in_total INTEGER NOT NULL DEFAULT 1,
      has_gmf_4x1000 INTEGER NOT NULL DEFAULT 0,
      interest_rate_monthly REAL NOT NULL DEFAULT 0,
      debt_limit REAL NOT NULL DEFAULT 0,
      due_date INTEGER,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      card_brand TEXT NOT NULL DEFAULT 'visa',
      issuer_id TEXT NOT NULL DEFAULT 'generic',
      last_four_digits TEXT,
      credit_limit REAL NOT NULL DEFAULT 0,
      available_limit REAL NOT NULL DEFAULT 0,
      cut_off_day INTEGER NOT NULL,
      payment_due_day INTEGER NOT NULL,
      interest_rate_monthly REAL NOT NULL DEFAULT 0,
      late_interest_rate_monthly REAL NOT NULL DEFAULT 0,
      handling_fee REAL NOT NULL DEFAULT 0,
      positive_balance REAL NOT NULL DEFAULT 0,
      color_gradient_start TEXT NOT NULL,
      color_gradient_end TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'COP',
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      keywords TEXT,
      is_default INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS card_purchases (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      description TEXT NOT NULL,
      category_id TEXT NOT NULL,
      amount REAL NOT NULL,
      installments_total INTEGER NOT NULL DEFAULT 1,
      installments_paid INTEGER NOT NULL DEFAULT 0,
      monthly_installment_amount REAL NOT NULL DEFAULT 0,
      interest_rate_monthly REAL NOT NULL DEFAULT 0,
      first_installment_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      FOREIGN KEY (card_id) REFERENCES credit_cards (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS card_installments (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL,
      installment_number INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      principal_amount REAL NOT NULL,
      interest_amount REAL NOT NULL,
      total_amount REAL NOT NULL,
      is_paid INTEGER NOT NULL DEFAULT 0,
      paid_date TEXT,
      FOREIGN KEY (purchase_id) REFERENCES card_purchases (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS card_billing_cycles (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      cycle_number INTEGER NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL,
      cut_off_date TEXT NOT NULL,
      payment_due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      FOREIGN KEY (card_id) REFERENCES credit_cards (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS card_statements (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      billing_cycle_id TEXT NOT NULL,
      statement_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      opening_balance REAL NOT NULL DEFAULT 0,
      purchases_total REAL NOT NULL DEFAULT 0,
      advances_total REAL NOT NULL DEFAULT 0,
      principal_total REAL NOT NULL DEFAULT 0,
      current_interest REAL NOT NULL DEFAULT 0,
      late_interest REAL NOT NULL DEFAULT 0,
      handling_fee REAL NOT NULL DEFAULT 0,
      taxes_and_fees REAL NOT NULL DEFAULT 0,
      collection_fee REAL NOT NULL DEFAULT 0,
      total_statement_balance REAL NOT NULL DEFAULT 0,
      minimum_payment_original REAL NOT NULL DEFAULT 0,
      statement_balance_paid REAL NOT NULL DEFAULT 0,
      minimum_payment_paid REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      is_manual_snapshot INTEGER NOT NULL DEFAULT 0,
      is_opening_balance INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (card_id) REFERENCES credit_cards (id) ON DELETE CASCADE,
      FOREIGN KEY (billing_cycle_id) REFERENCES card_billing_cycles (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS card_payment_allocations (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      statement_id TEXT,
      total_payment REAL NOT NULL DEFAULT 0,
      principal_applied REAL NOT NULL DEFAULT 0,
      current_interest_applied REAL NOT NULL DEFAULT 0,
      late_interest_applied REAL NOT NULL DEFAULT 0,
      handling_fee_applied REAL NOT NULL DEFAULT 0,
      taxes_and_fees_applied REAL NOT NULL DEFAULT 0,
      collection_fee_applied REAL NOT NULL DEFAULT 0,
      credit_balance_applied REAL NOT NULL DEFAULT 0,
      statement_applied REAL NOT NULL DEFAULT 0,
      unbilled_applied REAL NOT NULL DEFAULT 0,
      minimum_applied REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE,
      FOREIGN KEY (card_id) REFERENCES credit_cards (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS card_reconciliations (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      statement_id TEXT,
      reconciliation_date TEXT NOT NULL,
      app_calculated_debt REAL NOT NULL DEFAULT 0,
      bank_reported_debt REAL NOT NULL DEFAULT 0,
      difference_amount REAL NOT NULL DEFAULT 0,
      difference_category TEXT NOT NULL DEFAULT 'unclassified',
      status TEXT NOT NULL DEFAULT 'applied',
      adjustment_transaction_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (card_id) REFERENCES credit_cards (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT,
      card_id TEXT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      category_id TEXT NOT NULL,
      description TEXT NOT NULL,
      notes TEXT,
      date TEXT NOT NULL,
      to_account_id TEXT,
      card_purchase_id TEXT,
      card_installment_id TEXT,
      statement_id TEXT,
      principal_amount REAL NOT NULL DEFAULT 0,
      interest_amount REAL NOT NULL DEFAULT 0,
      gmf_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      monthly_limit REAL NOT NULL,
      month_year TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Índices de Rendimiento e Integridad para consultas frecuentes
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_to_account ON transactions (to_account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_card ON transactions (card_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_card_purchase ON transactions (card_purchase_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_card_installment ON transactions (card_installment_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_statement ON transactions (statement_id);
    CREATE INDEX IF NOT EXISTS idx_card_purchases_card ON card_purchases (card_id);
    CREATE INDEX IF NOT EXISTS idx_card_installments_purchase ON card_installments (purchase_id);
    CREATE INDEX IF NOT EXISTS idx_card_installments_due_date ON card_installments (due_date);
    CREATE INDEX IF NOT EXISTS idx_card_cycles_card_cutoff ON card_billing_cycles (card_id, cut_off_date);
    CREATE INDEX IF NOT EXISTS idx_card_statements_card_cycle ON card_statements (card_id, billing_cycle_id);
    CREATE INDEX IF NOT EXISTS idx_card_allocations_tx ON card_payment_allocations (transaction_id);
    CREATE INDEX IF NOT EXISTS idx_card_allocations_card ON card_payment_allocations (card_id);
    CREATE INDEX IF NOT EXISTS idx_card_reconciliations_card ON card_reconciliations (card_id);
  `);

  // Migraciones seguras para bases de datos existentes
  try {
    await db.execAsync(`ALTER TABLE accounts ADD COLUMN include_in_total INTEGER NOT NULL DEFAULT 1;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE accounts ADD COLUMN has_gmf_4x1000 INTEGER NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE accounts ADD COLUMN interest_rate_monthly REAL NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE accounts ADD COLUMN debt_limit REAL NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE accounts ADD COLUMN due_date INTEGER;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE transactions ADD COLUMN gmf_amount REAL NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE transactions ADD COLUMN card_installment_id TEXT;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE transactions ADD COLUMN statement_id TEXT;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE transactions ADD COLUMN principal_amount REAL NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE transactions ADD COLUMN interest_amount REAL NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE categories ADD COLUMN keywords TEXT;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE credit_cards ADD COLUMN issuer_id TEXT NOT NULL DEFAULT 'generic';`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE credit_cards ADD COLUMN late_interest_rate_monthly REAL NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE credit_cards ADD COLUMN positive_balance REAL NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE card_statements ADD COLUMN collection_fee REAL NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE card_statements ADD COLUMN is_opening_balance INTEGER NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE card_payment_allocations ADD COLUMN collection_fee_applied REAL NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE card_payment_allocations ADD COLUMN statement_applied REAL NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE card_payment_allocations ADD COLUMN unbilled_applied REAL NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE card_payment_allocations ADD COLUMN minimum_applied REAL NOT NULL DEFAULT 0;`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE card_reconciliations ADD COLUMN difference_category TEXT NOT NULL DEFAULT 'unclassified';`);
  } catch (_) {}

  try {
    await db.execAsync(`ALTER TABLE card_reconciliations ADD COLUMN status TEXT NOT NULL DEFAULT 'applied';`);
  } catch (_) {}

  await seedDefaultCategories(db);

  // Actualizar palabras clave de categorías del sistema si están vacías
  for (const cat of defaultCategoriesList) {
    if (cat.keywords && cat.keywords.length > 0) {
      try {
        await db.runAsync(
          'UPDATE categories SET keywords = ? WHERE id = ? AND (keywords IS NULL OR keywords = "" OR keywords = "[]")',
          [JSON.stringify(cat.keywords), cat.id]
        );
      } catch (_) {}
    }
  }
}

const defaultCategoriesList = [
  // Gastos con palabras clave para IA
  {
    id: 'cat-food',
    name: 'Alimentación & Restaurantes',
    type: 'expense',
    icon: 'Utensils',
    color: '#F97316',
    keywords: ['exito', 'jumbo', 'carulla', 'd1', 'ara', 'olimpica', 'restaurante', 'almuerzo', 'cena', 'comida', 'mercado', 'hamburguesa', 'pizza', 'domicilio', 'rappi', 'ifood', 'panaderia', 'cafe', 'starbucks', 'tostao'],
  },
    {
      id: 'cat-transport',
      name: 'Transporte & Gasolina',
      type: 'expense',
      icon: 'Car',
      color: '#3B82F6',
      keywords: ['uber', 'didi', 'cabify', 'gasolina', 'terpel', 'primax', 'brio', 'taxi', 'peaje', 'parqueadero', 'transmilenio', 'metro', 'pasaje', 'mantenimiento vehiculo', 'taller'],
    },
    {
      id: 'cat-housing',
      name: 'Vivienda & Servicios',
      type: 'expense',
      icon: 'Home',
      color: '#10B981',
      keywords: ['arriendo', 'alquiler', 'administracion', 'epm', 'enel', 'codensa', 'acueducto', 'gas', 'claro', 'movistar', 'tigo', 'etb', 'internet', 'luz', 'agua', 'energia'],
    },
    {
      id: 'cat-shopping',
      name: 'Compras & Ropa',
      type: 'expense',
      icon: 'ShoppingBag',
      color: '#EC4899',
      keywords: ['zara', 'falabella', 'mercadolibre', 'amazon', 'aliexpress', 'hm', 'ropa', 'zapatos', 'centro comercial', 'tenis', 'alkosto', 'ktronix', 'homecenter', 'tienda'],
    },
    {
      id: 'cat-entertainment',
      name: 'Ocio & Entretenimiento',
      type: 'expense',
      icon: 'Film',
      color: '#8B5CF6',
      keywords: ['cine', 'cinecolombia', 'cinemark', 'procinal', 'fiesta', 'bar', 'cerveza', 'concierto', 'discoteca', 'videojuegos', 'playstation', 'steam', 'viaje', 'hotel', 'boletas', 'tiquetes'],
    },
    {
      id: 'cat-health',
      name: 'Salud & Cuidado',
      type: 'expense',
      icon: 'HeartPulse',
      color: '#EF4444',
      keywords: ['drogueria', 'farmacia', 'cruz verde', 'farmatodo', 'medico', 'odontologia', 'cita medica', 'medicamentos', 'gimnasio', 'smart fit', 'eps', 'medicina prepagada'],
    },
    {
      id: 'cat-education',
      name: 'Educación & Cursos',
      type: 'expense',
      icon: 'GraduationCap',
      color: '#06B6D4',
      keywords: ['universidad', 'colegio', 'platzi', 'udemy', 'coursera', 'curso', 'matricula', 'libros', 'papeleria', 'ingles'],
    },
    {
      id: 'cat-subscriptions',
      name: 'Suscripciones & Streaming',
      type: 'expense',
      icon: 'Tv',
      color: '#6366F1',
      keywords: ['netflix', 'spotify', 'youtube', 'disney', 'amazon prime', 'max', 'hbo', 'chatgpt', 'icloud', 'google one', 'apple', 'crunchyroll'],
    },
    {
      id: 'cat-financial',
      name: 'Gastos Financieros & 4x1000',
      type: 'expense',
      icon: 'Percent',
      color: '#E11D48',
      keywords: ['cuota', 'intereses', 'manejo', 'comision', 'abono tarjeta', 'cuota prestamo', 'banco', 'gravamen', '4x1000', 'gmf', 'impuesto financiero'],
    },
    {
      id: 'cat-other-exp',
      name: 'Otros Gastos',
      type: 'expense',
      icon: 'MoreHorizontal',
      color: '#94A3B8',
      keywords: ['varios', 'miscelaneo', 'imprevisto', 'otro'],
    },

    // Ingresos
    {
      id: 'cat-salary',
      name: 'Salario / Sueldo',
      type: 'income',
      icon: 'Briefcase',
      color: '#10B981',
      keywords: ['nomina', 'sueldo', 'salario', 'pago quincena', 'quincena', 'empresa', 'prima', 'cesantias'],
    },
    {
      id: 'cat-freelance',
      name: 'Honorarios / Freelance',
      type: 'income',
      icon: 'Laptop',
      color: '#06B6D4',
      keywords: ['honorarios', 'freelance', 'proyecto', 'cliente', 'cuenta de cobro', 'asesoria', 'servicio'],
    },
    {
      id: 'cat-investment',
      name: 'Inversiones & Rendimientos',
      type: 'income',
      icon: 'TrendingUp',
      color: '#8B5CF6',
      keywords: ['rendimientos', 'intereses ganados', 'cdt', 'acciones', 'dividendos', 'cripto', 'trii', 'tyba', 'fiduciaria', 'cajita nu', 'bolsillo'],
    },
    {
      id: 'cat-gift',
      name: 'Regalos & Bonificaciones',
      type: 'income',
      icon: 'Gift',
      color: '#F59E0B',
      keywords: ['regalo', 'bono', 'bonificacion', 'premio', 'cumpleanos'],
    },
    {
      id: 'cat-other-inc',
      name: 'Otros Ingresos',
      type: 'income',
      icon: 'DollarSign',
      color: '#3B82F6',
      keywords: ['devolucion', 'reembolso', 'venta', 'ingreso extra'],
    },
  ];

async function seedDefaultCategories(db: AppDatabase): Promise<void> {
  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories');
  if (existing && existing.count > 0) return;

  for (const cat of defaultCategoriesList) {
    await db.runAsync(
      `INSERT INTO categories (id, name, type, icon, color, keywords, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [cat.id, cat.name, cat.type, cat.icon, cat.color, JSON.stringify(cat.keywords)]
    );
  }
}
