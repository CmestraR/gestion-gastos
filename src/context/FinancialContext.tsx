import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Account,
  CreditCard,
  Transaction,
  Category,
  Budget,
  CardPurchase,
  CardStatementSummary,
} from '../types/finance';
import { getDatabase } from '../database/database';
import { AccountRepository } from '../database/repositories/accountRepository';
import { CardRepository } from '../database/repositories/cardRepository';
import { TransactionRepository } from '../database/repositories/transactionRepository';
import { CategoryRepository } from '../database/repositories/categoryRepository';
import { BudgetRepository } from '../database/repositories/budgetRepository';
import { calculateCardStatement } from '../utils/financialMath';
import { seedSampleData } from '../database/seedDemoData';

interface FinancialContextType {
  isLoading: boolean;
  accounts: Account[];
  creditCards: CreditCard[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  activePurchases: CardPurchase[];
  currency: string;
  isBalanceHidden: boolean;
  toggleHideBalance: () => void;
  totalBankBalance: number;
  totalAllAccountsBalance: number;
  totalCreditDebt: number;
  totalOtherDebts: number;
  totalAllDebts: number;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpense: number;
  cardStatements: CardStatementSummary[];
  refreshData: () => Promise<void>;
  addTransaction: (tx: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addAccount: (account: Account) => Promise<void>;
  updateAccount: (account: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  addCreditCard: (card: CreditCard) => Promise<void>;
  updateCreditCard: (card: CreditCard) => Promise<void>;
  deleteCreditCard: (id: string) => Promise<void>;
  addCardPurchase: (purchase: CardPurchase, installments: any[]) => Promise<void>;
  payCardInstallment: (
    installmentId: string,
    purchaseId: string,
    principalAmount: number,
    cardId: string,
    totalAmount: number,
    accountId?: string
  ) => Promise<void>;
  payCreditCard: (cardId: string, amount: number, accountId: string, notes?: string) => Promise<void>;
  addCategory: (category: Category) => Promise<void>;
  updateCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  setCurrencyPreference: (currency: string) => Promise<void>;
  loadDemoData: () => Promise<void>;
  resetDatabase: () => Promise<void>;
}

const FinancialContext = createContext<FinancialContextType | undefined>(undefined);

export const FinancialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditCards, setCreditCards] = useState<CreditCard[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [activePurchases, setActivePurchases] = useState<CardPurchase[]>([]);
  const [currency, setCurrency] = useState<string>('COP');
  const [cardStatements, setCardStatements] = useState<CardStatementSummary[]>([]);

  const toggleHideBalance = async () => {
    const nextVal = !isBalanceHidden;
    setIsBalanceHidden(nextVal);
    await AsyncStorage.setItem('@pref_hide_balance', nextVal ? 'true' : 'false');
  };

  const loadData = useCallback(async () => {
    try {
      await getDatabase();

      const savedCurrency = await AsyncStorage.getItem('@pref_currency');
      if (savedCurrency) {
        setCurrency(savedCurrency);
      }

      const savedHide = await AsyncStorage.getItem('@pref_hide_balance');
      if (savedHide === 'true') {
        setIsBalanceHidden(true);
      }

      const isFirstRun = await AsyncStorage.getItem('@app_initialized_v1');
      if (!isFirstRun) {
        // Inicialización limpia en 0 (sin datos de ejemplo predeterminados)
        await AsyncStorage.setItem('@app_initialized_v1', 'true');
      }

      const [accs, cards, txs, cats, purchases] = await Promise.all([
        AccountRepository.getAll(),
        CardRepository.getAll(),
        TransactionRepository.getAll(),
        CategoryRepository.getAll(),
        CardRepository.getAllActivePurchases(),
      ]);

      const currentMonth = new Date().toISOString().substring(0, 7);
      const currentBudgets = await BudgetRepository.getForMonth(currentMonth);

      setAccounts(accs);
      setCreditCards(cards);
      setTransactions(txs);
      setCategories(cats);
      setBudgets(currentBudgets);
      setActivePurchases(purchases);

      const statements = cards.map((card) => {
        const cardPurchases = purchases.filter((p) => p.cardId === card.id);
        return calculateCardStatement(card, cardPurchases);
      });
      setCardStatements(statements);
    } catch (error) {
      console.error('Error loading financial data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Saldo disponible (solo cuentas líquidas: ahorros, corriente, billetera, efectivo)
  const totalBankBalance = accounts
    .filter((acc) => acc.type !== 'debt' && acc.includeInTotal !== false)
    .reduce((sum, acc) => sum + acc.balance, 0);

  const totalAllAccountsBalance = accounts
    .filter((acc) => acc.type !== 'debt')
    .reduce((sum, acc) => sum + acc.balance, 0);

  // Deudas personales acumuladas (cafetería, fiados, préstamos)
  const totalOtherDebts = accounts
    .filter((acc) => acc.type === 'debt')
    .reduce((sum, acc) => sum + Math.abs(acc.balance < 0 ? acc.balance : 0), 0);

  // Deuda en tarjetas de crédito
  const totalCreditDebt = cardStatements.reduce((sum, stmt) => sum + stmt.usedCredit, 0);

  // Deuda total consolidada
  const totalAllDebts = totalCreditDebt + totalOtherDebts;

  // Patrimonio Neto = Activos Disponibles - Todas las Deudas
  const netWorth = totalBankBalance - totalAllDebts;

  const currentMonthPrefix = new Date().toISOString().substring(0, 7);
  const currentMonthTransactions = transactions.filter((t) => t.date.startsWith(currentMonthPrefix));

  const monthlyIncome = currentMonthTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const monthlyExpense = currentMonthTransactions
    .filter((t) => t.type === 'expense' || t.type === 'card_purchase')
    .reduce((sum, t) => sum + t.amount, 0);

  const addTransaction = async (tx: Transaction) => {
    await TransactionRepository.create(tx);
    await loadData();
  };

  const deleteTransaction = async (id: string) => {
    await TransactionRepository.delete(id);
    await loadData();
  };

  const addAccount = async (account: Account) => {
    await AccountRepository.create(account);
    await loadData();
  };

  const updateAccount = async (account: Account) => {
    await AccountRepository.update(account);
    await loadData();
  };

  const deleteAccount = async (id: string) => {
    await AccountRepository.delete(id);
    await loadData();
  };

  const addCreditCard = async (card: CreditCard) => {
    await CardRepository.create(card);
    await loadData();
  };

  const updateCreditCard = async (card: CreditCard) => {
    await CardRepository.update(card);
    await loadData();
  };

  const deleteCreditCard = async (id: string) => {
    await CardRepository.delete(id);
    await loadData();
  };

  const addCardPurchase = async (purchase: CardPurchase, installments: any[]) => {
    await CardRepository.createPurchase(purchase, installments);
    const tx: Transaction = {
      id: `tx-purch-${purchase.id}`,
      cardId: purchase.cardId,
      type: 'card_purchase',
      amount: purchase.amount,
      categoryId: purchase.categoryId,
      description: purchase.description,
      notes: `${purchase.installmentsTotal} cuotas (${purchase.interestRateMonthly}% E.M.)`,
      date: purchase.firstInstallmentDate,
      cardPurchaseId: purchase.id,
      createdAt: purchase.createdAt,
    };
    await TransactionRepository.create(tx);
    await loadData();
  };

  const payCardInstallment = async (
    installmentId: string,
    purchaseId: string,
    principalAmount: number,
    cardId: string,
    totalAmount: number,
    accountId?: string
  ) => {
    await CardRepository.markInstallmentAsPaid(installmentId, purchaseId, principalAmount, cardId);
    if (accountId) {
      await AccountRepository.updateBalance(accountId, -totalAmount);
    }
    const tx: Transaction = {
      id: `tx-pay-inst-${installmentId}`,
      accountId: accountId || null,
      type: 'card_payment',
      amount: totalAmount,
      categoryId: 'cat-financial',
      description: `Pago Cuota`,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };
    await TransactionRepository.create(tx);
    await loadData();
  };

  const payCreditCard = async (cardId: string, amount: number, accountId: string, notes?: string) => {
    const card = creditCards.find((c) => c.id === cardId);
    if (card) {
      const newAvailable = Math.min(card.creditLimit, card.availableLimit + amount);
      await CardRepository.updateAvailableLimit(cardId, newAvailable);
    }
    await AccountRepository.updateBalance(accountId, -amount);
    const tx: Transaction = {
      id: `tx-card-pay-${Date.now()}`,
      accountId,
      cardId,
      type: 'card_payment',
      amount,
      categoryId: 'cat-financial',
      description: `Abono a Tarjeta ${card?.name || ''}`,
      notes,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
    };
    await TransactionRepository.create(tx);
    await loadData();
  };

  const addCategory = async (category: Category) => {
    await CategoryRepository.create(category);
    await loadData();
  };

  const updateCategory = async (category: Category) => {
    await CategoryRepository.update(category);
    await loadData();
  };

  const deleteCategory = async (id: string) => {
    await CategoryRepository.delete(id);
    await loadData();
  };

  const setCurrencyPreference = async (curr: string) => {
    setCurrency(curr);
    await AsyncStorage.setItem('@pref_currency', curr);
  };

  const loadDemoData = async () => {
    setIsLoading(true);
    await seedSampleData();
    await loadData();
  };

  const resetDatabase = async () => {
    setIsLoading(true);
    const db = await getDatabase();
    await db.execAsync(`
      DELETE FROM transactions;
      DELETE FROM card_installments;
      DELETE FROM card_purchases;
      DELETE FROM credit_cards;
      DELETE FROM accounts;
      DELETE FROM budgets;
    `);
    await AsyncStorage.setItem('@app_initialized_v1', 'true');
    await loadData();
  };

  return (
    <FinancialContext.Provider
      value={{
        isLoading,
        accounts,
        creditCards,
        transactions,
        categories,
        budgets,
        activePurchases,
        currency,
        isBalanceHidden,
        toggleHideBalance,
        totalBankBalance,
        totalAllAccountsBalance,
        totalCreditDebt,
        totalOtherDebts,
        totalAllDebts,
        netWorth,
        monthlyIncome,
        monthlyExpense,
        cardStatements,
        refreshData: loadData,
        addTransaction,
        deleteTransaction,
        addAccount,
        updateAccount,
        deleteAccount,
        addCreditCard,
        updateCreditCard,
        deleteCreditCard,
        addCardPurchase,
        payCardInstallment,
        payCreditCard,
        addCategory,
        updateCategory,
        deleteCategory,
        setCurrencyPreference,
        loadDemoData,
        resetDatabase,
      }}
    >
      {children}
    </FinancialContext.Provider>
  );
};

export const useFinancial = () => {
  const context = useContext(FinancialContext);
  if (!context) {
    throw new Error('useFinancial must be used within a FinancialProvider');
  }
  return context;
};
