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

    test('T03: Compra con múltiples cuotas genera cuotas en card_installments', async () => {
      const schedule = generateAmortizationSchedule('purch-t03', 600000, 2.0, 6, new Date('2026-09-10'));
      await CardRepository.createPurchaseAtomic(
        {
          id: 'purch-t03',
          cardId: 'card-bancolombia',
          description: 'Televisor Samsung',
          categoryId: 'cat-tech',
          amount: 600000,
          installmentsTotal: 6,
          installmentsPaid: 0,
          monthlyInstallmentAmount: schedule[0].totalAmount,
          interestRateMonthly: 2.0,
          firstInstallmentDate: '2026-09-10',
          status: 'active',
          createdAt: '2026-08-25',
        },
        schedule
      );

      const installments = (await testDb.db.getAllAsync(
        'SELECT id, installment_number FROM card_installments WHERE purchase_id = ? ORDER BY installment_number ASC',
        ['purch-t03']
      )) as Array<{ id: string; installment_number: number }>;
      assert.strictEqual(installments.length, 6);
      assert.strictEqual(installments[0].installment_number, 1);
      assert.strictEqual(installments[5].installment_number, 6);
    });

    test('T04: Compra en 1 cuota sin intereses (tasa 0%) liquida cuota única', () => {
      const schedule = generateAmortizationSchedule('purch-t04', 150000, 0, 1, new Date('2026-09-05'));
      assert.strictEqual(schedule.length, 1);
      assert.strictEqual(schedule[0].principalAmount, 150000);
      assert.strictEqual(schedule[0].interestAmount, 0);
      assert.strictEqual(schedule[0].totalAmount, 150000);
    });

    test('T05: Cálculo de intereses corrientes en compra diferida con tasa positiva', () => {
      const quota = calculateMonthlyQuota(1000000, 2.1, 12);
      const schedule = generateAmortizationSchedule('purch-t05', 1000000, 2.1, 12, new Date('2026-09-05'));
      assert.strictEqual(schedule.length, 12);
      // Mes 1: Interés = 1.000.000 * 2.1% = 21.000
      assert.strictEqual(Math.round(schedule[0].interestAmount), 21000);
      assert.strictEqual(Math.round(schedule[0].principalAmount + schedule[0].interestAmount), Math.round(quota));
    });

    test('T06: Consulta de compras activas por tarjeta (getPurchasesForCard)', async () => {
      const schedule = generateAmortizationSchedule('purch-t06', 300000, 0, 3, new Date('2026-09-05'));
      await CardRepository.createPurchaseAtomic(
        {
          id: 'purch-t06',
          cardId: 'card-nu',
          description: 'Zapatos Deportivos',
          categoryId: 'cat-fashion',
          amount: 300000,
          installmentsTotal: 3,
          installmentsPaid: 0,
          monthlyInstallmentAmount: 100000,
          interestRateMonthly: 0,
          firstInstallmentDate: '2026-09-05',
          status: 'active',
          createdAt: '2026-08-25',
        },
        schedule
      );

      const purchases = await CardRepository.getPurchasesForCard('card-nu');
      const found = purchases.find((p) => p.id === 'purch-t06');
      assert.ok(found);
      assert.strictEqual(found.amount, 300000);
      assert.strictEqual(found.status, 'active');
    });

    test('T07: Eliminación de compra sin cuotas pagadas restaura el cupo disponible', async () => {
      const schedule = generateAmortizationSchedule('purch-t07', 500000, 0, 5, new Date('2026-09-05'));
      await CardRepository.createPurchaseAtomic(
        {
          id: 'purch-t07',
          cardId: 'card-nu',
          description: 'Bicicleta',
          categoryId: 'cat-sport',
          amount: 500000,
          installmentsTotal: 5,
          installmentsPaid: 0,
          monthlyInstallmentAmount: 100000,
          interestRateMonthly: 0,
          firstInstallmentDate: '2026-09-05',
          status: 'active',
          createdAt: '2026-08-25',
        },
        schedule
      );

      const txs = await TransactionRepository.getAll({ cardId: 'card-nu', type: 'card_purchase' });
      const tx = txs.find((t) => t.cardPurchaseId === 'purch-t07')!;

      await TransactionRepository.delete(tx.id);

      const card = await CardRepository.getById('card-nu');
      assert.strictEqual(card?.availableLimit, 5000000); // 5M restaurado
    });

    test('T08: Rechazo de eliminación directa de compra con cuotas pagadas', async () => {
      const schedule = generateAmortizationSchedule('purch-t08', 400000, 0, 4, new Date('2026-09-05'));
      await CardRepository.createPurchaseAtomic(
        {
          id: 'purch-t08',
          cardId: 'card-nu',
          description: 'Monitor Dell',
          categoryId: 'cat-tech',
          amount: 400000,
          installmentsTotal: 4,
          installmentsPaid: 1, // Ya tiene una cuota pagada
          monthlyInstallmentAmount: 100000,
          interestRateMonthly: 0,
          firstInstallmentDate: '2026-09-05',
          status: 'active',
          createdAt: '2026-08-25',
        },
        schedule
      );

      const txs = await TransactionRepository.getAll({ cardId: 'card-nu', type: 'card_purchase' });
      const tx = txs.find((t) => t.cardPurchaseId === 'purch-t08')!;

      await assert.rejects(
        () => TransactionRepository.delete(tx.id),
        /Esta compra tiene cuotas pagadas y movimientos relacionados/
      );
    });

    test('T09: Generación de ciclo de facturación automático (getOrCreateCurrentCycle)', async () => {
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-nu', new Date('2026-08-10'));
      assert.ok(cycle.id);
      assert.strictEqual(cycle.cardId, 'card-nu');
      assert.strictEqual(cycle.cutOffDate, '2026-08-15');
      assert.strictEqual(cycle.paymentDueDate, '2026-09-05');
    });

    test('T10: Ciclo de facturación con fechas de corte y pago correctas', () => {
      const cycleDates = calculateCardCycleDates(20, 10, new Date('2026-08-15'));
      assert.strictEqual(cycleDates.cutOffDate, '2026-08-20');
      assert.strictEqual(cycleDates.paymentDueDate, '2026-09-10');
      assert.strictEqual(cycleDates.isCutOffPassed, false);
    });

    test('T11: Creación de extracto manual (is_manual_snapshot = 1)', async () => {
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-bancolombia', new Date('2026-08-20'));
      const stmt = await StatementRepository.createSnapshot({
        cardId: 'card-bancolombia',
        billingCycleId: cycle.id,
        statementDate: '2026-08-20',
        dueDate: '2026-09-10',
        openingBalance: 0,
        purchasesTotal: 800000,
        advancesTotal: 0,
        principalTotal: 800000,
        currentInterest: 15000,
        lateInterest: 0,
        handlingFee: 25000,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 840000,
        minimumPaymentOriginal: 120000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
        isManualSnapshot: true,
        notes: 'Extracto Manual Agosto',
      });

      assert.strictEqual(stmt.isManualSnapshot, true);
      assert.strictEqual(stmt.totalStatementBalance, 840000);
    });

    test('T12: Inmutabilidad de total_statement_balance en extractos', async () => {
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-nu', new Date('2026-08-15'));
      const stmt = await StatementRepository.createSnapshot({
        cardId: 'card-nu',
        billingCycleId: cycle.id,
        statementDate: '2026-08-15',
        dueDate: '2026-09-05',
        openingBalance: 0,
        purchasesTotal: 350000,
        advancesTotal: 0,
        principalTotal: 350000,
        currentInterest: 0,
        lateInterest: 0,
        handlingFee: 0,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 350000,
        minimumPaymentOriginal: 70000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      // Realizar abono de 100.000
      await StatementRepository.updateStatementPayment(stmt.id, 100000, 70000);
      const updated = await StatementRepository.getStatementById(stmt.id);

      assert.strictEqual(updated?.totalStatementBalance, 350000); // INMUTABLE
      assert.strictEqual(updated?.statementBalancePaid, 100000);
    });

    test('T13: Pago parcial de extracto actualiza statement_balance_paid y minimum_payment_paid', async () => {
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-nu', new Date('2026-08-15'));
      const stmt = await StatementRepository.createSnapshot({
        cardId: 'card-nu',
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

      await StatementRepository.updateStatementPayment(stmt.id, 200000, 100000);
      const updated = await StatementRepository.getStatementById(stmt.id);

      assert.strictEqual(updated?.statementBalancePaid, 200000);
      assert.strictEqual(updated?.minimumPaymentPaid, 100000);
      assert.strictEqual(updated?.status, 'minimum_covered');
    });

    test('T14: Pago mínimo exacto deja el extracto como open/minimum_covered', async () => {
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
        minimumPaymentOriginal: 50000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      await StatementRepository.updateStatementPayment(stmt.id, 50000, 50000);
      const updated = await StatementRepository.getStatementById(stmt.id);
      assert.strictEqual(updated?.status, 'minimum_covered');
      assert.strictEqual(updated?.statementBalancePaid, 50000);
    });

    test('T15: Actualización de cuotas pagadas (installments_paid) al abonar a una compra', async () => {
      const schedule = generateAmortizationSchedule('purch-t15', 300000, 0, 3, new Date('2026-09-05'));
      await CardRepository.createPurchaseAtomic(
        {
          id: 'purch-t15',
          cardId: 'card-nu',
          description: 'Ropa Zara',
          categoryId: 'cat-fashion',
          amount: 300000,
          installmentsTotal: 3,
          installmentsPaid: 0,
          monthlyInstallmentAmount: 100000,
          interestRateMonthly: 0,
          firstInstallmentDate: '2026-09-05',
          status: 'active',
          createdAt: '2026-08-25',
        },
        schedule
      );

      // Simular pago de 1 cuota en la compra
      await testDb.db.runAsync('UPDATE card_purchases SET installments_paid = 1 WHERE id = ?', ['purch-t15']);
      const updatedPurch = (await CardRepository.getPurchasesForCard('card-nu')).find((p) => p.id === 'purch-t15');
      assert.strictEqual(updatedPurch?.installmentsPaid, 1);
    });

    test('T16: Transición de compra a paid cuando todas las cuotas son canceladas', async () => {
      const schedule = generateAmortizationSchedule('purch-t16', 200000, 0, 2, new Date('2026-09-05'));
      await CardRepository.createPurchaseAtomic(
        {
          id: 'purch-t16',
          cardId: 'card-nu',
          description: 'Cafetera',
          categoryId: 'cat-home',
          amount: 200000,
          installmentsTotal: 2,
          installmentsPaid: 0,
          monthlyInstallmentAmount: 100000,
          interestRateMonthly: 0,
          firstInstallmentDate: '2026-09-05',
          status: 'active',
          createdAt: '2026-08-25',
        },
        schedule
      );

      await testDb.db.runAsync("UPDATE card_purchases SET installments_paid = 2, status = 'paid' WHERE id = ?", ['purch-t16']);
      const activePurchases = await CardRepository.getPurchasesForCard('card-nu');
      assert.strictEqual(activePurchases.some((p) => p.id === 'purch-t16'), false);
    });

    test('T17: Generación de tabla de amortización francesa para compra con intereses', () => {
      const schedule = generateAmortizationSchedule('purch-t17', 1200000, 2.0, 12, new Date('2026-09-05'));
      assert.strictEqual(schedule.length, 12);
      const totalPrincipal = schedule.reduce((sum, item) => sum + item.principalAmount, 0);
      assert.strictEqual(Math.round(totalPrincipal), 1200000);
    });

    test('T18: Transacción de compra (card_purchase) registrada con type = "card_purchase" en transactions', async () => {
      const schedule = generateAmortizationSchedule('purch-t18', 250000, 0, 1, new Date('2026-09-05'));
      await CardRepository.createPurchaseAtomic(
        {
          id: 'purch-t18',
          cardId: 'card-nu',
          description: 'Audífonos Bluetooth',
          categoryId: 'cat-tech',
          amount: 250000,
          installmentsTotal: 1,
          installmentsPaid: 0,
          monthlyInstallmentAmount: 250000,
          interestRateMonthly: 0,
          firstInstallmentDate: '2026-09-05',
          status: 'active',
          createdAt: '2026-08-25',
        },
        schedule
      );

      const txs = await TransactionRepository.getAll({ cardId: 'card-nu', type: 'card_purchase' });
      assert.strictEqual(txs.length, 1);
      assert.strictEqual(txs[0].amount, 250000);
      assert.strictEqual(txs[0].type, 'card_purchase');
    });

    test('T19: Transacción de pago (card_payment) descuenta saldo de la cuenta de origen', async () => {
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 4500000 WHERE id = ?', ['card-nu']);
      const accBefore = (await AccountRepository.getById('acc-1'))!;

      await CardRepository.payCreditCardAtomic('card-nu', 'acc-1', 300000);

      const accAfter = (await AccountRepository.getById('acc-1'))!;
      assert.strictEqual(accAfter.balance, accBefore.balance - 300000);
    });

    test('T20: Validación: cuenta de origen debe tener saldo suficiente para el pago de tarjeta', async () => {
      await testDb.db.runAsync('UPDATE accounts SET balance = 50000 WHERE id = ?', ['acc-1']);
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 4000000 WHERE id = ?', ['card-nu']);

      await assert.rejects(
        () => CardRepository.payCreditCardAtomic('card-nu', 'acc-1', 200000),
        /no tiene saldo suficiente/
      );
    });

    test('T21: Prelación genérica: Pago abona intereses antes de amortizar capital', () => {
      const genericPolicy = new GenericPolicy();
      const res = genericPolicy.allocatePayment(100000, {
        creditLimit: 5000000,
        availableLimit: 4000000,
        totalStatementBalance: 300000,
        statementBalancePaid: 0,
        minimumPaymentOriginal: 60000,
        minimumPaymentPaid: 0,
        taxesAndFees: 0,
        handlingFee: 0,
        collectionFee: 0,
        lateInterest: 0,
        currentInterest: 30000,
        principalTotal: 270000,
        unbilledDebt: 0,
      });

      assert.strictEqual(res.currentInterestApplied, 30000);
      assert.strictEqual(res.principalApplied, 70000);
      assert.strictEqual(res.totalPayment, 100000);
    });

    test('T22: Pago total del extracto cubre el 100% de los intereses y capital facturados', () => {
      const nuPolicy = new NuPolicy();
      const res = nuPolicy.allocatePayment(450000, {
        creditLimit: 5000000,
        availableLimit: 4550000,
        totalStatementBalance: 450000,
        statementBalancePaid: 0,
        minimumPaymentOriginal: 100000,
        minimumPaymentPaid: 0,
        taxesAndFees: 0,
        handlingFee: 0,
        collectionFee: 0,
        lateInterest: 0,
        currentInterest: 20000,
        principalTotal: 430000,
        unbilledDebt: 0,
      });

      assert.strictEqual(res.currentInterestApplied, 20000);
      assert.strictEqual(res.principalApplied, 430000);
      assert.strictEqual(res.statementApplied, 450000);
    });

    test('T23: Pago con excedente sobre el extracto amortiza compras post-corte (unbilled_applied)', () => {
      const nuPolicy = new NuPolicy();
      const res = nuPolicy.allocatePayment(600000, {
        creditLimit: 5000000,
        availableLimit: 4000000, // Deuda capital = 1.000.000
        totalStatementBalance: 400000,
        statementBalancePaid: 0,
        minimumPaymentOriginal: 80000,
        minimumPaymentPaid: 0,
        taxesAndFees: 0,
        handlingFee: 0,
        collectionFee: 0,
        lateInterest: 0,
        currentInterest: 0,
        principalTotal: 400000,
        unbilledDebt: 600000,
        billedPrincipalRemaining: 400000,
        unbilledPrincipalRemaining: 600000,
      });

      assert.strictEqual(res.statementApplied, 400000);
      assert.strictEqual(res.unbilledApplied, 200000);
      assert.strictEqual(res.principalApplied, 600000);
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

    test('T28: getCardStatementSummary con tarjeta sin movimientos reporta saldos en 0 y cupo 100% disponible', async () => {
      const card = (await CardRepository.getById('card-rappi'))!;
      const summary = await CardRepository.getCardStatementSummary(card);
      assert.strictEqual(summary.principalDebt, 0);
      assert.strictEqual(summary.nonPrincipalDebt, 0);
      assert.strictEqual(summary.totalCurrentDebt, 0);
      assert.strictEqual(summary.billedStatementDebtRemaining, 0);
      assert.strictEqual(summary.unbilledDebt, 0);
    });

    test('T29: getCardStatementSummary con compras activas calcula principalDebt exacto', async () => {
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 2200000 WHERE id = ?', ['card-rappi']); // 3M - 800k = 2.2M
      const card = (await CardRepository.getById('card-rappi'))!;
      const summary = await CardRepository.getCardStatementSummary(card);
      assert.strictEqual(summary.principalDebt, 800000);
      assert.strictEqual(summary.totalCurrentDebt, 800000);
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

    // ==========================================
    // BLOQUE 5: PARCHE FINAL PUBLICACIÓN (FASE 2.2: T47 a T55)
    // ==========================================
    test('T47 — Conciliación no principal + pago total', async () => {
      // Tarjeta cupo 5M, disponible 4.5M (capital pendiente 500k)
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 4500000 WHERE id = ?', ['card-rappi-2']);

      // Conciliación: fees 35k
      await ReconciliationRepository.createReconciliation({
        id: 'rec-fee-t47',
        cardId: 'card-rappi-2',
        reconciliationDate: '2026-08-25',
        appCalculatedDebt: 500000,
        bankReportedDebt: 535000,
        differenceAmount: 35000,
        differenceCategory: 'fees',
        notes: 'Comisión anual bancaria',
        createdAt: '2026-08-25T10:00:00Z',
      });

      const cardBefore = (await CardRepository.getById('card-rappi-2'))!;
      const summaryBefore = await CardRepository.getCardStatementSummary(cardBefore);
      assert.strictEqual(summaryBefore.principalDebt, 500000);
      assert.strictEqual(summaryBefore.nonPrincipalDebt, 35000);
      assert.strictEqual(summaryBefore.totalCurrentDebt, 535000);

      // Pago: 535k
      const alloc = await CardRepository.payCreditCardAtomic('card-rappi-2', 'acc-main', 535000);

      assert.strictEqual(alloc.principalApplied, 500000);
      assert.strictEqual(alloc.handlingFeeApplied, 0); // Facturado puro es 0
      assert.strictEqual(alloc.unbilledApplied, 535000); // 500k capital no facturado + 35k comisión no facturada
      assert.strictEqual(alloc.totalPayment, 535000);

      const cardAfter = (await CardRepository.getById('card-rappi-2'))!;
      assert.strictEqual(cardAfter.availableLimit, 5000000); // 100% disponible (5M)

      const summaryAfter = await CardRepository.getCardStatementSummary(cardAfter);
      assert.strictEqual(summaryAfter.principalDebt, 0);
      assert.strictEqual(summaryAfter.nonPrincipalDebt, 0);
      assert.strictEqual(summaryAfter.totalCurrentDebt, 0);
    });

    test('T48 — Pago parcial de conciliación no principal', async () => {
      // Tarjeta cupo 5M, disponible 5M (capital pendiente 0)
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 5000000 WHERE id = ?', ['card-rappi-2']);

      // Conciliación: fees 50k
      await ReconciliationRepository.createReconciliation({
        id: 'rec-fee-t48',
        cardId: 'card-rappi-2',
        reconciliationDate: '2026-08-25',
        appCalculatedDebt: 0,
        bankReportedDebt: 50000,
        differenceAmount: 50000,
        differenceCategory: 'fees',
        notes: 'Comisión 50k',
        createdAt: '2026-08-25T10:00:00Z',
      });

      // Pago parcial: 20k
      const alloc = await CardRepository.payCreditCardAtomic('card-rappi-2', 'acc-main', 20000);

      assert.strictEqual(alloc.principalApplied, 0);
      assert.strictEqual(alloc.handlingFeeApplied, 0);
      assert.strictEqual(alloc.unbilledApplied, 20000);

      const card = (await CardRepository.getById('card-rappi-2'))!;
      assert.strictEqual(card.availableLimit, 5000000); // No libera cupo (se mantiene en 5M)

      const summary = await CardRepository.getCardStatementSummary(card);
      assert.strictEqual(summary.principalDebt, 0);
      assert.strictEqual(summary.nonPrincipalDebt, 30000); // Pendiente fees: 30k
      assert.strictEqual(summary.totalCurrentDebt, 30000);

      const recs = await ReconciliationRepository.getReconciliationsForCard('card-rappi-2');
      const rec = recs.find((r) => r.id === 'rec-fee-t48');
      assert.strictEqual(rec?.amountPaid, 20000);
    });

    test('T49 — Segundo pago completa conciliación', async () => {
      // Tarjeta cupo 5M, disponible 5M
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 5000000 WHERE id = ?', ['card-rappi-2']);

      // Conciliación: fees 50k
      await ReconciliationRepository.createReconciliation({
        id: 'rec-fee-t49',
        cardId: 'card-rappi-2',
        reconciliationDate: '2026-08-25',
        appCalculatedDebt: 0,
        bankReportedDebt: 50000,
        differenceAmount: 50000,
        differenceCategory: 'fees',
        notes: 'Comisión 50k',
        createdAt: '2026-08-25T10:00:00Z',
      });

      // Primer pago: 20k
      await CardRepository.payCreditCardAtomic('card-rappi-2', 'acc-main', 20000);

      // Segundo pago: 30k
      const alloc2 = await CardRepository.payCreditCardAtomic('card-rappi-2', 'acc-main', 30000);
      assert.strictEqual(alloc2.principalApplied, 0);
      assert.strictEqual(alloc2.handlingFeeApplied, 0);
      assert.strictEqual(alloc2.unbilledApplied, 30000);

      const card = (await CardRepository.getById('card-rappi-2'))!;
      assert.strictEqual(card.availableLimit, 5000000);

      const summary = await CardRepository.getCardStatementSummary(card);
      assert.strictEqual(summary.principalDebt, 0);
      assert.strictEqual(summary.nonPrincipalDebt, 0); // Fees pendiente: 0
      assert.strictEqual(summary.totalCurrentDebt, 0);

      const recs = await ReconciliationRepository.getReconciliationsForCard('card-rappi-2');
      const rec = recs.find((r) => r.id === 'rec-fee-t49');
      assert.strictEqual(rec?.amountPaid, 50000);
    });

    test('T50 — Revertir pago de conciliación', async () => {
      // Tarjeta cupo 5M, disponible 5M
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 5000000 WHERE id = ?', ['card-rappi-2']);

      // Conciliación: fees 35k
      await ReconciliationRepository.createReconciliation({
        id: 'rec-fee-t50',
        cardId: 'card-rappi-2',
        reconciliationDate: '2026-08-25',
        appCalculatedDebt: 0,
        bankReportedDebt: 35000,
        differenceAmount: 35000,
        differenceCategory: 'fees',
        notes: 'Comisión 35k',
        createdAt: '2026-08-25T10:00:00Z',
      });

      // Pagar los fees
      const alloc = await CardRepository.payCreditCardAtomic('card-rappi-2', 'acc-main', 35000);

      // Revertir pago: DELETE payment
      await TransactionRepository.delete(alloc.transactionId);

      // Fees vuelve a pendiente
      const recs = await ReconciliationRepository.getReconciliationsForCard('card-rappi-2');
      const rec = recs.find((r) => r.id === 'rec-fee-t50');
      assert.strictEqual(rec?.amountPaid, 0);

      const card = (await CardRepository.getById('card-rappi-2'))!;
      const summary = await CardRepository.getCardStatementSummary(card);
      assert.strictEqual(summary.nonPrincipalDebt, 35000);
      assert.strictEqual(summary.totalCurrentDebt, 35000);
    });

    test('T51 — Principal Applied Cap', () => {
      const nuPolicy = new NuPolicy();
      const genericPolicy = new GenericPolicy();
      const bancolombiaPolicy = new BancolombiaPolicy();
      const rappiPolicy = new RappiCardPolicy();

      const ctx = {
        creditLimit: 5000000,
        availableLimit: 4500000, // principalDebt = 500.000
        totalStatementBalance: 550000,
        statementBalancePaid: 0,
        minimumPaymentOriginal: 100000,
        minimumPaymentPaid: 0,
        taxesAndFees: 0,
        handlingFee: 0,
        collectionFee: 0,
        lateInterest: 0,
        currentInterest: 0,
        principalTotal: 500000,
        unbilledDebt: 50000,
        billedPrincipalRemaining: 500000,
        unbilledPrincipalRemaining: 0,
        unbilledFeesPending: 50000,
      };

      // Principal debt: 500k, Non-principal: 50k, Pago: 550k
      const resNu = nuPolicy.allocatePayment(550000, ctx);
      assert.strictEqual(resNu.unbilledFeesApplied, 50000);
      assert.strictEqual(resNu.principalApplied, 500000); // EXACTAMENTE 500k

      const resGeneric = genericPolicy.allocatePayment(550000, ctx);
      assert.strictEqual(resGeneric.unbilledFeesApplied, 50000);
      assert.strictEqual(resGeneric.principalApplied, 500000); // EXACTAMENTE 500k

      const resBanco = bancolombiaPolicy.allocatePayment(550000, ctx);
      assert.strictEqual(resBanco.unbilledFeesApplied, 50000);
      assert.strictEqual(resBanco.principalApplied, 500000); // EXACTAMENTE 500k

      const resRappi = rappiPolicy.allocatePayment(550000, ctx);
      assert.strictEqual(resRappi.unbilledFeesApplied, 50000);
      assert.strictEqual(resRappi.principalApplied, 500000); // EXACTAMENTE 500k
    });

    test('T52 — Editar card_payment estructural', async () => {
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 4000000 WHERE id = ?', ['card-rappi-2']);
      const alloc = await CardRepository.payCreditCardAtomic('card-rappi-2', 'acc-main', 200000);

      const tx = (await TransactionRepository.getAll({ cardId: 'card-rappi-2', type: 'card_payment' })).find(
        (t) => t.id === alloc.transactionId
      )!;

      const accBefore = (await AccountRepository.getById('acc-main'))!;
      const cardBefore = (await CardRepository.getById('card-rappi-2'))!;

      // Intentar modificar el monto estructural
      const modifiedTx: Transaction = {
        ...tx,
        amount: 300000,
      };

      await assert.rejects(
        async () => {
          await TransactionRepository.update(tx.id, modifiedTx);
        },
        {
          name: 'Error',
          message: 'Los pagos de tarjeta no pueden modificarse directamente. Revierte el pago y regístralo nuevamente.',
        }
      );

      // Cuenta sin cambios
      const accAfter = (await AccountRepository.getById('acc-main'))!;
      assert.strictEqual(accAfter.balance, accBefore.balance);

      // Tarjeta sin cambios
      const cardAfter = (await CardRepository.getById('card-rappi-2'))!;
      assert.strictEqual(cardAfter.availableLimit, cardBefore.availableLimit);

      // Allocation sin cambios
      const allocRows = (await testDb.db.getAllAsync(
        'SELECT total_payment FROM card_payment_allocations WHERE transaction_id = ?',
        [tx.id]
      )) as Array<{ total_payment: number }>;
      assert.strictEqual(allocRows[0].total_payment, 200000);
    });

    test('T53 — Editar solo notes/description de card_payment', async () => {
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 4000000 WHERE id = ?', ['card-rappi-2']);
      const alloc = await CardRepository.payCreditCardAtomic('card-rappi-2', 'acc-main', 200000);

      const txs = await TransactionRepository.getAll({ cardId: 'card-rappi-2', type: 'card_payment' });
      const tx = txs.find((t) => t.id === alloc.transactionId)!;
      const initialLimit = (await CardRepository.getById('card-rappi-2'))!.availableLimit;
      const initialAccBalance = (await AccountRepository.getById('acc-main'))!.balance;

      const nonStructuralUpdate: Transaction = {
        ...tx,
        description: 'Pago mensual de tarjeta con cashback',
        notes: 'Comprobante #987654',
      };

      await TransactionRepository.update(tx.id, nonStructuralUpdate);

      const updatedTxs = await TransactionRepository.getAll({ cardId: 'card-rappi-2', type: 'card_payment' });
      const updatedTx = updatedTxs.find((t) => t.id === tx.id);
      assert.strictEqual(updatedTx?.description, 'Pago mensual de tarjeta con cashback');
      assert.strictEqual(updatedTx?.notes, 'Comprobante #987654');

      // Cupo y saldo de cuenta intactos
      const limitAfter = (await CardRepository.getById('card-rappi-2'))!.availableLimit;
      assert.strictEqual(limitAfter, initialLimit);

      const accAfter = (await AccountRepository.getById('acc-main'))!;
      assert.strictEqual(accAfter.balance, initialAccBalance);
    });

    test('T54 — DELETE balance_adjustment', async () => {
      // Registrar un ajuste de conciliación
      await ReconciliationRepository.createReconciliation({
        id: 'rec-test-del-54',
        cardId: 'card-nu-2',
        reconciliationDate: '2026-08-25',
        appCalculatedDebt: 0,
        bankReportedDebt: 10000,
        differenceAmount: 10000,
        differenceCategory: 'interest',
        createdAt: '2026-08-25T10:00:00Z',
      });

      const txs = await TransactionRepository.getAll({ cardId: 'card-nu-2', type: 'balance_adjustment' });
      assert.ok(txs.length > 0);
      const adjTx = txs[0];

      await assert.rejects(
        async () => {
          await TransactionRepository.delete(adjTx.id);
        },
        {
          name: 'Error',
          message: 'Los ajustes de conciliación deben corregirse desde el módulo de Conciliación.',
        }
      );
    });

    test('T55 — Opening Balance con pagos posteriores', async () => {
      // Tarjeta con cupo 3M
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 3000000 WHERE id = ?', ['card-nu-2']);

      // Crear saldo de apertura inicial
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-nu-2', new Date('2026-07-15'));
      await StatementRepository.createOpeningBalanceSnapshot({
        cardId: 'card-nu-2',
        billingCycleId: cycle.id,
        statementDate: '2026-07-15',
        dueDate: '2026-08-05',
        principalTotal: 400000,
        interestAndFeesTotal: 0,
        minimumPayment: 40000,
        notes: 'Saldo de apertura test',
      });

      const openingTxs = await TransactionRepository.getAll({ cardId: 'card-nu-2', type: 'card_opening_balance' });
      assert.ok(openingTxs.length > 0);
      const openingTx = openingTxs[0];

      // Registrar una transacción posterior dependiente (pago)
      await CardRepository.payCreditCardAtomic('card-nu-2', 'acc-main', 100000);

      // Intentar eliminar el opening balance teniendo movimientos posteriores dependientes
      await assert.rejects(
        async () => {
          await TransactionRepository.delete(openingTx.id);
        },
        {
          name: 'Error',
          message: 'No es posible eliminar el Saldo de Apertura porque existen movimientos o pagos posteriores que dependen de él.',
        }
      );
    });

    test('T56 — Facturado + Conciliado misma categoría', async () => {
      // Tarjeta con cupo 5M, disponible 5M
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 5000000 WHERE id = ?', ['card-rappi-2']);

      // 1. Crear extracto con handling fee de 20.000 (sin capital para aislar el cargo)
      const cycle = await CycleRepository.getOrCreateCurrentCycle('card-rappi-2', new Date('2026-08-10'));
      const stmt = await StatementRepository.createSnapshot({
        cardId: 'card-rappi-2',
        billingCycleId: cycle.id,
        statementDate: '2026-08-10',
        dueDate: '2026-09-01',
        openingBalance: 0,
        purchasesTotal: 0,
        advancesTotal: 0,
        principalTotal: 0,
        currentInterest: 0,
        lateInterest: 0,
        handlingFee: 20000,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: 20000,
        minimumPaymentOriginal: 20000,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
      });

      // 2. Crear conciliación no facturada de fees por 30.000
      await ReconciliationRepository.createReconciliation({
        id: 'rec-fee-t56',
        cardId: 'card-rappi-2',
        reconciliationDate: '2026-08-20',
        appCalculatedDebt: 20000,
        bankReportedDebt: 50000,
        differenceAmount: 30000,
        differenceCategory: 'fees',
        notes: 'Comisión conciliada',
        createdAt: '2026-08-20T10:00:00Z',
      });

      const card = (await CardRepository.getById('card-rappi-2'))!;
      const summaryBefore = await CardRepository.getCardStatementSummary(card);
      assert.strictEqual(summaryBefore.billedStatementDebtRemaining, 20000);
      assert.strictEqual(summaryBefore.nonPrincipalDebt, 50000); // 20k facturados + 30k conciliados
      assert.strictEqual(summaryBefore.totalCurrentDebt, 50000);

      // 3. Pago de 50.000
      const alloc = await CardRepository.payCreditCardAtomic('card-rappi-2', 'acc-main', 50000);

      // Desglose en card_payment_allocations: handlingFeeApplied = 20.000 (BILLED ONLY)
      assert.strictEqual(alloc.handlingFeeApplied, 20000);
      assert.strictEqual(alloc.statementApplied, 20000);
      assert.strictEqual(alloc.unbilledApplied, 30000);

      // Conciliación: amountPaid = 30.000 (NUNCA 50.000)
      const recs = await ReconciliationRepository.getReconciliationsForCard('card-rappi-2');
      const rec = recs.find((r) => r.id === 'rec-fee-t56');
      assert.strictEqual(rec?.amountPaid, 30000);

      // Extracto pagado
      const stmtUpdated = await StatementRepository.getStatementById(stmt.id);
      assert.strictEqual(stmtUpdated?.statementBalancePaid, 20000);
      assert.strictEqual(stmtUpdated?.status, 'paid');

      // 4. Revertir pago
      await TransactionRepository.delete(alloc.transactionId);

      // Extracto vuelve a quedar pendiente en 20.000
      const stmtReverted = await StatementRepository.getStatementById(stmt.id);
      assert.strictEqual(stmtReverted?.statementBalancePaid, 0);
      assert.strictEqual(stmtReverted?.status, 'open');

      // Conciliación vuelve a quedar pendiente con amountPaid = 0 (30k pendiente)
      const recsReverted = await ReconciliationRepository.getReconciliationsForCard('card-rappi-2');
      const recReverted = recsReverted.find((r) => r.id === 'rec-fee-t56');
      assert.strictEqual(recReverted?.amountPaid, 0);

      const summaryReverted = await CardRepository.getCardStatementSummary(card);
      assert.strictEqual(summaryReverted.billedStatementDebtRemaining, 20000);
      assert.strictEqual(summaryReverted.nonPrincipalDebt, 50000);
      assert.strictEqual(summaryReverted.totalCurrentDebt, 50000);
    });

    test('T57 — Dos conciliaciones / dos pagos', async () => {
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 5000000 WHERE id = ?', ['card-nu-2']);

      // Conciliación A: 30.000
      await ReconciliationRepository.createReconciliation({
        id: 'rec-a-t57',
        cardId: 'card-nu-2',
        reconciliationDate: '2026-08-20',
        appCalculatedDebt: 0,
        bankReportedDebt: 30000,
        differenceAmount: 30000,
        differenceCategory: 'fees',
        notes: 'Conciliación A',
        createdAt: '2026-08-20T10:00:00Z',
      });

      // Pago P1: 30.000
      const p1 = await CardRepository.payCreditCardAtomic('card-nu-2', 'acc-main', 30000);

      // Conciliación B: 40.000
      await ReconciliationRepository.createReconciliation({
        id: 'rec-b-t57',
        cardId: 'card-nu-2',
        reconciliationDate: '2026-08-22',
        appCalculatedDebt: 0,
        bankReportedDebt: 40000,
        differenceAmount: 40000,
        differenceCategory: 'interest',
        notes: 'Conciliación B',
        createdAt: '2026-08-22T10:00:00Z',
      });

      // Pago P2: 40.000
      const p2 = await CardRepository.payCreditCardAtomic('card-nu-2', 'acc-main', 40000);

      // Revertir P1
      await TransactionRepository.delete(p1.transactionId);

      // A queda pendiente (amountPaid = 0), B SIGUE PAGADA (amountPaid = 40.000)
      const recsAfterRevP1 = await ReconciliationRepository.getReconciliationsForCard('card-nu-2');
      const recA = recsAfterRevP1.find((r) => r.id === 'rec-a-t57');
      const recB = recsAfterRevP1.find((r) => r.id === 'rec-b-t57');

      assert.strictEqual(recA?.amountPaid, 0);
      assert.strictEqual(recB?.amountPaid, 40000); // B SIGUE PAGADA

      // Revertir P2
      await TransactionRepository.delete(p2.transactionId);

      const recsAfterRevP2 = await ReconciliationRepository.getReconciliationsForCard('card-nu-2');
      const recB2 = recsAfterRevP2.find((r) => r.id === 'rec-b-t57');
      assert.strictEqual(recB2?.amountPaid, 0); // B vuelve a quedar pendiente en 40.000
    });

    test('T58 — Pago repartido entre varias conciliaciones', async () => {
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 5000000 WHERE id = ?', ['card-rappi-2']);

      // R1 fees: 20.000
      await ReconciliationRepository.createReconciliation({
        id: 'rec-r1-t58',
        cardId: 'card-rappi-2',
        reconciliationDate: '2026-08-10',
        appCalculatedDebt: 0,
        bankReportedDebt: 20000,
        differenceAmount: 20000,
        differenceCategory: 'fees',
        createdAt: '2026-08-10T10:00:00Z',
      });

      // R2 fees: 30.000
      await ReconciliationRepository.createReconciliation({
        id: 'rec-r2-t58',
        cardId: 'card-rappi-2',
        reconciliationDate: '2026-08-15',
        appCalculatedDebt: 0,
        bankReportedDebt: 30000,
        differenceAmount: 30000,
        differenceCategory: 'fees',
        createdAt: '2026-08-15T10:00:00Z',
      });

      // Pago: 35.000
      const alloc = await CardRepository.payCreditCardAtomic('card-rappi-2', 'acc-main', 35000);

      // Verificar relaciones en card_payment_reconciliation_allocations
      const rels = (await testDb.db.getAllAsync(
        'SELECT * FROM card_payment_reconciliation_allocations WHERE payment_allocation_id = ? ORDER BY amount_applied DESC',
        [alloc.id]
      )) as Array<{ reconciliation_id: string; amount_applied: number }>;

      assert.strictEqual(rels.length, 2);
      const relR1 = rels.find((r) => r.reconciliation_id === 'rec-r1-t58');
      const relR2 = rels.find((r) => r.reconciliation_id === 'rec-r2-t58');

      assert.strictEqual(relR1?.amount_applied, 20000);
      assert.strictEqual(relR2?.amount_applied, 15000);

      // Pendiente R2: 15.000
      const recs = await ReconciliationRepository.getReconciliationsForCard('card-rappi-2');
      const recR2 = recs.find((r) => r.id === 'rec-r2-t58');
      assert.strictEqual(recR2?.amountPaid, 15000);

      // Revertir pago
      await TransactionRepository.delete(alloc.transactionId);

      // R1 pendiente: 20k, R2 pendiente: 30k
      const recsReverted = await ReconciliationRepository.getReconciliationsForCard('card-rappi-2');
      const recR1Rev = recsReverted.find((r) => r.id === 'rec-r1-t58');
      const recR2Rev = recsReverted.find((r) => r.id === 'rec-r2-t58');

      assert.strictEqual(recR1Rev?.amountPaid, 0);
      assert.strictEqual(recR2Rev?.amountPaid, 0);
    });

    test('T59 — Reconciliaciones negativas (Banco reporta menor deuda)', async () => {
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = 5000000 WHERE id = ?', ['card-nu-2']);

      // 1. Caso con compensación: Registrar previamente comisiones pendientes por $40.000
      await ReconciliationRepository.createReconciliation({
        id: 'rec-pos-59',
        cardId: 'card-nu-2',
        reconciliationDate: '2026-08-20',
        appCalculatedDebt: 0,
        bankReportedDebt: 40000,
        differenceAmount: 40000,
        differenceCategory: 'fees',
        createdAt: '2026-08-20T10:00:00Z',
      });

      // Registrar diferencia negativa de -$30.000 en fees (banco eliminó comisión)
      await ReconciliationRepository.createReconciliation({
        id: 'rec-neg-offset-59',
        cardId: 'card-nu-2',
        reconciliationDate: '2026-08-22',
        appCalculatedDebt: 40000,
        bankReportedDebt: 10000,
        differenceAmount: -30000,
        differenceCategory: 'fees',
        createdAt: '2026-08-22T10:00:00Z',
      });

      // La conciliación previa se compensó en $30.000 -> queda $10.000 pendiente
      const summary1 = await ReconciliationRepository.getPendingNonPrincipalSummary('card-nu-2');
      assert.strictEqual(summary1.feesPending, 10000);

      // 2. Caso sin deuda previa suficiente: Registrar diferencia negativa de -$50.000 cuando solo quedan $10.000
      await ReconciliationRepository.createReconciliation({
        id: 'rec-neg-review-59',
        cardId: 'card-nu-2',
        reconciliationDate: '2026-08-25',
        appCalculatedDebt: 10000,
        bankReportedDebt: 0,
        differenceAmount: -50000,
        differenceCategory: 'fees',
        createdAt: '2026-08-25T10:00:00Z',
      });

      // Se marca como pending_review y NO corrompe el cálculo con saldo negativo
      const recs = await ReconciliationRepository.getReconciliationsForCard('card-nu-2');
      const recReview = recs.find((r) => r.id === 'rec-neg-review-59');
      assert.strictEqual(recReview?.status, 'pending_review');

      const summaryFinal = await ReconciliationRepository.getPendingNonPrincipalSummary('card-nu-2');
      assert.strictEqual(summaryFinal.feesPending, 10000); // Se mantiene consistente en $10.000
    });
  });
});
