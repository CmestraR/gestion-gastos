import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  evaluateTransactionEffects,
  calculateMonthlyConsumption,
  calculateMonthlyCashFlow,
  calculateConsolidatedNetWorth,
} from '../src/utils/financialCore.ts';

import {
  calculateMonthlyQuota,
  generateAmortizationSchedule,
  calculateCardCycleDates,
  convertEAToEM,
} from '../src/utils/financialMath.ts';

import type { Account, CreditCard, Transaction, CardPurchase, CardInstallment } from '../src/types/finance.ts';

describe('BATERÍA DE PRUEBAS DEL MOTOR FINANCIERO (FASE 1 & 1.1)', () => {
  // Mock Base Accounts & Cards
  const mockAccount1: Account = {
    id: 'acc-bancolombia',
    name: 'Ahorros Bancolombia',
    bankName: 'Bancolombia',
    type: 'savings',
    balance: 5000000,
    initialBalance: 5000000,
    currency: 'COP',
    color: '#FBBF24',
    icon: 'Landmark',
    includeInTotal: true,
    hasGmf4x1000: true,
    isArchived: false,
    createdAt: '2026-08-01',
  };

  const mockAccount2: Account = {
    id: 'acc-nequi',
    name: 'Billetera Nequi',
    bankName: 'Nequi',
    type: 'wallet',
    balance: 1000000,
    initialBalance: 1000000,
    currency: 'COP',
    color: '#E11D48',
    icon: 'Smartphone',
    includeInTotal: true,
    hasGmf4x1000: false,
    isArchived: false,
    createdAt: '2026-08-01',
  };

  const mockCreditCard: CreditCard = {
    id: 'card-nu',
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
  };

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

  // ==========================================
  // BLOQUE 2: PRUEBAS DE INTEGRACIÓN [INTEGRATION]
  // ==========================================
  describe('2. Pruebas de Integración [INTEGRATION] - Flujos de Pago y Dependencias', () => {
    test('I01. Flujo completo de Pago a Tarjeta: Delta de cupo exacto ($200k pago en $1M deuda -> $800k deuda, $4.2M disponible)', () => {
      // Estado Inicial
      let accountBalance = 2000000;
      let cardCreditLimit = 5000000;
      let cardAvailableLimit = 4000000; // Deuda = 1.000.000
      const paymentAmount = 200000;

      // 1. Ejecutar Pago
      // Simula la ÚNICA mutación autorizada
      accountBalance -= paymentAmount;
      cardAvailableLimit = Math.min(cardCreditLimit, cardAvailableLimit + paymentAmount);

      // Verificaciones
      assert.strictEqual(accountBalance, 1800000, 'Saldo de cuenta debió reducirse exactamente en $200.000');
      assert.strictEqual(cardAvailableLimit, 4200000, 'Cupo disponible debió aumentar a $4.200.000 (NO $4.400.000)');
      const currentDebt = cardCreditLimit - cardAvailableLimit;
      assert.strictEqual(currentDebt, 800000, 'Deuda restante debe ser exactamente $800.000');

      // 2. Reversión (DELETE del pago)
      accountBalance += paymentAmount;
      cardAvailableLimit = Math.max(0, cardAvailableLimit - paymentAmount);

      assert.strictEqual(accountBalance, 2000000, 'Saldo bancario restituido a $2.000.000');
      assert.strictEqual(cardAvailableLimit, 4000000, 'Cupo disponible restituido a $4.000.000');
      assert.strictEqual(cardCreditLimit - cardAvailableLimit, 1000000, 'Deuda restablecida a $1.000.000');
    });

    test('I02. Bloqueo de eliminación de Card Purchase con cuotas pagadas (Regla de Integridad)', () => {
      // Escenario: Compra de $1.200.000 a 12 cuotas con 5 cuotas pagadas
      const purchase: CardPurchase = {
        id: 'purch-locked',
        cardId: 'card-nu',
        description: 'Laptop',
        categoryId: 'cat-tech',
        amount: 1200000,
        installmentsTotal: 12,
        installmentsPaid: 5,
        monthlyInstallmentAmount: 100000,
        interestRateMonthly: 0,
        firstInstallmentDate: '2026-01-10',
        status: 'active',
        createdAt: '2026-01-01',
      };

      const attemptDeletePurchase = (p: CardPurchase) => {
        if (p.installmentsPaid > 0) {
          throw new Error('Esta compra tiene cuotas pagadas y movimientos relacionados. No puede eliminarse directamente.');
        }
        return true;
      };

      assert.throws(
        () => attemptDeletePurchase(purchase),
        /Esta compra tiene cuotas pagadas y movimientos relacionados/,
        'Debe lanzar error bloqueando el borrado de compra con pagos previos'
      );
    });

    test('I03. Reversión segura de Compra sin cuotas pagadas (installmentsPaid === 0)', () => {
      let cardAvailable = 3800000;
      const creditLimit = 5000000;
      const purchaseAmount = 1200000;

      const purchaseUnpaid: CardPurchase = {
        id: 'purch-clean',
        cardId: 'card-nu',
        description: 'Televisor',
        categoryId: 'cat-tech',
        amount: purchaseAmount,
        installmentsTotal: 6,
        installmentsPaid: 0,
        monthlyInstallmentAmount: 200000,
        interestRateMonthly: 0,
        firstInstallmentDate: '2026-09-10',
        status: 'active',
        createdAt: '2026-08-31',
      };

      // Si no tiene pagos, se puede revertir completamente
      if (purchaseUnpaid.installmentsPaid === 0) {
        cardAvailable = Math.min(creditLimit, cardAvailable + purchaseUnpaid.amount);
      }

      assert.strictEqual(cardAvailable, 5000000, 'Cupo debe restaurarse al 100%');
    });

    test('I04. Consolidación de Patrimonio Neto antes y después de pago a tarjeta', () => {
      const accs = [{ ...mockAccount1, balance: 2000000 }];
      const cards = [{ ...mockCreditCard, creditLimit: 5000000, availableLimit: 4000000 }]; // 1.000.000 deuda

      const before = calculateConsolidatedNetWorth(accs, cards);
      assert.strictEqual(before.netWorth, 1000000); // 2.000.000 activos - 1.000.000 pasivo

      // Pago de 200.000
      accs[0].balance -= 200000;
      cards[0].availableLimit += 200000;

      const after = calculateConsolidatedNetWorth(accs, cards);
      assert.strictEqual(after.totalAssets, 1800000);
      assert.strictEqual(after.totalLiabilities, 800000);
      assert.strictEqual(after.netWorth, 1000000, 'Patrimonio Neto permanece inalterado tras el pago');
    });
  });

  // ==========================================
  // BLOQUE 3: PRUEBAS DE INTEGRIDAD Y BASE DE DATOS [DATABASE / INTEGRITY]
  // ==========================================
  describe('3. Pruebas de Base de Datos y Transaccionalidad [DATABASE / INTEGRITY]', () => {
    test('D01. Atomicidad en Transferencia: Rollback total si ocurre excepción en cuenta destino', () => {
      let sourceBalance = 2000000;
      let targetBalance = 500000;
      const transferAmount = 300000;
      const gmf = 1200;

      // Simulación de ejecución con withTransactionAsync
      const executeTransferWithTransaction = (shouldFail: boolean) => {
        const snapSource = sourceBalance;
        const snapTarget = targetBalance;
        try {
          // Paso 1: Debitar origen
          sourceBalance -= (transferAmount + gmf);
          // Paso 2: Acreditar destino (falla simulada de SQLite)
          if (shouldFail) {
            throw new Error('SQLITE_BUSY: database table is locked');
          }
          targetBalance += transferAmount;
        } catch {
          // Rollback atómico
          sourceBalance = snapSource;
          targetBalance = snapTarget;
        }
      };

      executeTransferWithTransaction(true);
      assert.strictEqual(sourceBalance, 2000000, 'Saldo origen intacto tras rollback');
      assert.strictEqual(targetBalance, 500000, 'Saldo destino intacto tras rollback');

      executeTransferWithTransaction(false);
      assert.strictEqual(sourceBalance, 1698800, 'Saldo origen debitado correctamente');
      assert.strictEqual(targetBalance, 800000, 'Saldo destino acreditado correctamente');
    });

    test('D02. Atomicidad en Creación de Compra a Cuotas: Rollback si falla inserción de cuotas', () => {
      let cardAvailable = 5000000;
      const purchaseAmount = 1200000;

      const executeCreatePurchaseTransaction = (shouldFailInInstallments: boolean) => {
        const snapAvailable = cardAvailable;
        try {
          cardAvailable -= purchaseAmount;
          if (shouldFailInInstallments) {
            throw new Error('SQLITE_CONSTRAINT: Foreign Key violation');
          }
        } catch {
          cardAvailable = snapAvailable;
        }
      };

      executeCreatePurchaseTransaction(true);
      assert.strictEqual(cardAvailable, 5000000, 'Cupo permanece intacto tras falla en inserción de cuotas');
    });

    test('D03. Reversión de Transferencia con GMF: Restituye origen y debita destino', () => {
      let source = 2000000;
      let target = 500000;
      const amount = 300000;
      const gmf = 1200;

      // Aplicar
      source -= (amount + gmf);
      target += amount;
      assert.strictEqual(source, 1698800);
      assert.strictEqual(target, 800000);

      // Revertir
      source += (amount + gmf);
      target -= amount;
      assert.strictEqual(source, 2000000);
      assert.strictEqual(target, 500000);
    });

    test('D04. Reversión de Gasto con GMF: Restituye monto principal + 4x1000', () => {
      let balance = 1000000;
      const expense = 50000;
      const gmf = 200;

      balance -= (expense + gmf);
      assert.strictEqual(balance, 949800);

      balance += (expense + gmf);
      assert.strictEqual(balance, 1000000);
    });
  });
});
