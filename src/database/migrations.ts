import type { AppDatabase } from './database.ts';

export const LATEST_SCHEMA_VERSION = 5;

export interface MigrationLog {
  fromVersion: number;
  toVersion: number;
  appliedSteps: string[];
}

/**
 * Consulta la versión de esquema registrada en SQLite
 */
export async function getUserVersion(db: AppDatabase): Promise<number> {
  try {
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
    return row?.user_version ?? 0;
  } catch (error) {
    console.warn('[DB Migration] Error leyendo PRAGMA user_version:', error);
    return 0;
  }
}

/**
 * Registra la nueva versión de esquema en SQLite
 */
export async function setUserVersion(db: AppDatabase, version: number): Promise<void> {
  await db.execAsync(`PRAGMA user_version = ${version};`);
}

/**
 * Comprueba si una tabla existe en la base de datos
 */
export async function tableExists(db: AppDatabase, tableName: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?;`,
    [tableName]
  );
  return !!row;
}

/**
 * Obtiene el conjunto de nombres de columnas de una tabla (en minúsculas)
 */
export async function getTableColumns(db: AppDatabase, tableName: string): Promise<Set<string>> {
  try {
    const exists = await tableExists(db, tableName);
    if (!exists) return new Set<string>();
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName});`);
    return new Set(info.map((col) => col.name.toLowerCase()));
  } catch (error) {
    console.warn(`[DB Migration] Error consultando table_info de ${tableName}:`, error);
    return new Set<string>();
  }
}

/**
 * Añade una columna de forma idempotente:
 * Si la tabla no existe, no hace nada (se creará con la estructura completa).
 * Si la columna ya existe, no hace nada.
 * Si falta, ejecuta ALTER TABLE ADD COLUMN.
 */
export async function addColumnIfNotExists(
  db: AppDatabase,
  tableName: string,
  columnName: string,
  columnDef: string
): Promise<boolean> {
  const exists = await tableExists(db, tableName);
  if (!exists) return false;

  const columns = await getTableColumns(db, tableName);
  if (!columns.has(columnName.toLowerCase())) {
    await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef};`);
    return true;
  }
  return false;
}

/**
 * Estructura completa de columnas requeridas por tabla para auditoría y reconciliación determinista
 */
export const REQUIRED_SCHEMA_COLUMNS: Record<string, Record<string, string>> = {
  accounts: {
    id: 'TEXT PRIMARY KEY',
    name: 'TEXT NOT NULL',
    type: 'TEXT NOT NULL',
    bank_name: 'TEXT NOT NULL',
    balance: 'REAL NOT NULL DEFAULT 0',
    initial_balance: 'REAL NOT NULL DEFAULT 0',
    currency: "TEXT NOT NULL DEFAULT 'COP'",
    color: 'TEXT NOT NULL',
    icon: 'TEXT NOT NULL',
    include_in_total: 'INTEGER NOT NULL DEFAULT 1',
    has_gmf_4x1000: 'INTEGER NOT NULL DEFAULT 0',
    interest_rate_monthly: 'REAL NOT NULL DEFAULT 0',
    debt_limit: 'REAL NOT NULL DEFAULT 0',
    due_date: 'INTEGER',
    is_archived: 'INTEGER NOT NULL DEFAULT 0',
    created_at: 'TEXT NOT NULL',
  },
  credit_cards: {
    id: 'TEXT PRIMARY KEY',
    name: 'TEXT NOT NULL',
    bank_name: 'TEXT NOT NULL',
    card_brand: "TEXT NOT NULL DEFAULT 'visa'",
    issuer_id: "TEXT NOT NULL DEFAULT 'generic'",
    last_four_digits: 'TEXT',
    credit_limit: 'REAL NOT NULL DEFAULT 0',
    available_limit: 'REAL NOT NULL DEFAULT 0',
    cut_off_day: 'INTEGER NOT NULL',
    payment_due_day: 'INTEGER NOT NULL',
    interest_rate_monthly: 'REAL NOT NULL DEFAULT 0',
    late_interest_rate_monthly: 'REAL NOT NULL DEFAULT 0',
    handling_fee: 'REAL NOT NULL DEFAULT 0',
    positive_balance: 'REAL NOT NULL DEFAULT 0',
    color_gradient_start: 'TEXT NOT NULL',
    color_gradient_end: 'TEXT NOT NULL',
    currency: "TEXT NOT NULL DEFAULT 'COP'",
    is_archived: 'INTEGER NOT NULL DEFAULT 0',
    created_at: 'TEXT NOT NULL',
  },
  categories: {
    id: 'TEXT PRIMARY KEY',
    name: 'TEXT NOT NULL',
    type: 'TEXT NOT NULL',
    icon: 'TEXT NOT NULL',
    color: 'TEXT NOT NULL',
    keywords: 'TEXT',
    is_default: 'INTEGER NOT NULL DEFAULT 0',
  },
  transactions: {
    id: 'TEXT PRIMARY KEY',
    account_id: 'TEXT',
    card_id: 'TEXT',
    type: 'TEXT NOT NULL',
    amount: 'REAL NOT NULL',
    category_id: 'TEXT NOT NULL',
    description: 'TEXT NOT NULL',
    notes: 'TEXT',
    date: 'TEXT NOT NULL',
    to_account_id: 'TEXT',
    card_purchase_id: 'TEXT',
    card_installment_id: 'TEXT',
    statement_id: 'TEXT',
    principal_amount: 'REAL NOT NULL DEFAULT 0',
    interest_amount: 'REAL NOT NULL DEFAULT 0',
    gmf_amount: 'REAL NOT NULL DEFAULT 0',
    created_at: 'TEXT NOT NULL',
  },
  budgets: {
    id: 'TEXT PRIMARY KEY',
    category_id: 'TEXT NOT NULL',
    monthly_limit: 'REAL NOT NULL',
    month_year: 'TEXT NOT NULL',
    created_at: 'TEXT NOT NULL',
  },
  card_purchases: {
    id: 'TEXT PRIMARY KEY',
    card_id: 'TEXT NOT NULL',
    description: 'TEXT NOT NULL',
    category_id: 'TEXT NOT NULL',
    amount: 'REAL NOT NULL',
    installments_total: 'INTEGER NOT NULL DEFAULT 1',
    installments_paid: 'INTEGER NOT NULL DEFAULT 0',
    monthly_installment_amount: 'REAL NOT NULL DEFAULT 0',
    interest_rate_monthly: 'REAL NOT NULL DEFAULT 0',
    first_installment_date: 'TEXT NOT NULL',
    status: "TEXT NOT NULL DEFAULT 'active'",
    created_at: 'TEXT NOT NULL',
  },
  card_installments: {
    id: 'TEXT PRIMARY KEY',
    purchase_id: 'TEXT NOT NULL',
    installment_number: 'INTEGER NOT NULL',
    due_date: 'TEXT NOT NULL',
    principal_amount: 'REAL NOT NULL',
    interest_amount: 'REAL NOT NULL',
    total_amount: 'REAL NOT NULL',
    is_paid: 'INTEGER NOT NULL DEFAULT 0',
    paid_date: 'TEXT',
  },
  card_billing_cycles: {
    id: 'TEXT PRIMARY KEY',
    card_id: 'TEXT NOT NULL',
    cycle_number: 'INTEGER NOT NULL DEFAULT 1',
    start_date: 'TEXT NOT NULL',
    cut_off_date: 'TEXT NOT NULL',
    payment_due_date: 'TEXT NOT NULL',
    status: "TEXT NOT NULL DEFAULT 'open'",
    created_at: 'TEXT NOT NULL',
  },
  card_statements: {
    id: 'TEXT PRIMARY KEY',
    card_id: 'TEXT NOT NULL',
    billing_cycle_id: 'TEXT NOT NULL',
    statement_date: 'TEXT NOT NULL',
    due_date: 'TEXT NOT NULL',
    opening_balance: 'REAL NOT NULL DEFAULT 0',
    purchases_total: 'REAL NOT NULL DEFAULT 0',
    advances_total: 'REAL NOT NULL DEFAULT 0',
    principal_total: 'REAL NOT NULL DEFAULT 0',
    current_interest: 'REAL NOT NULL DEFAULT 0',
    late_interest: 'REAL NOT NULL DEFAULT 0',
    handling_fee: 'REAL NOT NULL DEFAULT 0',
    taxes_and_fees: 'REAL NOT NULL DEFAULT 0',
    collection_fee: 'REAL NOT NULL DEFAULT 0',
    total_statement_balance: 'REAL NOT NULL DEFAULT 0',
    minimum_payment_original: 'REAL NOT NULL DEFAULT 0',
    statement_balance_paid: 'REAL NOT NULL DEFAULT 0',
    minimum_payment_paid: 'REAL NOT NULL DEFAULT 0',
    status: "TEXT NOT NULL DEFAULT 'open'",
    is_manual_snapshot: 'INTEGER NOT NULL DEFAULT 0',
    is_opening_balance: 'INTEGER NOT NULL DEFAULT 0',
    notes: 'TEXT',
    created_at: 'TEXT NOT NULL',
  },
  card_payment_allocations: {
    id: 'TEXT PRIMARY KEY',
    transaction_id: 'TEXT NOT NULL',
    card_id: 'TEXT NOT NULL',
    statement_id: 'TEXT',
    total_payment: 'REAL NOT NULL DEFAULT 0',
    principal_applied: 'REAL NOT NULL DEFAULT 0',
    current_interest_applied: 'REAL NOT NULL DEFAULT 0',
    late_interest_applied: 'REAL NOT NULL DEFAULT 0',
    handling_fee_applied: 'REAL NOT NULL DEFAULT 0',
    taxes_and_fees_applied: 'REAL NOT NULL DEFAULT 0',
    collection_fee_applied: 'REAL NOT NULL DEFAULT 0',
    credit_balance_applied: 'REAL NOT NULL DEFAULT 0',
    statement_applied: 'REAL NOT NULL DEFAULT 0',
    unbilled_applied: 'REAL NOT NULL DEFAULT 0',
    minimum_applied: 'REAL NOT NULL DEFAULT 0',
    created_at: 'TEXT NOT NULL',
  },
  card_reconciliations: {
    id: 'TEXT PRIMARY KEY',
    card_id: 'TEXT NOT NULL',
    statement_id: 'TEXT',
    reconciliation_date: 'TEXT NOT NULL',
    app_calculated_debt: 'REAL NOT NULL DEFAULT 0',
    bank_reported_debt: 'REAL NOT NULL DEFAULT 0',
    difference_amount: 'REAL NOT NULL DEFAULT 0',
    difference_category: "TEXT NOT NULL DEFAULT 'unclassified'",
    status: "TEXT NOT NULL DEFAULT 'applied'",
    amount_paid: 'REAL NOT NULL DEFAULT 0',
    adjustment_transaction_id: 'TEXT',
    notes: 'TEXT',
    created_at: 'TEXT NOT NULL',
  },
  card_payment_reconciliation_allocations: {
    id: 'TEXT PRIMARY KEY',
    payment_allocation_id: 'TEXT NOT NULL',
    reconciliation_id: 'TEXT NOT NULL',
    category: 'TEXT NOT NULL',
    amount_applied: 'REAL NOT NULL DEFAULT 0',
    created_at: 'TEXT NOT NULL',
  },
};

/**
 * Asegura la creación de todas las tablas requeridas si aún no existen
 */
export async function createTablesIfNotExist(db: AppDatabase): Promise<void> {
  await db.execAsync(`
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
      amount_paid REAL NOT NULL DEFAULT 0,
      adjustment_transaction_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (card_id) REFERENCES credit_cards (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS card_payment_reconciliation_allocations (
      id TEXT PRIMARY KEY,
      payment_allocation_id TEXT NOT NULL,
      reconciliation_id TEXT NOT NULL,
      category TEXT NOT NULL,
      amount_applied REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (payment_allocation_id) REFERENCES card_payment_allocations (id) ON DELETE CASCADE,
      FOREIGN KEY (reconciliation_id) REFERENCES card_reconciliations (id) ON DELETE CASCADE
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
  `);
}

/**
 * Reconciliador exhaustivo e idempotente de columnas:
 * Compara cada tabla contra REQUIRED_SCHEMA_COLUMNS y añade cualquier columna faltante.
 */
export async function ensureAllColumnsExist(db: AppDatabase): Promise<string[]> {
  const addedColumns: string[] = [];

  for (const [tableName, columns] of Object.entries(REQUIRED_SCHEMA_COLUMNS)) {
    const tablePresent = await tableExists(db, tableName);
    if (!tablePresent) continue;

    const existingCols = await getTableColumns(db, tableName);
    for (const [colName, colDef] of Object.entries(columns)) {
      if (!existingCols.has(colName.toLowerCase())) {
        // En SQLite ALTER TABLE ADD COLUMN no acepta PRIMARY KEY. Ignorar si es id de tabla existente
        if (colDef.includes('PRIMARY KEY')) continue;

        await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colDef};`);
        addedColumns.push(`${tableName}.${colName}`);
      }
    }
  }

  return addedColumns;
}

/**
 * Crea todos los índices de rendimiento e integridad.
 * CRÍTICO: Se ejecuta ÚNICAMENTE después de asegurar que todas las tablas y columnas existen.
 */
export async function ensureIndexes(db: AppDatabase): Promise<void> {
  await db.execAsync(`
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
    CREATE INDEX IF NOT EXISTS idx_card_pay_rec_alloc_pay ON card_payment_reconciliation_allocations (payment_allocation_id);
    CREATE INDEX IF NOT EXISTS idx_card_pay_rec_alloc_rec ON card_payment_reconciliation_allocations (reconciliation_id);
  `);
}

/**
 * Ejecutor maestro de migraciones:
 * 1. Lee la versión de esquema actual (user_version).
 * 2. Aplica pasos incrementales según versión.
 * 3. Ejecuta el reconciliador estructural para proteger bases intermedias o alteradas.
 * 4. Crea los índices una vez que todas las columnas existen.
 * 5. Actualiza user_version al valor final.
 */
export async function runDatabaseMigrations(db: AppDatabase): Promise<MigrationLog> {
  const currentVersion = await getUserVersion(db);
  const appliedSteps: string[] = [];
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

  if (isDev) {
    console.log(`[DB Migration] Iniciando migración. user_version actual: ${currentVersion} -> Objetivo: ${LATEST_SCHEMA_VERSION}`);
  }

  try {
    // 1. Asegurar existencia de todas las tablas base
    await createTablesIfNotExist(db);
    appliedSteps.push('createTablesIfNotExist');

    // 2. Paso V1 -> V2: Cuentas y Categorías
    if (currentVersion < 2) {
      await addColumnIfNotExists(db, 'accounts', 'include_in_total', 'INTEGER NOT NULL DEFAULT 1');
      await addColumnIfNotExists(db, 'accounts', 'has_gmf_4x1000', 'INTEGER NOT NULL DEFAULT 0');
      await addColumnIfNotExists(db, 'accounts', 'interest_rate_monthly', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfNotExists(db, 'accounts', 'debt_limit', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfNotExists(db, 'accounts', 'due_date', 'INTEGER');
      await addColumnIfNotExists(db, 'categories', 'keywords', 'TEXT');
      appliedSteps.push('migration_v2_accounts_categories');
    }

    // 3. Paso V2 -> V3: Compras a cuotas y columnas de transacciones
    if (currentVersion < 3) {
      await addColumnIfNotExists(db, 'transactions', 'gmf_amount', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfNotExists(db, 'transactions', 'card_installment_id', 'TEXT');
      await addColumnIfNotExists(db, 'transactions', 'statement_id', 'TEXT');
      await addColumnIfNotExists(db, 'transactions', 'principal_amount', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfNotExists(db, 'transactions', 'interest_amount', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfNotExists(db, 'credit_cards', 'issuer_id', "TEXT NOT NULL DEFAULT 'generic'");
      await addColumnIfNotExists(db, 'credit_cards', 'late_interest_rate_monthly', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfNotExists(db, 'credit_cards', 'positive_balance', 'REAL NOT NULL DEFAULT 0');
      appliedSteps.push('migration_v3_installments_transactions');
    }

    // 4. Paso V3 -> V4: Extractos, ciclos y asignaciones de pago
    if (currentVersion < 4) {
      await addColumnIfNotExists(db, 'card_statements', 'collection_fee', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfNotExists(db, 'card_statements', 'is_opening_balance', 'INTEGER NOT NULL DEFAULT 0');
      await addColumnIfNotExists(db, 'card_payment_allocations', 'collection_fee_applied', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfNotExists(db, 'card_payment_allocations', 'statement_applied', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfNotExists(db, 'card_payment_allocations', 'unbilled_applied', 'REAL NOT NULL DEFAULT 0');
      await addColumnIfNotExists(db, 'card_payment_allocations', 'minimum_applied', 'REAL NOT NULL DEFAULT 0');
      appliedSteps.push('migration_v4_statements_allocations');
    }

    // 5. Paso V4 -> V5: Conciliaciones y trazabilidad exacta de pagos
    if (currentVersion < 5) {
      await addColumnIfNotExists(db, 'card_reconciliations', 'difference_category', "TEXT NOT NULL DEFAULT 'unclassified'");
      await addColumnIfNotExists(db, 'card_reconciliations', 'status', "TEXT NOT NULL DEFAULT 'applied'");
      await addColumnIfNotExists(db, 'card_reconciliations', 'amount_paid', 'REAL NOT NULL DEFAULT 0');
      appliedSteps.push('migration_v5_reconciliation_allocations');
    }

    // 6. Capa de Integridad Estructural Determinista (repara cualquier omisión de bases intermedias)
    const extraCols = await ensureAllColumnsExist(db);
    if (extraCols.length > 0) {
      appliedSteps.push(`reconciliation_added: ${extraCols.join(', ')}`);
    }

    // 7. Creación segura de índices (todas las columnas ya existen garantizadas)
    await ensureIndexes(db);
    appliedSteps.push('ensureIndexes');

    // 8. Actualizar user_version al último esquema
    await setUserVersion(db, LATEST_SCHEMA_VERSION);

    if (isDev) {
      console.log(`[DB Migration] Migración completada exitosamente. user_version final: ${LATEST_SCHEMA_VERSION}. Pasos:`, appliedSteps);
    }

    return {
      fromVersion: currentVersion,
      toVersion: LATEST_SCHEMA_VERSION,
      appliedSteps,
    };
  } catch (error: any) {
    console.error('[DB Migration] Error crítico durante la migración de base de datos:', error);
    const friendlyError = new Error(
      'No pudimos actualizar la base de datos local. Tus datos permanecen guardados. Intenta reiniciar la aplicación.'
    );
    (friendlyError as any).originalError = error;
    throw friendlyError;
  }
}
