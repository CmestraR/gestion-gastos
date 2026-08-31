import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

import {
  evaluateTransactionEffects,
  calculateMonthlyConsumption,
  calculateMonthlyCashFlow,
  calculateConsolidatedNetWorth,
  calculateAccountCashMovement,
} from '../src/utils/financialCore.ts';

import {
  calculateMonthlyQuota,
  generateAmortizationSchedule,
  calculateCardCycleDates,
  convertEAToEM,
  calculateCardStatement,
} from '../src/utils/financialMath.ts';

import { setTestDatabase, initDatabase } from '../src/database/database.ts';
import { AccountRepository } from '../src/database/repositories/accountRepository.ts';
import { CardRepository } from '../src/database/repositories/cardRepository.ts';
import { TransactionRepository } from '../src/database/repositories/transactionRepository.ts';
import { CycleRepository } from '../src/database/repositories/cycleRepository.ts';
import { StatementRepository } from '../src/database/repositories/statementRepository.ts';
import { ReconciliationRepository } from '../src/database/repositories/reconciliationRepository.ts';
import {
  NuPolicy,
  BancolombiaPolicy,
  RappiCardPolicy,
  GenericPolicy,
  getIssuerPolicy,
} from '../src/utils/issuerPolicies/index.ts';

import type {
  Account,
  CreditCard,
  Transaction,
  CardPurchase,
  CardInstallment,
  CardStatement,
} from '../src/types/finance.ts';

/**
 * ADAPTADOR SQLITE REAL PARA PRUEBAS EN NODE.JS
 */
function createRealSqliteDb() {
  const syncDb = new DatabaseSync(':memory:');
  syncDb.exec('PRAGMA foreign_keys = ON;');

  const db = {
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

  return { db, syncDb };
}

async function setupTestDatabase() {
  const testDb = createRealSqliteDb();
  await initDatabase(testDb.db);
  return testDb;
}

describe('BATERÍA COMPLETA DE PRUEBAS — MOTOR FINANCIERO Y TARJETAS DE CRÉDITO (FASE 2 & FASE 2.1)', () => {
  // ==========================================
  // BLOQUE 1: PRUEBAS UNITARIAS [UNIT] (Fase 1 Base)
  // ==========================================
  describe('1. Pruebas Unitarias [UNIT] - Lógica y Matemática Pura', () => {
    test('U01. Ingreso ordinario aumenta activos, caja y patrimonio', () => {
      const tx: Transaction = {
        id: 'tx-inc-1',
        accountId: 'acc-bancolombia',
        type: 'income',
        amount: 2500000,
        categoryId: 'cat-salary',
        description: 'Salario Quincenal',
        date: '2026-08-25',
        createdAt: '2026-08-25T10:00:00Z',
      };
      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.cashInflow, 2500000);
      assert.strictEqual(effects.cashOutflow, 0);
      assert.strictEqual(effects.assetDelta, 2500000);
      assert.strictEqual(effects.liabilityDelta, 0);
      assert.strictEqual(effects.netWorthDelta, 2500000);
      assert.strictEqual(effects.consumption, 0);
    });

    test('U02. Gasto corriente disminuye activos, caja y patrimonio', () => {
      const tx: Transaction = {
        id: 'tx-exp-1',
        accountId: 'acc-bancolombia',
        type: 'expense',
        amount: 120000,
        categoryId: 'cat-groceries',
        description: 'Supermercado Éxito',
        date: '2026-08-25',
        createdAt: '2026-08-25T11:00:00Z',
      };
      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.cashInflow, 0);
      assert.strictEqual(effects.cashOutflow, 120000);
      assert.strictEqual(effects.assetDelta, -120000);
      assert.strictEqual(effects.liabilityDelta, 0);
      assert.strictEqual(effects.netWorthDelta, -120000);
      assert.strictEqual(effects.consumption, 120000);
    });

    test('U03. Transferencia entre cuentas es neutral en patrimonio', () => {
      const tx: Transaction = {
        id: 'tx-trf-1',
        accountId: 'acc-bancolombia',
        toAccountId: 'acc-nequi',
        type: 'transfer',
        amount: 500000,
        categoryId: 'cat-transfer',
        description: 'Transferencia a Nequi',
        date: '2026-08-25',
        createdAt: '2026-08-25T12:00:00Z',
      };
      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.cashInflow, 0);
      assert.strictEqual(effects.cashOutflow, 0);
      assert.strictEqual(effects.assetDelta, 0);
      assert.strictEqual(effects.liabilityDelta, 0);
      assert.strictEqual(effects.netWorthDelta, 0);
      assert.strictEqual(effects.consumption, 0);
    });

    test('U04. Compra con tarjeta de crédito aumenta pasivos y genera consumo', () => {
      const tx: Transaction = {
        id: 'tx-cp-1',
        cardId: 'card-nu',
        type: 'card_purchase',
        amount: 450000,
        categoryId: 'cat-appliances',
        description: 'Compra Nevera',
        date: '2026-08-25',
        createdAt: '2026-08-25T13:00:00Z',
      };
      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.cashInflow, 0);
      assert.strictEqual(effects.cashOutflow, 0);
      assert.strictEqual(effects.assetDelta, 0);
      assert.strictEqual(effects.liabilityDelta, 450000);
      assert.strictEqual(effects.netWorthDelta, -450000);
      assert.strictEqual(effects.consumption, 450000);
    });

    test('U05. Pago de tarjeta desglosa capital e interés', () => {
      const tx: Transaction = {
        id: 'tx-pay-1',
        accountId: 'acc-bancolombia',
        cardId: 'card-nu',
        type: 'card_payment',
        amount: 150000,
        principalAmount: 120000,
        interestAmount: 30000,
        categoryId: 'cat-credit-pay',
        description: 'Abono Tarjeta Nu',
        date: '2026-08-25',
        createdAt: '2026-08-25T14:00:00Z',
      };
      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.cashInflow, 0);
      assert.strictEqual(effects.cashOutflow, 150000);
      assert.strictEqual(effects.assetDelta, -150000);
      assert.strictEqual(effects.liabilityDelta, -150000);
      assert.strictEqual(effects.netWorthDelta, 0);
      assert.strictEqual(effects.consumption, 0);
    });

    test('U06. Saldo de apertura de tarjeta (card_opening_balance) es un pasivo inicial', () => {
      const tx: Transaction = {
        id: 'tx-open-1',
        cardId: 'card-nu',
        type: 'card_opening_balance',
        amount: 550000,
        principalAmount: 500000,
        interestAmount: 50000,
        categoryId: 'cat-financial',
        description: 'Saldo de Apertura Tarjeta',
        date: '2026-08-01',
        createdAt: '2026-08-01T00:00:00Z',
      };
      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.cashInflow, 0);
      assert.strictEqual(effects.cashOutflow, 0);
      assert.strictEqual(effects.assetDelta, 0);
      assert.strictEqual(effects.liabilityDelta, 550000);
      assert.strictEqual(effects.netWorthDelta, -550000);
      assert.strictEqual(effects.consumption, 0);
    });

    test('U07. Conversión de Tasa EA a EM (Fórmula Bancaria Colombiana)', () => {
      const ea = 28.5; // 28.5% EA
      const em = convertEAToEM(ea);
      // (1 + 0.285)^(1/12) - 1 = 2.11% aprox
      assert.strictEqual(Number(em.toFixed(2)), 2.11);
    });

    test('U08. Cuota fija francesa exacta con tasa 0% vs tasa positiva', () => {
      // Tasa 0%
      const q0 = calculateMonthlyQuota(1200000, 0, 12);
      assert.strictEqual(q0, 100000);

      // Tasa 2.0% EM a 12 meses
      const q1 = calculateMonthlyQuota(1000000, 2.0, 12);
      assert.strictEqual(Number(q1.toFixed(2)), 94559.60);
    });

    test('U09. Fechas de ciclo bancario (Día 15 corte, Día 5 pago)', () => {
      const cycle = calculateCardCycleDates(15, 5, new Date('2026-08-20'));
      assert.strictEqual(cycle.cutOffDate, '2026-08-15');
      assert.strictEqual(cycle.paymentDueDate, '2026-09-05');
      assert.strictEqual(cycle.isCutOffPassed, true);
    });
  });

  // ==========================================
  // BLOQUE 2: SUITE DE TARJETAS T01 A T30 (Fase 2 Base)
  // ==========================================
  describe('2. Batería de Tarjetas de Crédito [T01 a T30] en SQLite Real', () => {
    let testDb: { db: any; syncDb: DatabaseSync };

    beforeEach(async () => {
      testDb = await setupTestDatabase();
      setTestDatabase(testDb.db);

      // Crear cuentas y tarjetas de prueba
      await testDb.db.runAsync(
        `INSERT INTO accounts (id, name, bank_name, type, balance, initial_balance, currency, color, icon, is_archived, created_at)
         VALUES ('acc-1', 'Bancolombia Ahorros', 'Bancolombia', 'savings', 5000000, 5000000, 'COP', '#3B82F6', 'landmark', 0, '2026-08-01')`
      );

      await testDb.db.runAsync(
        `INSERT INTO credit_cards (
          id, name, bank_name, card_brand, issuer_id, credit_limit, available_limit,
          cut_off_day, payment_due_day, interest_rate_monthly, handling_fee, currency,
          color_gradient_start, color_gradient_end, is_archived, created_at
        ) VALUES 
        ('card-nu', 'Nu Morada', 'Nu Bank', 'mastercard', 'nu', 5000000, 5000000, 15, 5, 2.1, 0, 'COP', '#8B5CF6', '#6D28D9', 0, '2026-08-01'),
        ('card-bancolombia', 'Mastercard Black', 'Bancolombia', 'mastercard', 'bancolombia', 10000000, 10000000, 20, 10, 2.3, 25000, 'COP', '#1E293B', '#0F172A', 0, '2026-08-01'),
        ('card-rappi', 'RappiCard', 'Rappi', 'visa', 'rappicard', 3000000, 3000000, 10, 1, 2.2, 0, 'COP', '#F97316', '#EA580C', 0, '2026-08-01')`
      );
    });

    test('T01: Creación de compra con tarjeta reduce el cupo disponible', async () => {
      const schedule = generateAmortizationSchedule('purch-1', 1000000, 0, 10, new Date('2026-09-05'));
      await CardRepository.createPurchaseAtomic(
        {
          id: 'purch-1',
          cardId: 'card-nu',
          description: 'Celular Xiaomi',
          categoryId: 'cat-tech',
          amount: 1000000,
          installmentsTotal: 10,
          installmentsPaid: 0,
          monthlyInstallmentAmount: 100000,
          interestRateMonthly: 0,
          firstInstallmentDate: '2026-09-05',
          status: 'active',
          createdAt: '2026-08-25',
        },
        schedule
      );

      const card = await CardRepository.getById('card-nu');
      assert.strictEqual(card?.availableLimit, 4000000); // 5M - 1M = 4M
    });

    test('T02: Abono a tarjeta libera cupo únicamente por el capital pagado', async () => {
      // 1. Consumir 1M
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 4000000 WHERE id = ?', ['card-nu']);

      // 2. Realizar abono de 200.000 (Nu no cobra manejo/intereses si no están en extracto)
      await CardRepository.payCreditCardAtomic('card-nu', 'acc-1', 200000);

      const card = await CardRepository.getById('card-nu');
      assert.strictEqual(card?.availableLimit, 4200000);

      const acc = await AccountRepository.getById('acc-1');
      assert.strictEqual(acc?.balance, 4800000);
    });

    test('T24: Extracto pagado en su totalidad pasa a estado PAID', async () => {
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-nu', new Date('2026-08-15'));
      const stmt = await StatementRepository.createSnapshot({
        cardId: 'card-nu',
        billingCycleId: cycle.id,
        statementDate: '2026-08-15',
        dueDate: '2026-09-05',
        openingBalance: 0,
        purchasesTotal: 500000,
        advancesTotal: 0,
        principalTotal: 500000,
        currentInterest: 0,
        lateInterest: 0,
        handlingFee: 0,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 500000,
        minimumPaymentOriginal: 100000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      await StatementRepository.updateStatementPayment(stmt.id, 500000, 500000);
      const updated = await StatementRepository.getStatementById(stmt.id);
      assert.strictEqual(updated?.status, 'paid');
    });

    test('T25: Extracto vencido con saldo pendiente pasa a OVERDUE', async () => {
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-nu', new Date('2026-07-15'));
      const stmt = await StatementRepository.createSnapshot({
        cardId: 'card-nu',
        billingCycleId: cycle.id,
        statementDate: '2026-07-15',
        dueDate: '2026-08-05', // Pasado
        openingBalance: 0,
        purchasesTotal: 300000,
        advancesTotal: 0,
        principalTotal: 300000,
        currentInterest: 0,
        lateInterest: 0,
        handlingFee: 0,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 300000,
        minimumPaymentOriginal: 60000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      await StatementRepository.updateStatementPayment(stmt.id, 0, 0);
      const updated = await StatementRepository.getStatementById(stmt.id);
      assert.strictEqual(updated?.status, 'overdue');
    });

    test('T26: Rechazo de extracto duplicado para el mismo ciclo', async () => {
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-nu', new Date('2026-08-15'));
      await StatementRepository.createSnapshot({
        cardId: 'card-nu',
        billingCycleId: cycle.id,
        statementDate: '2026-08-15',
        dueDate: '2026-09-05',
        openingBalance: 0,
        purchasesTotal: 500000,
        advancesTotal: 0,
        principalTotal: 500000,
        currentInterest: 0,
        lateInterest: 0,
        handlingFee: 0,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 500000,
        minimumPaymentOriginal: 100000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      await assert.rejects(
        () =>
          StatementRepository.createSnapshot({
            cardId: 'card-nu',
            billingCycleId: cycle.id,
            statementDate: '2026-08-15',
            dueDate: '2026-09-05',
            openingBalance: 0,
            purchasesTotal: 500000,
            advancesTotal: 0,
            principalTotal: 500000,
            currentInterest: 0,
            lateInterest: 0,
            handlingFee: 0,
            taxesAndFees: 0,
            collectionFee: 0,
            totalStatementBalance: 500000,
            minimumPaymentOriginal: 100000,
            statementBalancePaid: 0,
            minimumPaymentPaid: 0,
            status: 'open',
          }),
        /Ya existe un extracto registrado para este ciclo/
      );
    });

    test('T27: Rechazo de pago superior a la deuda actual', async () => {
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 4800000 WHERE id = ?', ['card-nu']); // Deuda = 200.000

      await assert.rejects(
        () => CardRepository.payCreditCardAtomic('card-nu', 'acc-1', 300000),
        /no puede ser superior a la deuda actual/
      );
    });

    test('T30: Verificación estricta: Cupo liberado === Capital amortizado aplicado', async () => {
      const genericPolicy = new GenericPolicy();
      const res = genericPolicy.allocatePayment(100000, {
        creditLimit: 5000000,
        availableLimit: 4000000,
        totalStatementBalance: 500000,
        statementBalancePaid: 0,
        minimumPaymentOriginal: 100000,
        minimumPaymentPaid: 0,
        taxesAndFees: 0,
        handlingFee: 0,
        collectionFee: 0,
        lateInterest: 0,
        currentInterest: 25000,
        principalTotal: 475000,
        unbilledDebt: 0,
      });

      const cupoDelta = res.resultingAvailableLimit - 4000000;
      assert.strictEqual(cupoDelta, res.principalApplied);
      assert.strictEqual(cupoDelta, 75000);
    });
  });

  // ==========================================
  // BLOQUE 3: SUITE FASE 2.1 — CORRECCIONES DE INTEGRIDAD REAL [T31 a T46]
  // ==========================================
  describe('3. Batería de Integridad Contable Fase 2.1 [T31 a T46] en SQLite Real', () => {
    let testDb: { db: any; syncDb: DatabaseSync };

    beforeEach(async () => {
      testDb = await setupTestDatabase();
      setTestDatabase(testDb.db);

      await testDb.db.runAsync(
        `INSERT INTO accounts (id, name, bank_name, type, balance, initial_balance, currency, color, icon, is_archived, created_at)
         VALUES ('acc-main', 'Cuenta Principal', 'Bancolombia', 'savings', 10000000, 10000000, 'COP', '#3B82F6', 'landmark', 0, '2026-08-01')`
      );

      await testDb.db.runAsync(
        `INSERT INTO credit_cards (
          id, name, bank_name, card_brand, issuer_id, credit_limit, available_limit,
          cut_off_day, payment_due_day, interest_rate_monthly, handling_fee, currency,
          color_gradient_start, color_gradient_end, is_archived, created_at
        ) VALUES 
        ('card-test-1', 'Tarjeta Test 1', 'Banco Test', 'mastercard', 'generic', 2000000, 1500000, 15, 5, 2.0, 20000, 'COP', '#3B82F6', '#1D4ED8', 0, '2026-08-01'),
        ('card-rappi-2', 'RappiCard Test', 'Rappi', 'visa', 'rappicard', 5000000, 5000000, 10, 1, 2.2, 0, 'COP', '#F97316', '#EA580C', 0, '2026-08-01'),
        ('card-nu-2', 'Nu Test', 'Nu Bank', 'mastercard', 'nu', 3000000, 3000000, 15, 5, 2.1, 0, 'COP', '#8B5CF6', '#6D28D9', 0, '2026-08-01'),
        ('card-banco-2', 'Bancolombia Test', 'Bancolombia', 'mastercard', 'bancolombia', 4000000, 4000000, 20, 10, 2.3, 0, 'COP', '#1E293B', '#0F172A', 0, '2026-08-01')`
      );
    });

    test('T31: totalCurrentDebt = principalDebt + nonPrincipalDebt sin duplicar cargos', async () => {
      // Tarjeta con cupo 2M, disponible 1.5M -> principalDebt = 500.000
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-test-1', new Date('2026-08-15'));
      await StatementRepository.createSnapshot({
        cardId: 'card-test-1',
        billingCycleId: cycle.id,
        statementDate: '2026-08-15',
        dueDate: '2026-09-05',
        openingBalance: 0,
        purchasesTotal: 500000,
        advancesTotal: 0,
        principalTotal: 500000,
        currentInterest: 30000,
        lateInterest: 0,
        handlingFee: 20000,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 550000, // 500k capital + 50k no capital
        minimumPaymentOriginal: 100000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      const card = (await CardRepository.getById('card-test-1'))!;
      const summary = await CardRepository.getCardStatementSummary(card);

      assert.strictEqual(summary.principalDebt, 500000);
      assert.strictEqual(summary.nonPrincipalDebt, 50000);
      assert.strictEqual(summary.totalCurrentDebt, 550000);
    });

    test('T32: Consistencia matemática de los 3 saldos: TOTAL CURRENT DEBT = BILLED DEBT + UNBILLED DEBT', async () => {
      // Tarjeta con cupo 2M, disponible 1.2M -> principalDebt = 800.000
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 1200000 WHERE id = ?', ['card-test-1']);

      // Extracto facturado al corte por 500k capital + 50k cargos = 550k
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-test-1', new Date('2026-08-15'));
      await StatementRepository.createSnapshot({
        cardId: 'card-test-1',
        billingCycleId: cycle.id,
        statementDate: '2026-08-15',
        dueDate: '2026-09-05',
        openingBalance: 0,
        purchasesTotal: 500000,
        advancesTotal: 0,
        principalTotal: 500000,
        currentInterest: 30000,
        lateInterest: 0,
        handlingFee: 20000,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 550000,
        minimumPaymentOriginal: 100000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      const card = (await CardRepository.getById('card-test-1'))!;
      const summary = await CardRepository.getCardStatementSummary(card);

      assert.strictEqual(summary.principalDebt, 800000);
      assert.strictEqual(summary.nonPrincipalDebt, 50000);
      assert.strictEqual(summary.totalCurrentDebt, 850000);
      assert.strictEqual(summary.billedStatementDebtRemaining, 550000);
      assert.strictEqual(summary.unbilledDebt, 300000); // 800k - 500k = 300k
      assert.strictEqual(summary.totalCurrentDebt, summary.billedStatementDebtRemaining + summary.unbilledDebt);
    });

    test('T33: Detección de inconsistencia cuando billedStatementDebt > totalCurrentDebt sin clamping silencioso', async () => {
      // Simular que el usuario borró consumos en la app pero el extracto bancario quedó con 600.000
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 1800000 WHERE id = ?', ['card-test-1']); // principalDebt = 200.000

      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-test-1', new Date('2026-08-15'));
      await StatementRepository.createSnapshot({
        cardId: 'card-test-1',
        billingCycleId: cycle.id,
        statementDate: '2026-08-15',
        dueDate: '2026-09-05',
        openingBalance: 0,
        purchasesTotal: 600000,
        advancesTotal: 0,
        principalTotal: 600000,
        currentInterest: 0,
        lateInterest: 0,
        handlingFee: 0,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 600000,
        minimumPaymentOriginal: 100000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      const card = (await CardRepository.getById('card-test-1'))!;
      const summary = await CardRepository.getCardStatementSummary(card);

      assert.strictEqual(summary.hasInconsistency, true);
      assert.ok(summary.inconsistencyReason?.includes('Inconsistencia detectada'));
      assert.strictEqual(summary.billedStatementDebtRemaining, 600000);
      assert.strictEqual(summary.totalCurrentDebt, 200000);
    });

    test('T34: Separación explícita de billedPrincipalRemaining y unbilledPrincipalRemaining', async () => {
      // principalDebt = 700.000, extracto tiene 400.000 capital
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 1300000 WHERE id = ?', ['card-test-1']);

      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-test-1', new Date('2026-08-15'));
      await StatementRepository.createSnapshot({
        cardId: 'card-test-1',
        billingCycleId: cycle.id,
        statementDate: '2026-08-15',
        dueDate: '2026-09-05',
        openingBalance: 0,
        purchasesTotal: 400000,
        advancesTotal: 0,
        principalTotal: 400000,
        currentInterest: 20000,
        lateInterest: 0,
        handlingFee: 0,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 420000,
        minimumPaymentOriginal: 80000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      const card = (await CardRepository.getById('card-test-1'))!;
      const summary = await CardRepository.getCardStatementSummary(card);

      assert.strictEqual(summary.billedPrincipalRemaining, 400000);
      assert.strictEqual(summary.unbilledPrincipalRemaining, 300000); // 700k - 400k
      assert.strictEqual(summary.billedNonPrincipalRemaining, 20000);
    });

    test('T35: Saldo de Apertura (createOpeningBalanceSnapshot) audita transacción y reduce cupo por capital', async () => {
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-nu-2', new Date('2026-08-01'));
      const stmt = await StatementRepository.createOpeningBalanceSnapshot({
        cardId: 'card-nu-2',
        billingCycleId: cycle.id,
        statementDate: '2026-08-01',
        dueDate: '2026-08-20',
        principalTotal: 600000,
        interestAndFeesTotal: 40000,
        minimumPayment: 120000,
        notes: 'Apertura inicial histórica',
      });

      assert.strictEqual(stmt.isOpeningBalance, true);
      assert.strictEqual(stmt.totalStatementBalance, 640000);

      // Cupo inicial 3M - 600k capital = 2.4M
      const card = await CardRepository.getById('card-nu-2');
      assert.strictEqual(card?.availableLimit, 2400000);

      // Transacción registrada en libro mayor
      const txs = (await testDb.db.getAllAsync(
        "SELECT * FROM transactions WHERE card_id = ? AND type = 'card_opening_balance'",
        ['card-nu-2']
      )) as any[];
      assert.strictEqual(txs.length, 1);
      assert.strictEqual(txs[0].amount, 640000);
      assert.strictEqual(txs[0].principal_amount, 600000);
      assert.strictEqual(txs[0].interest_amount, 40000);
    });

    test('T36: Bloqueo estricto de un segundo Opening Balance para la misma tarjeta', async () => {
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-nu-2', new Date('2026-08-01'));
      await StatementRepository.createOpeningBalanceSnapshot({
        cardId: 'card-nu-2',
        billingCycleId: cycle.id,
        statementDate: '2026-08-01',
        dueDate: '2026-08-20',
        principalTotal: 400000,
        interestAndFeesTotal: 20000,
      });

      await assert.rejects(
        () =>
          StatementRepository.createOpeningBalanceSnapshot({
            cardId: 'card-nu-2',
            billingCycleId: cycle.id,
            statementDate: '2026-08-01',
            dueDate: '2026-08-20',
            principalTotal: 100000,
            interestAndFeesTotal: 10000,
          }),
        /ya cuenta con un Saldo de Apertura inicial registrado/
      );
    });

    test('T37: Payment allocations acumulativas descuentan conceptos pendientes reales en abonos sucesivos', async () => {
      // Tarjeta con cupo 2M, consumida 1M capital -> disponible = 1M
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 1000000 WHERE id = ?', ['card-test-1']);
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-test-1', new Date('2026-08-15'));
      const stmt = await StatementRepository.createSnapshot({
        cardId: 'card-test-1',
        billingCycleId: cycle.id,
        statementDate: '2026-08-15',
        dueDate: '2026-09-05',
        openingBalance: 0,
        purchasesTotal: 1000000,
        advancesTotal: 0,
        principalTotal: 1000000,
        currentInterest: 50000,
        lateInterest: 20000,
        handlingFee: 10000,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 1080000,
        minimumPaymentOriginal: 200000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      // Abono 1: $30.000 -> Debe cubrir Mora ($20k) e Interés Corriente ($10k)
      const alloc1 = await CardRepository.payCreditCardAtomic('card-test-1', 'acc-main', 30000, stmt.id);
      assert.strictEqual(alloc1.lateInterestApplied, 20000);
      assert.strictEqual(alloc1.currentInterestApplied, 10000);
      assert.strictEqual(alloc1.principalApplied, 0);

      // Abono 2: $60.000 -> Debe cubrir resto de Interés ($40k), Manejo ($10k) y Capital ($10k)
      const alloc2 = await CardRepository.payCreditCardAtomic('card-test-1', 'acc-main', 60000, stmt.id);
      assert.strictEqual(alloc2.lateInterestApplied, 0);
      assert.strictEqual(alloc2.currentInterestApplied, 40000);
      assert.strictEqual(alloc2.handlingFeeApplied, 10000);
      assert.strictEqual(alloc2.principalApplied, 10000);

      // Verificación de saldo pendiente
      const pending = await StatementRepository.getPendingConcepts(stmt.id);
      assert.strictEqual(pending.remainingLateInterest, 0);
      assert.strictEqual(pending.remainingCurrentInterest, 0);
      assert.strictEqual(pending.remainingHandlingFee, 0);
      assert.strictEqual(pending.remainingPrincipal, 990000);
      assert.strictEqual(pending.remainingStatementBalance, 990000);
    });

    test('T38: RappiCard Policy aplica prelación con Collection Fee en primer orden', () => {
      const rappiPolicy = new RappiCardPolicy();
      const res = rappiPolicy.allocatePayment(100000, {
        creditLimit: 5000000,
        availableLimit: 4000000,
        totalStatementBalance: 500000,
        statementBalancePaid: 0,
        minimumPaymentOriginal: 100000,
        minimumPaymentPaid: 0,
        collectionFee: 20000,
        lateInterest: 15000,
        currentInterest: 25000,
        taxesAndFees: 5000,
        handlingFee: 0,
        principalTotal: 435000,
        unbilledDebt: 0,
      });

      // 1. Cobranza (20k), 2. Mora (15k), 3. Corriente (25k), 4. Impuestos (5k) = 65k cargos.
      // Excedente a Capital = 35k
      assert.strictEqual(res.collectionFeeApplied, 20000);
      assert.strictEqual(res.lateInterestApplied, 15000);
      assert.strictEqual(res.currentInterestApplied, 25000);
      assert.strictEqual(res.taxesAndFeesApplied, 5000);
      assert.strictEqual(res.principalApplied, 35000);
      assert.strictEqual(res.isEstimated, false);
    });

    test('T39: Bancolombia Policy marca isEstimated = true y rechaza pagos dirigidos', () => {
      const bancoPolicy = new BancolombiaPolicy();
      assert.strictEqual(bancoPolicy.isEstimated, true);
      assert.strictEqual(bancoPolicy.supportsDirectedPayment, false);

      assert.throws(
        () =>
          bancoPolicy.allocatePayment(
            50000,
            {
              creditLimit: 5000000,
              availableLimit: 4000000,
              totalStatementBalance: 500000,
              statementBalancePaid: 0,
              minimumPaymentOriginal: 100000,
              minimumPaymentPaid: 0,
              taxesAndFees: 0,
              handlingFee: 0,
              collectionFee: 0,
              lateInterest: 0,
              currentInterest: 0,
              principalTotal: 500000,
              unbilledDebt: 0,
            },
            { isDirected: true, targetPurchaseId: 'purch-1' }
          ),
        /Bancolombia no permite dirigir abonos/
      );
    });

    test('T40: Nu Policy declara supportsDirectedPayment = false y aplica prelación global', () => {
      const nuPolicy = new NuPolicy();
      assert.strictEqual(nuPolicy.supportsDirectedPayment, false);

      const res = nuPolicy.allocatePayment(80000, {
        creditLimit: 3000000,
        availableLimit: 2500000,
        totalStatementBalance: 200000,
        statementBalancePaid: 0,
        minimumPaymentOriginal: 50000,
        minimumPaymentPaid: 0,
        taxesAndFees: 0,
        handlingFee: 0,
        collectionFee: 0,
        lateInterest: 0,
        currentInterest: 10000,
        principalTotal: 190000,
        unbilledDebt: 300000,
      });

      assert.strictEqual(res.currentInterestApplied, 10000);
      assert.strictEqual(res.principalApplied, 70000);
      assert.strictEqual(res.statementApplied, 80000);
      assert.strictEqual(res.unbilledApplied, 0);
    });

    test('T41: Imputación de pago divide statement_applied y unbilled_applied cuando el pago supera el extracto', async () => {
      // Deuda total = 800k (500k en extracto + 300k no facturados) -> disponible = 1.2M (2M - 800k)
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 1200000 WHERE id = ?', ['card-test-1']);
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-test-1', new Date('2026-08-15'));
      const stmt = await StatementRepository.createSnapshot({
        cardId: 'card-test-1',
        billingCycleId: cycle.id,
        statementDate: '2026-08-15',
        dueDate: '2026-09-05',
        openingBalance: 0,
        purchasesTotal: 500000,
        advancesTotal: 0,
        principalTotal: 500000,
        currentInterest: 0,
        lateInterest: 0,
        handlingFee: 0,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 500000,
        minimumPaymentOriginal: 100000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      // Abono de 600.000 (500k al extracto + 100k a deuda no facturada)
      const alloc = await CardRepository.payCreditCardAtomic('card-test-1', 'acc-main', 600000, stmt.id);

      assert.strictEqual(alloc.statementApplied, 500000);
      assert.strictEqual(alloc.unbilledApplied, 100000);
      assert.strictEqual(alloc.principalApplied, 600000);

      // Extracto debe quedar pagado exactamente en 500k (no 600k)
      const updatedStmt = await StatementRepository.getStatementById(stmt.id);
      assert.strictEqual(updatedStmt?.statementBalancePaid, 500000);
      assert.strictEqual(updatedStmt?.status, 'paid');
    });

    test('T42: Reversión determinista de pago de tarjeta usando statement_applied y principal_applied', async () => {
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 1200000 WHERE id = ?', ['card-test-1']);
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-test-1', new Date('2026-08-15'));
      const stmt = await StatementRepository.createSnapshot({
        cardId: 'card-test-1',
        billingCycleId: cycle.id,
        statementDate: '2026-08-15',
        dueDate: '2026-09-05',
        openingBalance: 0,
        purchasesTotal: 500000,
        advancesTotal: 0,
        principalTotal: 500000,
        currentInterest: 0,
        lateInterest: 0,
        handlingFee: 0,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 500000,
        minimumPaymentOriginal: 100000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      const alloc = await CardRepository.payCreditCardAtomic('card-test-1', 'acc-main', 600000, stmt.id);
      assert.strictEqual(alloc.statementApplied, 500000);

      // Revertir pago eliminando la transacción
      await TransactionRepository.delete(alloc.transactionId);

      // Cupo disponible debe volver a 1.2M
      const card = await CardRepository.getById('card-test-1');
      assert.strictEqual(card?.availableLimit, 1200000);

      // Extracto debe volver a statementBalancePaid = 0 y status = open
      const revertedStmt = await StatementRepository.getStatementById(stmt.id);
      assert.strictEqual(revertedStmt?.statementBalancePaid, 0);
      assert.strictEqual(revertedStmt?.status, 'open');
    });

    test('T43: Reversión de card_opening_balance restaura cupo y elimina extracto asociado', async () => {
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-nu-2', new Date('2026-08-01'));
      const stmt = await StatementRepository.createOpeningBalanceSnapshot({
        cardId: 'card-nu-2',
        billingCycleId: cycle.id,
        statementDate: '2026-08-01',
        dueDate: '2026-08-20',
        principalTotal: 500000,
        interestAndFeesTotal: 30000,
      });

      const txs = (await testDb.db.getAllAsync(
        "SELECT * FROM transactions WHERE card_id = ? AND type = 'card_opening_balance'",
        ['card-nu-2']
      )) as any[];
      assert.strictEqual(txs.length, 1);

      // Eliminar transacción de apertura
      await TransactionRepository.delete(txs[0].id);

      // Cupo debe volver a 3.000.000
      const card = await CardRepository.getById('card-nu-2');
      assert.strictEqual(card?.availableLimit, 3000000);

      // Extracto de apertura debe ser eliminado
      const deletedStmt = await StatementRepository.getStatementById(stmt.id);
      assert.strictEqual(deletedStmt, null);
    });

    test('T44: Conciliación de Capital (differenceCategory = "capital") modifica available_limit', async () => {
      // Cupo 4M, disponible 4M. Discrepancia de capital: banco reporta 200k de deuda no registrada
      await ReconciliationRepository.createReconciliation({
        id: 'rec-cap-1',
        cardId: 'card-banco-2',
        reconciliationDate: '2026-08-25',
        appCalculatedDebt: 0,
        bankReportedDebt: 200000,
        differenceAmount: 200000,
        differenceCategory: 'capital',
        notes: 'Compra en gasolinera no registrada',
        createdAt: '2026-08-25',
      });

      const card = await CardRepository.getById('card-banco-2');
      assert.strictEqual(card?.availableLimit, 3800000); // 4M - 200k
    });

    test('T45: Conciliación no capital (differenceCategory = "fees" | "interest") NO modifica cupo pero suma a nonPrincipalDebt', async () => {
      // Cupo 4M, disponible 4M. Discrepancia de intereses/comisiones del banco: 35.000
      await ReconciliationRepository.createReconciliation({
        id: 'rec-fee-1',
        cardId: 'card-banco-2',
        reconciliationDate: '2026-08-25',
        appCalculatedDebt: 0,
        bankReportedDebt: 35000,
        differenceAmount: 35000,
        differenceCategory: 'fees',
        notes: 'Seguro de vida asociado a la tarjeta',
        createdAt: '2026-08-25',
      });

      const card = (await CardRepository.getById('card-banco-2'))!;
      assert.strictEqual(card.availableLimit, 4000000); // Cupo intacto

      const summary = await CardRepository.getCardStatementSummary(card);
      assert.strictEqual(summary.principalDebt, 0);
      assert.strictEqual(summary.nonPrincipalDebt, 35000);
      assert.strictEqual(summary.totalCurrentDebt, 35000);
    });

    test('T46: Conciliación sin clasificar (differenceCategory = "unclassified") queda pendiente y luego se clasifica', async () => {
      // Conciliación con diferencia no clasificada
      await ReconciliationRepository.createReconciliation({
        id: 'rec-unclass-1',
        cardId: 'card-banco-2',
        reconciliationDate: '2026-08-25',
        appCalculatedDebt: 0,
        bankReportedDebt: 50000,
        differenceAmount: 50000,
        differenceCategory: 'unclassified',
        createdAt: '2026-08-25',
      });

      const card = (await CardRepository.getById('card-banco-2'))!;
      assert.strictEqual(card.availableLimit, 4000000); // No afecta cupo

      const recs = await ReconciliationRepository.getReconciliationsForCard('card-banco-2');
      const rec = recs.find((r) => r.id === 'rec-unclass-1');
      assert.strictEqual(rec?.status, 'pending_review');

      // Clasificación posterior como capital
      await ReconciliationRepository.classifyReconciliation('rec-unclass-1', 'capital', 'Confirmado que fue compra');

      const updatedCard = await CardRepository.getById('card-banco-2');
      assert.strictEqual(updatedCard?.availableLimit, 3950000); // 4M - 50k

      const updatedRecs = await ReconciliationRepository.getReconciliationsForCard('card-banco-2');
      const updatedRec = updatedRecs.find((r) => r.id === 'rec-unclass-1');
      assert.strictEqual(updatedRec?.status, 'applied');
      assert.strictEqual(updatedRec?.differenceCategory, 'capital');
    });
  });
});
