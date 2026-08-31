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
} from '../src/utils/financialMath.ts';

import { setTestDatabase, initDatabase } from '../src/database/database.ts';
import { AccountRepository } from '../src/database/repositories/accountRepository.ts';
import { CardRepository } from '../src/database/repositories/cardRepository.ts';
import { TransactionRepository } from '../src/database/repositories/transactionRepository.ts';

import type { Account, CreditCard, Transaction, CardPurchase, CardInstallment } from '../src/types/finance.ts';

/**
 * ADAPTADOR SQLITE REAL PARA PRUEBAS EN NODE.JS
 * Provee la misma interfaz asíncrona de expo-sqlite respaldada por un motor SQLite real en memoria.
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

describe('BATERÍA COMPLETA DE PRUEBAS FINANCIERAS (FASE 1.3 HARDENING)', () => {
  // ==========================================
  // BLOQUE 1: PRUEBAS UNITARIAS [UNIT]
  // ==========================================
  describe('1. Pruebas Unitarias [UNIT] - Lógica y Matemática Pura', () => {
    test('U01. Ingreso ordinario aumenta activos, caja y patrimonio', () => {
      const tx: Transaction = {
        id: 'tx-inc-1',
        accountId: 'acc-bancolombia',
        type: 'income',
        amount: 1000000,
        categoryId: 'cat-salary',
        description: 'Nómina',
        date: '2026-08-15',
        createdAt: '2026-08-15',
      };

      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.consumption, 0);
      assert.strictEqual(effects.cashInflow, 1000000);
      assert.strictEqual(effects.cashOutflow, 0);
      assert.strictEqual(effects.assetDelta, 1000000);
      assert.strictEqual(effects.liabilityDelta, 0);
      assert.strictEqual(effects.netWorthDelta, 1000000);
    });

    test('U02. Gasto corriente genera consumo y reduce activos', () => {
      const tx: Transaction = {
        id: 'tx-exp-1',
        accountId: 'acc-bancolombia',
        type: 'expense',
        amount: 1000000,
        categoryId: 'cat-food',
        description: 'Supermercado',
        date: '2026-08-16',
        createdAt: '2026-08-16',
      };

      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.consumption, 1000000);
      assert.strictEqual(effects.cashInflow, 0);
      assert.strictEqual(effects.cashOutflow, 1000000);
      assert.strictEqual(effects.assetDelta, -1000000);
      assert.strictEqual(effects.netWorthDelta, -1000000);
    });

    test('U03. Gasto con impuesto 4x1000 deduce monto + GMF del patrimonio', () => {
      const tx: Transaction = {
        id: 'tx-exp-gmf',
        accountId: 'acc-bancolombia',
        type: 'expense',
        amount: 100000,
        gmfAmount: 400,
        categoryId: 'cat-bills',
        description: 'Servicios Públicos',
        date: '2026-08-17',
        createdAt: '2026-08-17',
      };

      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.consumption, 100400);
      assert.strictEqual(effects.cashOutflow, 100400);
      assert.strictEqual(effects.assetDelta, -100400);
      assert.strictEqual(effects.netWorthDelta, -100400);
    });

    test('U04. Transferencia propia sin GMF es neutral en consumo y patrimonio', () => {
      const tx: Transaction = {
        id: 'tx-tr-1',
        accountId: 'acc-nequi',
        toAccountId: 'acc-bancolombia',
        type: 'transfer',
        amount: 500000,
        categoryId: 'cat-financial',
        description: 'Traspaso Nequi a Bancolombia',
        date: '2026-08-18',
        createdAt: '2026-08-18',
      };

      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.consumption, 0);
      assert.strictEqual(effects.cashInflow, 0);
      assert.strictEqual(effects.cashOutflow, 0);
      assert.strictEqual(effects.netWorthDelta, 0);
    });

    test('U05. Transferencia con 4x1000 registra únicamente el GMF como costo patrimonial', () => {
      const tx: Transaction = {
        id: 'tx-tr-gmf',
        accountId: 'acc-bancolombia',
        toAccountId: 'acc-nequi',
        type: 'transfer',
        amount: 1000000,
        gmfAmount: 4000,
        categoryId: 'cat-financial',
        description: 'Traspaso gravado',
        date: '2026-08-18',
        createdAt: '2026-08-18',
      };

      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.consumption, 4000);
      assert.strictEqual(effects.cashOutflow, 4000);
      assert.strictEqual(effects.netWorthDelta, -4000);
    });

    test('U06. Compra con tarjeta causa consumo al 100%, incrementa pasivo y no afecta caja inicial', () => {
      const tx: Transaction = {
        id: 'tx-card-p1',
        cardId: 'card-nu',
        type: 'card_purchase',
        amount: 1200000,
        categoryId: 'cat-tech',
        description: 'Celular',
        date: '2026-08-20',
        createdAt: '2026-08-20',
      };

      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.consumption, 1200000);
      assert.strictEqual(effects.cashOutflow, 0);
      assert.strictEqual(effects.liabilityDelta, 1200000);
      assert.strictEqual(effects.netWorthDelta, -1200000);
    });

    test('U07. Pago a tarjeta reduce pasivos sin duplicar consumo', () => {
      const tx: Transaction = {
        id: 'tx-card-pay-1',
        accountId: 'acc-bancolombia',
        cardId: 'card-nu',
        type: 'card_payment',
        amount: 200000,
        categoryId: 'cat-financial',
        description: 'Pago Tarjeta Nu',
        date: '2026-08-25',
        createdAt: '2026-08-25',
      };

      const effects = evaluateTransactionEffects(tx);
      assert.strictEqual(effects.consumption, 0);
      assert.strictEqual(effects.cashOutflow, 200000);
      assert.strictEqual(effects.assetDelta, -200000);
      assert.strictEqual(effects.liabilityDelta, -200000);
      assert.strictEqual(effects.netWorthDelta, 0);
    });

    test('U08. Amortización Francesa con residuo exacto garantiza suma total idéntica', () => {
      const schedule = generateAmortizationSchedule('purch-1', 100000, 2.15, 3, new Date(2026, 7, 1));
      assert.strictEqual(schedule.length, 3);
      const sumPrincipal = schedule.reduce((sum, inst) => sum + inst.principalAmount, 0);
      assert.strictEqual(+sumPrincipal.toFixed(2), 100000);
    });

    test('U09. Compra a tasa 0% interés divide cuotas limpias sin interés', () => {
      const schedule = generateAmortizationSchedule('purch-zero', 100000, 0, 3, new Date(2026, 7, 1));
      const sumPrincipal = schedule.reduce((sum, inst) => sum + inst.principalAmount, 0);
      assert.strictEqual(+sumPrincipal.toFixed(2), 100000);
      assert.strictEqual(schedule[0].interestAmount, 0);
      assert.strictEqual(schedule[1].interestAmount, 0);
      assert.strictEqual(schedule[2].interestAmount, 0);
    });

    test('U10. Fechas de corte y vencimiento detectan ciclo corriente', () => {
      const cycle = calculateCardCycleDates(28, 10, new Date(2026, 7, 31));
      assert.strictEqual(cycle.cutOffDate, '2026-08-28');
      assert.strictEqual(cycle.paymentDueDate, '2026-09-10');
      assert.strictEqual(cycle.isCutOffPassed, true);
      assert.strictEqual(cycle.daysToPayment, 10);
    });

    test('U11. Conversión matemática de tasas E.A. a E.M.', () => {
      const monthlyRate = convertEAToEM(28.5);
      assert.ok(monthlyRate > 2.11 && monthlyRate < 2.12);
    });

    test('U12. Manejo seguro de valores cero o negativos', () => {
      assert.strictEqual(calculateMonthlyQuota(0, 2.15, 6), 0);
      assert.strictEqual(calculateMonthlyQuota(-5000, 2.15, 6), 0);
      const emptySchedule = generateAmortizationSchedule('empty', -100, 2.15, 0);
      assert.strictEqual(emptySchedule.length, 0);
    });
  });

  // =========================================================================
  // BLOQUE 2: PRUEBAS DE INTEGRACIÓN CON REPOSITORIOS REALES (SQLITE ADAPTER)
  // =========================================================================
  describe('2. Pruebas de Integración con Repositorios Reales [REPOSITORY INTEGRATION]', () => {
    let testDb: ReturnType<typeof createRealSqliteDb>;

    beforeEach(async () => {
      testDb = await setupTestDatabase();
      setTestDatabase(testDb.db);

      // Cargar datos base ejecutando los repositorios reales
      await AccountRepository.create({
        id: 'acc-1',
        name: 'Bancolombia',
        bankName: 'Bancolombia',
        type: 'savings',
        balance: 2000000,
        initialBalance: 2000000,
        currency: 'COP',
        color: '#FBBF24',
        icon: 'Landmark',
        includeInTotal: true,
        hasGmf4x1000: false,
        isArchived: false,
        createdAt: '2026-08-01',
      });

      await AccountRepository.create({
        id: 'acc-2',
        name: 'Nequi',
        bankName: 'Nequi',
        type: 'wallet',
        balance: 500000,
        initialBalance: 500000,
        currency: 'COP',
        color: '#E11D48',
        icon: 'Smartphone',
        includeInTotal: true,
        hasGmf4x1000: false,
        isArchived: false,
        createdAt: '2026-08-01',
      });

      await CardRepository.create({
        id: 'card-1',
        name: 'Nu Mastercard',
        bankName: 'Nubank',
        cardBrand: 'mastercard',
        creditLimit: 5000000,
        availableLimit: 4000000, // Deuda inicial: $1.000.000
        cutOffDay: 28,
        paymentDueDay: 10,
        interestRateMonthly: 2.15,
        handlingFee: 0,
        colorGradient: ['#3B0764', '#7E22CE'],
        currency: 'COP',
        isArchived: false,
        createdAt: '2026-08-01',
      });
    });

    test('TEST A: CardRepository.createPurchaseAtomic crea compra, cuotas, reduce cupo e inserta transacción de forma indivisible', async () => {
      const purchase: CardPurchase = {
        id: 'purch-a',
        cardId: 'card-1',
        description: 'Laptop Dell',
        categoryId: 'cat-tech',
        amount: 1200000,
        installmentsTotal: 12,
        installmentsPaid: 0,
        monthlyInstallmentAmount: 100000,
        interestRateMonthly: 0,
        firstInstallmentDate: '2026-09-10',
        status: 'active',
        createdAt: '2026-08-31',
      };

      const installments: CardInstallment[] = Array.from({ length: 12 }, (_, i) => ({
        id: `inst-a-${i + 1}`,
        purchaseId: 'purch-a',
        installmentNumber: i + 1,
        dueDate: `2026-${i < 9 ? '0' + (i + 1) : i + 1}-10`,
        principalAmount: 100000,
        interestAmount: 0,
        totalAmount: 100000,
        isPaid: false,
      }));

      await CardRepository.createPurchaseAtomic(purchase, installments);

      // Verificar mediante repositorios
      const purchases = await CardRepository.getPurchasesForCard('card-1');
      const savedInsts = await CardRepository.getInstallmentsForPurchase('purch-a');
      const cards = await CardRepository.getAll();
      const txs = await TransactionRepository.getAll({ cardId: 'card-1' });

      assert.strictEqual(purchases.length, 1);
      assert.strictEqual(purchases[0].amount, 1200000);
      assert.strictEqual(savedInsts.length, 12);
      assert.strictEqual(cards[0].availableLimit, 2800000, 'Cupo disponible reducido de 4M a 2.8M');
      assert.strictEqual(txs.length, 1);
      assert.strictEqual(txs[0].type, 'card_purchase');
    });

    test('TEST B: CardRepository.createPurchaseAtomic falla con tarjeta inexistente/archivada -> Rollback total', async () => {
      const purchase: CardPurchase = {
        id: 'purch-invalid',
        cardId: 'card-non-existent',
        description: 'Error Purchase',
        categoryId: 'cat-tech',
        amount: 500000,
        installmentsTotal: 2,
        installmentsPaid: 0,
        monthlyInstallmentAmount: 250000,
        interestRateMonthly: 0,
        firstInstallmentDate: '2026-09-10',
        status: 'active',
        createdAt: '2026-08-31',
      };

      await assert.rejects(
        () => CardRepository.createPurchaseAtomic(purchase, []),
        /La tarjeta de crédito no existe o está archivada/
      );
    });

    test('TEST C: TransactionRepository.create para Transferencia -> Valida cuentas diferentes', async () => {
      const sameAccountTx: Transaction = {
        id: 'tx-tr-same',
        accountId: 'acc-1',
        toAccountId: 'acc-1',
        type: 'transfer',
        amount: 100000,
        categoryId: 'cat-fin',
        description: 'Transferencia fallida',
        date: '2026-08-31',
        createdAt: '2026-08-31',
      };

      await assert.rejects(
        () => TransactionRepository.create(sameAccountTx),
        /La cuenta de origen y destino de una transferencia deben ser diferentes/
      );

      const accs = await AccountRepository.getAll();
      assert.strictEqual(accs.find((a) => a.id === 'acc-1')?.balance, 2000000, 'Saldo intacto');
    });

    test('TEST D: TransactionRepository.create y delete para Pago General de Tarjeta ($200.000)', async () => {
      const payTx: Transaction = {
        id: 'tx-pay-gen',
        accountId: 'acc-1',
        cardId: 'card-1',
        type: 'card_payment',
        amount: 200000,
        categoryId: 'cat-fin',
        description: 'Abono General',
        date: '2026-08-31',
        createdAt: '2026-08-31',
      };

      // 1. Crear pago llamando repositorio real
      await TransactionRepository.create(payTx);

      let acc = (await AccountRepository.getAll()).find((a) => a.id === 'acc-1');
      let card = (await CardRepository.getAll()).find((c) => c.id === 'card-1');
      assert.strictEqual(acc?.balance, 1800000, 'Cuenta debitada a $1.800.000');
      assert.strictEqual(card?.availableLimit, 4200000, 'Cupo liberado a $4.200.000');

      // 2. Eliminar pago llamando repositorio real
      await TransactionRepository.delete('tx-pay-gen');

      acc = (await AccountRepository.getAll()).find((a) => a.id === 'acc-1');
      card = (await CardRepository.getAll()).find((c) => c.id === 'card-1');
      const txs = await TransactionRepository.getAll();

      assert.strictEqual(acc?.balance, 2000000, 'Saldo bancario restituido a $2.000.000');
      assert.strictEqual(card?.availableLimit, 4000000, 'Cupo disponible restituido a $4.000.000');
      assert.strictEqual(txs.length, 0, 'Transacción eliminada');
    });

    test('TEST E: CardRepository.payInstallmentAtomic (SQLite Source of Truth) y TransactionRepository.delete', async () => {
      // 1. Crear compra diferida a 3 cuotas con interés
      const purchase: CardPurchase = {
        id: 'purch-e',
        cardId: 'card-1',
        description: 'Calzado Deportivo',
        categoryId: 'cat-wear',
        amount: 270000,
        installmentsTotal: 3,
        installmentsPaid: 0,
        monthlyInstallmentAmount: 100000,
        interestRateMonthly: 2.15,
        firstInstallmentDate: '2026-09-10',
        status: 'active',
        createdAt: '2026-08-31',
      };

      const installments: CardInstallment[] = [
        { id: 'inst-e-1', purchaseId: 'purch-e', installmentNumber: 1, dueDate: '2026-09-10', principalAmount: 90000, interestAmount: 10000, totalAmount: 100000, isPaid: false },
        { id: 'inst-e-2', purchaseId: 'purch-e', installmentNumber: 2, dueDate: '2026-10-10', principalAmount: 90000, interestAmount: 10000, totalAmount: 100000, isPaid: false },
        { id: 'inst-e-3', purchaseId: 'purch-e', installmentNumber: 3, dueDate: '2026-11-10', principalAmount: 90000, interestAmount: 10000, totalAmount: 100000, isPaid: false },
      ];

      await CardRepository.createPurchaseAtomic(purchase, installments);

      // Estado post-compra: Cupo disponible = 4.000.000 - 270.000 = 3.730.000
      let card = (await CardRepository.getAll()).find((c) => c.id === 'card-1');
      assert.strictEqual(card?.availableLimit, 3730000);

      // 2. Pagar Cuota 1 llamando CardRepository.payInstallmentAtomic (SQLite es la fuente de verdad)
      await CardRepository.payInstallmentAtomic('inst-e-1', 'acc-1');

      let acc = (await AccountRepository.getAll()).find((a) => a.id === 'acc-1');
      card = (await CardRepository.getAll()).find((c) => c.id === 'card-1');
      let insts = await CardRepository.getInstallmentsForPurchase('purch-e');
      let purchs = await CardRepository.getPurchasesForCard('card-1');

      assert.strictEqual(acc?.balance, 1900000, 'Saldo debitado en $100.000 (total con interés)');
      assert.strictEqual(card?.availableLimit, 3820000, 'Cupo aumentado en $90.000 (3.730.000 + 90.000 = 3.820.000, solo capital)');
      assert.strictEqual(insts[0].isPaid, true, 'Cuota 1 pagada');
      assert.strictEqual(purchs[0].installmentsPaid, 1);

      // 3. Revertir pago de cuota eliminando la transacción
      const txs = await TransactionRepository.getAll({ cardId: 'card-1' });
      const payTx = txs.find((t) => t.type === 'card_payment' && t.cardInstallmentId === 'inst-e-1');
      assert.ok(payTx, 'Debe existir la transacción de pago de cuota');

      await TransactionRepository.delete(payTx.id);

      acc = (await AccountRepository.getAll()).find((a) => a.id === 'acc-1');
      card = (await CardRepository.getAll()).find((c) => c.id === 'card-1');
      insts = await CardRepository.getInstallmentsForPurchase('purch-e');
      purchs = await CardRepository.getPurchasesForCard('card-1');

      assert.strictEqual(acc?.balance, 2000000, 'Saldo bancario restituido a $2.000.000');
      assert.strictEqual(card?.availableLimit, 3730000, 'Cupo disponible restituido exactamente a $3.730.000 (re-consumió solo $90k)');
      assert.strictEqual(insts[0].isPaid, false, 'Cuota vuelve a estar pendiente');
      assert.strictEqual(purchs[0].installmentsPaid, 0);
      assert.strictEqual(purchs[0].status, 'active');
    });

    test('TEST F: TransactionRepository.update para editar Pago General de $200.000 a $300.000', async () => {
      const payTx: Transaction = {
        id: 'tx-pay-upd',
        accountId: 'acc-1',
        cardId: 'card-1',
        type: 'card_payment',
        amount: 200000,
        categoryId: 'cat-fin',
        description: 'Abono Inicial',
        date: '2026-08-31',
        createdAt: '2026-08-31',
      };

      await TransactionRepository.create(payTx);

      // Actualizar a $300.000
      await TransactionRepository.update('tx-pay-upd', {
        ...payTx,
        amount: 300000,
        description: 'Abono Modificado',
      });

      const acc = (await AccountRepository.getAll()).find((a) => a.id === 'acc-1');
      const card = (await CardRepository.getAll()).find((c) => c.id === 'card-1');
      const updatedTx = (await TransactionRepository.getAll()).find((t) => t.id === 'tx-pay-upd');

      assert.strictEqual(acc?.balance, 1700000, 'Saldo debitado en $300.000 respecto al balance inicial');
      assert.strictEqual(card?.availableLimit, 4300000, 'Cupo liberado en $300.000');
      assert.strictEqual(updatedTx?.amount, 300000);
    });

    test('TEST G: TransactionRepository.update rechaza modificar montos de pago vinculado a cuota', async () => {
      const purchase: CardPurchase = {
        id: 'purch-g',
        cardId: 'card-1',
        description: 'Gafas',
        categoryId: 'cat-wear',
        amount: 100000,
        installmentsTotal: 1,
        installmentsPaid: 0,
        monthlyInstallmentAmount: 100000,
        interestRateMonthly: 0,
        firstInstallmentDate: '2026-09-10',
        status: 'active',
        createdAt: '2026-08-31',
      };

      await CardRepository.createPurchaseAtomic(purchase, [
        { id: 'inst-g-1', purchaseId: 'purch-g', installmentNumber: 1, dueDate: '2026-09-10', principalAmount: 100000, interestAmount: 0, totalAmount: 100000, isPaid: false }
      ]);

      await CardRepository.payInstallmentAtomic('inst-g-1', 'acc-1');

      const txs = await TransactionRepository.getAll();
      const payTx = txs.find((t) => t.cardInstallmentId === 'inst-g-1');
      assert.ok(payTx);

      await assert.rejects(
        () => TransactionRepository.update(payTx.id, { ...payTx, amount: 150000 }),
        /No es posible modificar montos o cuentas de un pago vinculado a una cuota/
      );
    });

    test('TEST H: CardRepository.delete con historial -> ARCHIVA en lugar de borrar destructivamente', async () => {
      // Crear transacción
      await TransactionRepository.create({
        id: 'tx-card-h',
        cardId: 'card-1',
        type: 'card_purchase',
        amount: 50000,
        categoryId: 'cat-food',
        description: 'Cena',
        date: '2026-08-31',
        createdAt: '2026-08-31',
      });

      await CardRepository.delete('card-1');

      // getAll solo retorna no archivadas
      const activeCards = await CardRepository.getAll();
      assert.strictEqual(activeCards.length, 0, 'No aparece en tarjetas activas');

      // Consultar en SQLite para verificar que está archivada
      const cardInDb = testDb.syncDb.prepare('SELECT is_archived FROM credit_cards WHERE id = ?').get('card-1') as { is_archived: number };
      assert.strictEqual(cardInDb.is_archived, 1, 'Tarjeta marcada como is_archived = 1');

      const tx = testDb.syncDb.prepare('SELECT id FROM transactions WHERE id = ?').get('tx-card-h');
      assert.ok(tx, 'Transacción histórica preservada');
    });

    test('TEST I: AccountRepository.delete con historial -> ARCHIVA en lugar de borrar destructivamente', async () => {
      await TransactionRepository.create({
        id: 'tx-acc-i',
        accountId: 'acc-1',
        type: 'expense',
        amount: 40000,
        categoryId: 'cat-food',
        description: 'Almuerzo',
        date: '2026-08-31',
        createdAt: '2026-08-31',
      });

      await AccountRepository.delete('acc-1');

      const activeAccounts = await AccountRepository.getAll();
      assert.strictEqual(activeAccounts.find((a) => a.id === 'acc-1'), undefined);

      const accInDb = testDb.syncDb.prepare('SELECT is_archived FROM accounts WHERE id = ?').get('acc-1') as { is_archived: number };
      assert.strictEqual(accInDb.is_archived, 1, 'Cuenta marcada como is_archived = 1');

      const tx = testDb.syncDb.prepare('SELECT id FROM transactions WHERE id = ?').get('tx-acc-i');
      assert.ok(tx, 'Transacción histórica preservada');
    });

    test('TEST J: CardRepository.delete sin historial -> Eliminación física limpia', async () => {
      await CardRepository.create({
        id: 'card-fresh',
        name: 'Tarjeta Sin Uso',
        bankName: 'Banco',
        cardBrand: 'visa',
        creditLimit: 1000000,
        availableLimit: 1000000,
        cutOffDay: 15,
        paymentDueDay: 5,
        interestRateMonthly: 0,
        handlingFee: 0,
        colorGradient: ['#000', '#fff'],
        currency: 'COP',
        isArchived: false,
        createdAt: '2026-08-31',
      });

      await CardRepository.delete('card-fresh');

      const cardInDb = testDb.syncDb.prepare('SELECT * FROM credit_cards WHERE id = ?').get('card-fresh');
      assert.strictEqual(cardInDb, undefined, 'Eliminada físicamente');
    });

    test('TEST K: AccountRepository.delete sin historial -> Eliminación física limpia', async () => {
      await AccountRepository.create({
        id: 'acc-fresh',
        name: 'Cuenta Sin Uso',
        bankName: 'Banco',
        type: 'savings',
        balance: 0,
        initialBalance: 0,
        currency: 'COP',
        color: '#000',
        icon: 'Wallet',
        includeInTotal: true,
        hasGmf4x1000: false,
        isArchived: false,
        createdAt: '2026-08-31',
      });

      await AccountRepository.delete('acc-fresh');

      const accInDb = testDb.syncDb.prepare('SELECT * FROM accounts WHERE id = ?').get('acc-fresh');
      assert.strictEqual(accInDb, undefined, 'Eliminada físicamente');
    });

    test('TEST 13: Protección contra Doble Pago de Cuota (Double Payment Protection)', async () => {
      const purchase: CardPurchase = {
        id: 'purch-double',
        cardId: 'card-1',
        description: 'Artículos de Oficina',
        categoryId: 'cat-office',
        amount: 100000,
        installmentsTotal: 1,
        installmentsPaid: 0,
        monthlyInstallmentAmount: 100000,
        interestRateMonthly: 0,
        firstInstallmentDate: '2026-09-10',
        status: 'active',
        createdAt: '2026-08-31',
      };

      await CardRepository.createPurchaseAtomic(purchase, [
        { id: 'inst-double-1', purchaseId: 'purch-double', installmentNumber: 1, dueDate: '2026-09-10', principalAmount: 90000, interestAmount: 10000, totalAmount: 100000, isPaid: false }
      ]);

      // 1. Primer pago: ÉXITO
      await CardRepository.payInstallmentAtomic('inst-double-1', 'acc-1');

      const accAfterFirst = (await AccountRepository.getAll()).find((a) => a.id === 'acc-1')?.balance;
      const cardAfterFirst = (await CardRepository.getAll()).find((c) => c.id === 'card-1')?.availableLimit;
      const txsAfterFirst = await TransactionRepository.getAll();

      // 2. Segundo pago de la misma cuota: RECHAZO
      await assert.rejects(
        () => CardRepository.payInstallmentAtomic('inst-double-1', 'acc-1'),
        /Esta cuota ya fue pagada/
      );

      // Verificar que ningún saldo cambió tras el segundo intento
      const accAfterSecond = (await AccountRepository.getAll()).find((a) => a.id === 'acc-1')?.balance;
      const cardAfterSecond = (await CardRepository.getAll()).find((c) => c.id === 'card-1')?.availableLimit;
      const txsAfterSecond = await TransactionRepository.getAll();

      assert.strictEqual(accAfterSecond, accAfterFirst, 'Saldo bancario inalterado tras segundo intento');
      assert.strictEqual(cardAfterSecond, cardAfterFirst, 'Cupo inalterado tras segundo intento');
      assert.strictEqual(txsAfterSecond.length, txsAfterFirst.length, 'No se generaron transacciones duplicadas');
    });

    test('TEST 14: Abono a Tarjeta Superior a la Deuda Actual es RECHAZADO (amount > currentDebt)', async () => {
      // Card limit = 5.000.000, available = 4.900.000 -> Deuda = 100.000
      await testDb.db.runAsync('UPDATE credit_cards SET available_limit = ? WHERE id = ?', [4900000, 'card-1']);

      const excessivePaymentTx: Transaction = {
        id: 'tx-pay-excessive',
        accountId: 'acc-1',
        cardId: 'card-1',
        type: 'card_payment',
        amount: 200000, // Supera los $100.000 de deuda
        categoryId: 'cat-fin',
        description: 'Abono Excesivo',
        date: '2026-08-31',
        createdAt: '2026-08-31',
      };

      await assert.rejects(
        () => TransactionRepository.create(excessivePaymentTx),
        /El monto del abono \(\$200000\) no puede ser superior a la deuda actual de la tarjeta \(\$100000\)/
      );

      const acc = (await AccountRepository.getAll()).find((a) => a.id === 'acc-1');
      const card = (await CardRepository.getAll()).find((c) => c.id === 'card-1');
      const txs = await TransactionRepository.getAll();

      assert.strictEqual(acc?.balance, 2000000, 'Cuenta bancaria sin modificaciones');
      assert.strictEqual(card?.availableLimit, 4900000, 'Cupo de tarjeta sin modificaciones');
      assert.strictEqual(txs.length, 0, 'Ninguna transacción insertada');
    });

    test('TEST 15: Transacción con Monto Cero o Negativo es RECHAZADA', async () => {
      const zeroTx: Transaction = {
        id: 'tx-zero',
        accountId: 'acc-1',
        type: 'expense',
        amount: 0,
        categoryId: 'cat-food',
        description: 'Gasto Cero',
        date: '2026-08-31',
        createdAt: '2026-08-31',
      };

      await assert.rejects(
        () => TransactionRepository.create(zeroTx),
        /El monto de la transacción debe ser mayor a cero/
      );

      const negativeTx: Transaction = {
        ...zeroTx,
        id: 'tx-neg',
        amount: -50000,
      };

      await assert.rejects(
        () => TransactionRepository.create(negativeTx),
        /El monto de la transacción debe ser mayor a cero/
      );
    });
  });
});
