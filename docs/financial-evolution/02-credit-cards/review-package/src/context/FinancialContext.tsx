import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Account,
  CreditCard,
  Transaction,
  Category,
  Budget,
  CardPurchase,
  CardInstallment,
  CardStatement,
  CardStatementSummary,
  CardReconciliation,
} from '../types/finance';
import { getDatabase } from '../database/database';
import { AccountRepository } from '../database/repositories/accountRepository';
import { CardRepository } from '../database/repositories/cardRepository';
import { StatementRepository } from '../database/repositories/statementRepository';
import { ReconciliationRepository } from '../database/repositories/reconciliationRepository';
import { TransactionRepository } from '../database/repositories/transactionRepository';
import { CategoryRepository } from '../database/repositories/categoryRepository';
import { BudgetRepository } from '../database/repositories/budgetRepository';
import { seedSampleData } from '../database/seedDemoData';

interface FinancialContextType {
  isLoading: boolean;
  isBalanceHidden: boolean;
  toggleHideBalance: () => void;
  accounts: Account[];
  creditCards: CreditCard[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  activePurchases: CardPurchase[];
  currency: string;
  totalBankBalance: number;
  totalAllAccountsBalance: number;
  totalOtherDebts: number;
  totalCreditDebt: number;
  totalAllDebts: number;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpense: number;
  cardStatements: CardStatementSummary[];
  loadData: () => Promise<void>;
  refreshData: () => Promise<void>;
  addAccount: (account: Account) => Promise<void>;
  updateAccount: (account: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  addTransaction: (tx: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  updateTransaction: (id: string, tx: Transaction) => Promise<void>;
  addCreditCard: (card: CreditCard) => Promise<void>;
  updateCreditCard: (card: CreditCard) => Promise<void>;
  deleteCreditCard: (id: string) => Promise<void>;
  addCardPurchase: (purchase: CardPurchase, installments: CardInstallment[]) => Promise<void>;
  deleteCardPurchase: (purchaseId: string) => Promise<void>;
  payCardInstallment: (
    installmentId: string,
    purchaseId?: string,
    principalAmount?: number,
    cardId?: string,
    totalAmount?: number,
    accountId?: string
  ) => Promise<void>;
  payCreditCard: (
    cardId: string,
    amount: number,
    accountId: string,
    statementId?: string,
    options?: { isDirected?: boolean; targetPurchaseId?: string }
  ) => Promise<void>;
  reconcileCard: (
    cardId: string,
    statementId: string | undefined,
    reconciliationDate: string,
    appDebt: number,
    bankDebt: number,
    differenceCategory?: CardReconciliation['differenceCategory'],
    notes?: string
  ) => Promise<void>;
  createOpeningBalance: (data: {
    cardId: string;
    billingCycleId: string;
    statementDate: string;
    dueDate: string;
    principalTotal: number;
    interestAndFeesTotal: number;
    minimumPayment?: number;
    notes?: string;
  }) => Promise<CardStatement>;
  saveStatementSnapshot: (stmt: Omit<CardStatement, 'id' | 'createdAt'>) => Promise<CardStatement>;
  saveManualStatement: (stmt: CardStatement) => Promise<void>;
  getStatementsForCard: (cardId: string) => Promise<CardStatement[]>;
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

      const statements = await Promise.all(
        cards.map((card) => CardRepository.getCardStatementSummary(card))
      );
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

  // Deuda en tarjetas de crédito (los 3 saldos)
  const totalCreditDebt = cardStatements.reduce((sum, stmt) => sum + stmt.totalCurrentDebt, 0);

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
    .reduce((sum, t) => {
      if (t.type === 'expense' || t.type === 'card_purchase') {
        return sum + t.amount + (t.gmfAmount || 0);
      }
      if (t.type === 'transfer' && t.gmfAmount) {
        return sum + t.gmfAmount;
      }
      return sum;
    }, 0);

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

  const addTransaction = async (transaction: Transaction) => {
    await TransactionRepository.create(transaction);
    await loadData();
  };

  const deleteTransaction = async (id: string) => {
    await TransactionRepository.delete(id);
    await loadData();
  };

  const updateTransaction = async (id: string, transaction: Transaction) => {
    await TransactionRepository.update(id, transaction);
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

  const addCardPurchase = async (purchase: CardPurchase, installments: CardInstallment[]) => {
    await CardRepository.createPurchaseAtomic(purchase, installments);
    await loadData();
  };

  const payCardInstallment = async (
    installmentId: string,
    _purchaseId?: string,
    _principalAmount?: number,
    _cardId?: string,
    _totalAmount?: number,
    accountId?: string
  ) => {
    // SQLite es la única fuente de verdad: consulta cuota, capital, interés y tarjeta directamente en la DB
    await CardRepository.payInstallmentAtomic(installmentId, accountId);
    await loadData();
  };

  const payCreditCard = async (
    cardId: string,
    amount: number,
    accountId: string,
    statementId?: string,
    options?: { isDirected?: boolean; targetPurchaseId?: string }
  ) => {
    await CardRepository.payCreditCardAtomic(cardId, accountId, amount, statementId, options);
    await loadData();
  };

  const deleteCardPurchase = async (purchaseId: string) => {
    await CardRepository.deletePurchase(purchaseId);
    await loadData();
  };

  const reconcileCard = async (
    cardId: string,
    statementId: string | undefined,
    reconciliationDate: string,
    appDebt: number,
    bankDebt: number,
    differenceCategory?: CardReconciliation['differenceCategory'],
    notes?: string
  ) => {
    const diff = +(bankDebt - appDebt).toFixed(2);
    const recId = `rec-${cardId}-${Date.now()}`;
    await ReconciliationRepository.createReconciliation({
      id: recId,
      cardId,
      statementId,
      reconciliationDate,
      appCalculatedDebt: appDebt,
      bankReportedDebt: bankDebt,
      differenceAmount: diff,
      differenceCategory: differenceCategory || 'unclassified',
      notes,
      createdAt: new Date().toISOString(),
    });
    await loadData();
  };

  const createOpeningBalance = async (data: {
    cardId: string;
    billingCycleId: string;
    statementDate: string;
    dueDate: string;
    principalTotal: number;
    interestAndFeesTotal: number;
    minimumPayment?: number;
    notes?: string;
  }): Promise<CardStatement> => {
    const created = await StatementRepository.createOpeningBalanceSnapshot(data);
    await loadData();
    return created;
  };

  const saveStatementSnapshot = async (stmt: Omit<CardStatement, 'id' | 'createdAt'>): Promise<CardStatement> => {
    const created = await StatementRepository.createSnapshot(stmt);
    await loadData();
    return created;
  };

  const saveManualStatement = async (stmt: CardStatement): Promise<void> => {
    await StatementRepository.createManualStatement(stmt);
    await loadData();
  };

  const getStatementsForCard = async (cardId: string): Promise<CardStatement[]> => {
    return StatementRepository.getStatementsForCard(cardId);
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
      DELETE FROM card_statements;
      DELETE FROM card_billing_cycles;
      DELETE FROM card_payment_allocations;
      DELETE FROM card_reconciliations;
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
        loadData,
        refreshData: loadData,
        addTransaction,
        deleteTransaction,
        updateTransaction,
        addAccount,
        updateAccount,
        deleteAccount,
        addCreditCard,
        updateCreditCard,
        deleteCreditCard,
        addCardPurchase,
        deleteCardPurchase,
        payCardInstallment,
        payCreditCard,
        reconcileCard,
        createOpeningBalance,
        saveStatementSnapshot,
        saveManualStatement,
        getStatementsForCard,
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

