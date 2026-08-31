# Migraciones de Base de Datos — Fase 2 & Fase 2.1: Tarjetas de Crédito

## 1. Esquema DDL Consolidado

```sql
-- Tablas del Motor de Tarjetas de Crédito
CREATE TABLE IF NOT EXISTS credit_cards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  card_brand TEXT NOT NULL,
  issuer_id TEXT NOT NULL DEFAULT 'generic',
  last_four_digits TEXT,
  credit_limit REAL NOT NULL,
  available_limit REAL NOT NULL,
  cut_off_day INTEGER NOT NULL,
  payment_due_day INTEGER NOT NULL,
  interest_rate_monthly REAL NOT NULL,
  late_interest_rate_monthly REAL NOT NULL DEFAULT 0,
  handling_fee REAL NOT NULL DEFAULT 0,
  positive_balance REAL NOT NULL DEFAULT 0,
  color_gradient_start TEXT NOT NULL,
  color_gradient_end TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'COP',
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS card_billing_cycles (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  cycle_month TEXT NOT NULL,
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
  is_opening_balance INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (card_id) REFERENCES credit_cards (id) ON DELETE CASCADE,
  FOREIGN KEY (billing_cycle_id) REFERENCES card_billing_cycles (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_payment_allocations (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  statement_id TEXT,
  card_id TEXT NOT NULL,
  total_paid REAL NOT NULL,
  collection_fee_applied REAL NOT NULL DEFAULT 0,
  late_interest_applied REAL NOT NULL DEFAULT 0,
  current_interest_applied REAL NOT NULL DEFAULT 0,
  taxes_and_fees_applied REAL NOT NULL DEFAULT 0,
  handling_fee_applied REAL NOT NULL DEFAULT 0,
  principal_applied REAL NOT NULL DEFAULT 0,
  statement_applied REAL NOT NULL DEFAULT 0,
  unbilled_applied REAL NOT NULL DEFAULT 0,
  minimum_applied REAL NOT NULL DEFAULT 0,
  overpayment REAL NOT NULL DEFAULT 0,
  is_estimated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES credit_cards (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_reconciliations (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  reconciliation_date TEXT NOT NULL,
  app_calculated_debt REAL NOT NULL,
  bank_reported_debt REAL NOT NULL,
  difference_amount REAL NOT NULL,
  difference_category TEXT NOT NULL DEFAULT 'capital',
  status TEXT NOT NULL DEFAULT 'applied',
  adjustment_transaction_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (card_id) REFERENCES credit_cards (id) ON DELETE CASCADE
);
```

## 2. Migraciones Idempotentes Ejecutadas en Inicialización

```typescript
// Migraciones añadidas en src/database/database.ts:
await db.runAsync('ALTER TABLE card_statements ADD COLUMN collection_fee REAL NOT NULL DEFAULT 0;').catch(() => {});
await db.runAsync('ALTER TABLE card_statements ADD COLUMN is_opening_balance INTEGER NOT NULL DEFAULT 0;').catch(() => {});
await db.runAsync('ALTER TABLE card_payment_allocations ADD COLUMN collection_fee_applied REAL NOT NULL DEFAULT 0;').catch(() => {});
await db.runAsync('ALTER TABLE card_payment_allocations ADD COLUMN statement_applied REAL NOT NULL DEFAULT 0;').catch(() => {});
await db.runAsync('ALTER TABLE card_payment_allocations ADD COLUMN unbilled_applied REAL NOT NULL DEFAULT 0;').catch(() => {});
await db.runAsync('ALTER TABLE card_payment_allocations ADD COLUMN minimum_applied REAL NOT NULL DEFAULT 0;').catch(() => {});
await db.runAsync('ALTER TABLE card_reconciliations ADD COLUMN difference_category TEXT NOT NULL DEFAULT \'capital\';').catch(() => {});
await db.runAsync('ALTER TABLE card_reconciliations ADD COLUMN status TEXT NOT NULL DEFAULT \'applied\';').catch(() => {});
```
