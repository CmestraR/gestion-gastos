import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

import { setTestDatabase, initDatabase } from '../src/database/database.ts';
import {
  runDatabaseMigrations,
  getUserVersion,
  setUserVersion,
  getTableColumns,
  tableExists,
  LATEST_SCHEMA_VERSION,
} from '../src/database/migrations.ts';
import { StatementRepository } from '../src/database/repositories/statementRepository.ts';
import { CycleRepository } from '../src/database/repositories/cycleRepository.ts';
import { CardRepository } from '../src/database/repositories/cardRepository.ts';
import { TransactionRepository } from '../src/database/repositories/transactionRepository.ts';
import { AccountRepository } from '../src/database/repositories/accountRepository.ts';

function createMockAppDatabase(syncDb: DatabaseSync) {
  return {
    async execAsync(source: string): Promise<void> {
      syncDb.exec(source);
    },
    async runAsync(source: string, params: any[] = []): Promise<{ lastInsertRowId: number; changes: number }> {
      const stmt = syncDb.prepare(source);
      const result = stmt.run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async getAllAsync<T>(source: string, params: any[] = []): Promise<T[]> {
      const stmt = syncDb.prepare(source);
      return stmt.all(...params) as T[];
    },
    async getFirstAsync<T>(source: string, params: any[] = []): Promise<T | null> {
      const stmt = syncDb.prepare(source);
      const row = stmt.get(...params);
      return (row as T) || null;
    },
    async withTransactionAsync<T>(action: () => Promise<T>): Promise<T> {
      syncDb.exec('BEGIN TRANSACTION;');
      try {
        const result = await action();
        syncDb.exec('COMMIT;');
        return result;
      } catch (err) {
        syncDb.exec('ROLLBACK;');
        throw err;
      }
    },
  };
}

describe('BATERÍA DE MIGRACIONES RETROCOMPATIBLES E IDEMPOTENTES (SQLITE REAL)', () => {
  test('M01: Migración desde base antigua (Fase 1 Legacy sin card_installment_id)', async () => {
    const syncDb = new DatabaseSync(':memory:');
    const db = createMockAppDatabase(syncDb);

    // 1. Crear esquema original de Fase 1 ANTIGUO (sin ninguna de las columnas nuevas de Fase 1.2 / 2 / 2.1)
    syncDb.exec(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        balance REAL NOT NULL DEFAULT 0,
        initial_balance REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'COP',
        color TEXT NOT NULL,
        icon TEXT NOT NULL,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE credit_cards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        card_brand TEXT NOT NULL DEFAULT 'visa',
        last_four_digits TEXT,
        credit_limit REAL NOT NULL DEFAULT 0,
        available_limit REAL NOT NULL DEFAULT 0,
        cut_off_day INTEGER NOT NULL,
        payment_due_day INTEGER NOT NULL,
        interest_rate_monthly REAL NOT NULL DEFAULT 0,
        handling_fee REAL NOT NULL DEFAULT 0,
        color_gradient_start TEXT NOT NULL,
        color_gradient_end TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'COP',
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE transactions (
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
        created_at TEXT NOT NULL
      );

      CREATE TABLE budgets (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL,
        monthly_limit REAL NOT NULL,
        month_year TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // 2. Insertar datos históricos reales de usuario
    syncDb.exec(`
      INSERT INTO accounts (id, name, type, bank_name, balance, initial_balance, currency, color, icon, is_archived, created_at)
      VALUES ('acc-hist-1', 'Ahorros Principal', 'savings', 'Bancolombia', 1500000, 1500000, 'COP', '#3B82F6', 'landmark', 0, '2026-01-01');

      INSERT INTO credit_cards (id, name, bank_name, card_brand, last_four_digits, credit_limit, available_limit, cut_off_day, payment_due_day, interest_rate_monthly, handling_fee, color_gradient_start, color_gradient_end, is_archived, created_at)
      VALUES ('card-hist-1', 'Nu Histórica', 'Nu Bank', 'mastercard', '1234', 3000000, 3000000, 15, 5, 2.1, 0, '#8B5CF6', '#6D28D9', 0, '2026-01-01');

      INSERT INTO categories (id, name, type, icon, color, is_default)
      VALUES ('cat-hist-1', 'Supermercado', 'expense', 'ShoppingCart', '#10B981', 1);

      INSERT INTO transactions (id, account_id, card_id, type, amount, category_id, description, notes, date, created_at)
      VALUES ('tx-hist-1', 'acc-hist-1', NULL, 'expense', 45000, 'cat-hist-1', 'Mercado Semanal', 'Comida', '2026-01-05', '2026-01-05');
    `);

    // Verificar estado previo a la migración
    assert.strictEqual(await getUserVersion(db), 0);
    const preCols = await getTableColumns(db, 'transactions');
    assert.strictEqual(preCols.has('card_installment_id'), false);
    assert.strictEqual(preCols.has('statement_id'), false);
    assert.strictEqual(preCols.has('principal_amount'), false);
    assert.strictEqual(preCols.has('interest_amount'), false);

    // 3. Ejecutar inicialización / migración
    setTestDatabase(db);
    await initDatabase(db);

    // 4. Verificaciones post-migración
    // a. La versión de esquema se actualizó a la última
    assert.strictEqual(await getUserVersion(db), LATEST_SCHEMA_VERSION);

    // b. Las columnas faltantes en transactions fueron añadidas con sus tipos y defaults
    const postTxCols = await getTableColumns(db, 'transactions');
    assert.strictEqual(postTxCols.has('card_installment_id'), true);
    assert.strictEqual(postTxCols.has('statement_id'), true);
    assert.strictEqual(postTxCols.has('principal_amount'), true);
    assert.strictEqual(postTxCols.has('interest_amount'), true);
    assert.strictEqual(postTxCols.has('gmf_amount'), true);

    // c. Las columnas añadidas en accounts y credit_cards existen
    const postAccCols = await getTableColumns(db, 'accounts');
    assert.strictEqual(postAccCols.has('include_in_total'), true);
    assert.strictEqual(postAccCols.has('has_gmf_4x1000'), true);
    assert.strictEqual(postAccCols.has('debt_limit'), true);

    const postCardCols = await getTableColumns(db, 'credit_cards');
    assert.strictEqual(postCardCols.has('issuer_id'), true);
    assert.strictEqual(postCardCols.has('late_interest_rate_monthly'), true);
    assert.strictEqual(postCardCols.has('positive_balance'), true);

    // d. Las nuevas tablas de Fase 2 existen
    assert.strictEqual(await tableExists(db, 'card_billing_cycles'), true);
    assert.strictEqual(await tableExists(db, 'card_statements'), true);
    assert.strictEqual(await tableExists(db, 'card_payment_allocations'), true);
    assert.strictEqual(await tableExists(db, 'card_reconciliations'), true);
    assert.strictEqual(await tableExists(db, 'card_payment_reconciliation_allocations'), true);

    // e. Los datos históricos preexistentes permanecen 100% intactos
    const acc = await AccountRepository.getById('acc-hist-1');
    assert.strictEqual(acc?.name, 'Ahorros Principal');
    assert.strictEqual(acc?.balance, 1500000);
    assert.strictEqual(acc?.includeInTotal, true);

    const card = await CardRepository.getById('card-hist-1');
    assert.strictEqual(card?.name, 'Nu Histórica');
    assert.strictEqual(card?.creditLimit, 3000000);
    assert.strictEqual(card?.issuerId, 'generic'); // Default asignado por migración

    const allTxs = await TransactionRepository.getAll();
    const tx = allTxs.find((t) => t.id === 'tx-hist-1');
    assert.strictEqual(tx?.description, 'Mercado Semanal');
    assert.strictEqual(tx?.amount, 45000);
    assert.strictEqual(tx?.type, 'expense');
  });

  test('M02: Test Funcional del Bug — Configurar Saldo Actual en base migrada sin errores', async () => {
    const syncDb = new DatabaseSync(':memory:');
    const db = createMockAppDatabase(syncDb);

    // Crear base antigua
    syncDb.exec(`
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, bank_name TEXT NOT NULL, balance REAL NOT NULL DEFAULT 0, initial_balance REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'COP', color TEXT NOT NULL, icon TEXT NOT NULL, is_archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE credit_cards (id TEXT PRIMARY KEY, name TEXT NOT NULL, bank_name TEXT NOT NULL, card_brand TEXT NOT NULL DEFAULT 'visa', last_four_digits TEXT, credit_limit REAL NOT NULL DEFAULT 0, available_limit REAL NOT NULL DEFAULT 0, cut_off_day INTEGER NOT NULL, payment_due_day INTEGER NOT NULL, interest_rate_monthly REAL NOT NULL DEFAULT 0, handling_fee REAL NOT NULL DEFAULT 0, color_gradient_start TEXT NOT NULL, color_gradient_end TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'COP', is_archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE transactions (id TEXT PRIMARY KEY, account_id TEXT, card_id TEXT, type TEXT NOT NULL, amount REAL NOT NULL, category_id TEXT NOT NULL, description TEXT NOT NULL, notes TEXT, date TEXT NOT NULL, to_account_id TEXT, card_purchase_id TEXT, created_at TEXT NOT NULL);
      CREATE TABLE budgets (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, monthly_limit REAL NOT NULL, month_year TEXT NOT NULL, created_at TEXT NOT NULL);
      
      INSERT INTO credit_cards (id, name, bank_name, card_brand, credit_limit, available_limit, cut_off_day, payment_due_day, interest_rate_monthly, handling_fee, color_gradient_start, color_gradient_end, is_archived, created_at)
      VALUES ('card-migrated-1', 'RappiCard', 'Davivienda', 'visa', 2000000, 2000000, 20, 10, 2.2, 0, '#F43F5E', '#BE123C', 0, '2026-01-01');
    `);

    setTestDatabase(db);
    await initDatabase(db);

    // Ejecutar el flujo de Saldo de Apertura (que antes fallaba con NativeDatabase.prepareAsync: table transactions has no column named card_installment_id)
    const cycle = await CycleRepository.getOrCreateCurrentCycle('card-migrated-1', new Date('2026-08-20'));
    const openingSnapshot = await StatementRepository.createOpeningBalanceSnapshot({
      cardId: 'card-migrated-1',
      billingCycleId: cycle.id,
      statementDate: '2026-08-20',
      dueDate: '2026-09-10',
      principalTotal: 500000,
      interestAndFeesTotal: 35000,
      minimumPayment: 100000,
      notes: 'Saldo inicial configurado en dispositivo migrado',
    });

    assert.strictEqual(openingSnapshot.isOpeningBalance, true);
    assert.strictEqual(openingSnapshot.totalStatementBalance, 535000);

    const card = await CardRepository.getById('card-migrated-1');
    assert.strictEqual(card?.availableLimit, 1500000); // 2M - 500k

    // Verificar que la transacción fue insertada en transactions con todas las columnas
    const txs = await db.getAllAsync<any>("SELECT * FROM transactions WHERE card_id = 'card-migrated-1';");
    assert.strictEqual(txs.length, 1);
    assert.strictEqual(txs[0].type, 'card_opening_balance');
    assert.strictEqual(txs[0].amount, 535000);
    assert.strictEqual(txs[0].principal_amount, 500000);
    assert.strictEqual(txs[0].interest_amount, 35000);
    assert.strictEqual(txs[0].statement_id, openingSnapshot.id);
  });

  test('M03: Migración desde versión intermedia (Esquema Fase 1.2 / user_version = 2)', async () => {
    const syncDb = new DatabaseSync(':memory:');
    const db = createMockAppDatabase(syncDb);

    // Simular base con user_version = 2 (con compras a cuotas pero sin extractos ni conciliaciones)
    syncDb.exec(`
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, bank_name TEXT NOT NULL, balance REAL NOT NULL DEFAULT 0, initial_balance REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'COP', color TEXT NOT NULL, icon TEXT NOT NULL, include_in_total INTEGER NOT NULL DEFAULT 1, has_gmf_4x1000 INTEGER NOT NULL DEFAULT 0, interest_rate_monthly REAL NOT NULL DEFAULT 0, debt_limit REAL NOT NULL DEFAULT 0, due_date INTEGER, is_archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE credit_cards (id TEXT PRIMARY KEY, name TEXT NOT NULL, bank_name TEXT NOT NULL, card_brand TEXT NOT NULL DEFAULT 'visa', issuer_id TEXT NOT NULL DEFAULT 'generic', last_four_digits TEXT, credit_limit REAL NOT NULL DEFAULT 0, available_limit REAL NOT NULL DEFAULT 0, cut_off_day INTEGER NOT NULL, payment_due_day INTEGER NOT NULL, interest_rate_monthly REAL NOT NULL DEFAULT 0, late_interest_rate_monthly REAL NOT NULL DEFAULT 0, handling_fee REAL NOT NULL DEFAULT 0, positive_balance REAL NOT NULL DEFAULT 0, color_gradient_start TEXT NOT NULL, color_gradient_end TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'COP', is_archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL, keywords TEXT, is_default INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE card_purchases (id TEXT PRIMARY KEY, card_id TEXT NOT NULL, description TEXT NOT NULL, category_id TEXT NOT NULL, amount REAL NOT NULL, installments_total INTEGER NOT NULL DEFAULT 1, installments_paid INTEGER NOT NULL DEFAULT 0, monthly_installment_amount REAL NOT NULL DEFAULT 0, interest_rate_monthly REAL NOT NULL DEFAULT 0, first_installment_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL);
      CREATE TABLE card_installments (id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL, installment_number INTEGER NOT NULL, due_date TEXT NOT NULL, principal_amount REAL NOT NULL, interest_amount REAL NOT NULL, total_amount REAL NOT NULL, is_paid INTEGER NOT NULL DEFAULT 0, paid_date TEXT);
      CREATE TABLE transactions (id TEXT PRIMARY KEY, account_id TEXT, card_id TEXT, type TEXT NOT NULL, amount REAL NOT NULL, category_id TEXT NOT NULL, description TEXT NOT NULL, notes TEXT, date TEXT NOT NULL, to_account_id TEXT, card_purchase_id TEXT, card_installment_id TEXT, principal_amount REAL NOT NULL DEFAULT 0, interest_amount REAL NOT NULL DEFAULT 0, gmf_amount REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE budgets (id TEXT PRIMARY KEY, category_id TEXT NOT NULL, monthly_limit REAL NOT NULL, month_year TEXT NOT NULL, created_at TEXT NOT NULL);
      PRAGMA user_version = 2;
    `);

    setTestDatabase(db);
    await initDatabase(db);

    assert.strictEqual(await getUserVersion(db), LATEST_SCHEMA_VERSION);
    const txCols = await getTableColumns(db, 'transactions');
    assert.strictEqual(txCols.has('statement_id'), true);

    const stmtCols = await getTableColumns(db, 'card_statements');
    assert.strictEqual(stmtCols.has('collection_fee'), true);
    assert.strictEqual(stmtCols.has('is_opening_balance'), true);

    const recCols = await getTableColumns(db, 'card_reconciliations');
    assert.strictEqual(recCols.has('difference_category'), true);
    assert.strictEqual(recCols.has('status'), true);
    assert.strictEqual(recCols.has('amount_paid'), true);
  });

  test('M04: Idempotencia estricta — Múltiples ejecuciones consecutivas de migración no causan error', async () => {
    const syncDb = new DatabaseSync(':memory:');
    const db = createMockAppDatabase(syncDb);

    setTestDatabase(db);
    // Ejecución 1: Crea la base desde cero
    await initDatabase(db);
    assert.strictEqual(await getUserVersion(db), LATEST_SCHEMA_VERSION);

    // Ejecución 2: Re-ejecuta sobre base al día
    await runDatabaseMigrations(db);
    assert.strictEqual(await getUserVersion(db), LATEST_SCHEMA_VERSION);

    // Ejecución 3: Re-ejecuta una vez más
    await initDatabase(db);
    assert.strictEqual(await getUserVersion(db), LATEST_SCHEMA_VERSION);
  });
});
