import { Account, CreditCard, CardPurchase, Transaction } from '../types/finance';
import { AccountRepository } from './repositories/accountRepository';
import { CardRepository } from './repositories/cardRepository';
import { TransactionRepository } from './repositories/transactionRepository';
import { generateAmortizationSchedule } from '../utils/financialMath';

export async function seedSampleData(): Promise<void> {
  const existingAccounts = await AccountRepository.getAll();
  if (existingAccounts.length > 0) return;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // 1. Cuentas
  const accounts: Account[] = [
    {
      id: 'acc-bancolombia',
      name: 'Cuenta de Ahorros',
      bankName: 'Bancolombia',
      type: 'savings',
      balance: 3850000,
      initialBalance: 3850000,
      currency: 'COP',
      color: '#FBBF24',
      icon: 'Landmark',
      includeInTotal: true,
      isArchived: false,
      createdAt: todayStr,
    },
    {
      id: 'acc-nequi',
      name: 'Billetera Nequi',
      bankName: 'Nequi',
      type: 'wallet',
      balance: 620000,
      initialBalance: 620000,
      currency: 'COP',
      color: '#E11D48',
      icon: 'Smartphone',
      includeInTotal: true,
      isArchived: false,
      createdAt: todayStr,
    },
    {
      id: 'acc-cash',
      name: 'Efectivo en Billetera',
      bankName: 'Efectivo',
      type: 'cash',
      balance: 180000,
      initialBalance: 180000,
      currency: 'COP',
      color: '#10B981',
      icon: 'Wallet',
      includeInTotal: true,
      isArchived: false,
      createdAt: todayStr,
    },
  ];

  for (const acc of accounts) {
    await AccountRepository.create(acc);
  }

  // 2. Tarjetas de Crédito
  const creditCards: CreditCard[] = [
    {
      id: 'card-visa-gold',
      name: 'Visa Black',
      bankName: 'Bancolombia',
      cardBrand: 'visa',
      lastFourDigits: '4829',
      creditLimit: 8000000,
      availableLimit: 5650000,
      cutOffDay: 15,
      paymentDueDay: 5,
      interestRateMonthly: 2.15, // 2.15% E.M.
      handlingFee: 28500,
      colorGradient: ['#1E1B4B', '#4338CA'],
      currency: 'COP',
      isArchived: false,
      createdAt: todayStr,
    },
    {
      id: 'card-nu-mastercard',
      name: 'Nu Crédito',
      bankName: 'Nubank',
      cardBrand: 'mastercard',
      lastFourDigits: '9103',
      creditLimit: 4000000,
      availableLimit: 3400000,
      cutOffDay: 28,
      paymentDueDay: 18,
      interestRateMonthly: 2.20,
      handlingFee: 0,
      colorGradient: ['#4C1D95', '#8B5CF6'],
      currency: 'COP',
      isArchived: false,
      createdAt: todayStr,
    },
  ];

  for (const card of creditCards) {
    await CardRepository.create(card);
  }

  // 3. Compras a cuotas en Tarjetas
  const purchase1: CardPurchase = {
    id: 'purch-macbook',
    cardId: 'card-visa-gold',
    description: 'Computador Portátil',
    categoryId: 'cat-shopping',
    amount: 1800000,
    installmentsTotal: 6,
    installmentsPaid: 2,
    monthlyInstallmentAmount: 322800,
    interestRateMonthly: 2.15,
    firstInstallmentDate: '2026-07-05',
    status: 'active',
    createdAt: '2026-06-28',
  };

  const schedule1 = generateAmortizationSchedule(
    purchase1.id,
    purchase1.amount,
    purchase1.interestRateMonthly,
    purchase1.installmentsTotal,
    new Date(2026, 6, 5)
  );

  // Marcar las 2 primeras como pagadas
  if (schedule1[0]) {
    schedule1[0].isPaid = true;
    schedule1[0].paidDate = '2026-07-05';
  }
  if (schedule1[1]) {
    schedule1[1].isPaid = true;
    schedule1[1].paidDate = '2026-08-05';
  }

  await CardRepository.createPurchase(purchase1, schedule1);

  const purchase2: CardPurchase = {
    id: 'purch-flight',
    cardId: 'card-nu-mastercard',
    description: 'Tiquetes Aéreos Vacaciones',
    categoryId: 'cat-entertainment',
    amount: 600000,
    installmentsTotal: 3,
    installmentsPaid: 0,
    monthlyInstallmentAmount: 208900,
    interestRateMonthly: 2.20,
    firstInstallmentDate: '2026-09-18',
    status: 'active',
    createdAt: '2026-08-20',
  };

  const schedule2 = generateAmortizationSchedule(
    purchase2.id,
    purchase2.amount,
    purchase2.interestRateMonthly,
    purchase2.installmentsTotal,
    new Date(2026, 8, 18)
  );

  await CardRepository.createPurchase(purchase2, schedule2);

  // 4. Transacciones recientes
  const sampleTransactions: Transaction[] = [
    {
      id: 'tx-1',
      accountId: 'acc-bancolombia',
      type: 'income',
      amount: 4500000,
      categoryId: 'cat-salary',
      description: 'Pago de Nómina Quincenal',
      date: todayStr,
      createdAt: todayStr,
    },
    {
      id: 'tx-2',
      accountId: 'acc-nequi',
      type: 'expense',
      amount: 45000,
      categoryId: 'cat-food',
      description: 'Almuerzo de trabajo',
      date: todayStr,
      createdAt: todayStr,
    },
    {
      id: 'tx-3',
      accountId: 'acc-cash',
      type: 'expense',
      amount: 15000,
      categoryId: 'cat-transport',
      description: 'Recarga Transporte / Pasajes',
      date: todayStr,
      createdAt: todayStr,
    },
    {
      id: 'tx-4',
      accountId: 'acc-bancolombia',
      type: 'expense',
      amount: 120000,
      categoryId: 'cat-housing',
      description: 'Servicio de Internet & Telefonía',
      date: todayStr,
      createdAt: todayStr,
    },
  ];

  for (const tx of sampleTransactions) {
    await TransactionRepository.create(tx);
  }
}
