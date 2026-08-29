export type AccountType = 'savings' | 'checking' | 'cash' | 'wallet' | 'investment' | 'debt';
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'other';
export type TransactionType = 'expense' | 'income' | 'transfer' | 'card_payment' | 'card_purchase';
export type PurchaseStatus = 'active' | 'completed' | 'cancelled';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  bankName: string;
  balance: number;
  initialBalance: number;
  currency: string;
  color: string;
  icon: string;
  includeInTotal: boolean; // Si cuenta en el saldo disponible total
  hasGmf4x1000?: boolean; // Si aplica impuesto del 4x1000 (0.4%) a débitos
  interestRateMonthly?: number; // Tasa de interés mensual si es una deuda (% E.M.)
  debtLimit?: number; // Límite de crédito/fiado si aplica
  dueDate?: number; // Día de pago del mes si aplica (1-31)
  isArchived: boolean;
  createdAt: string;
}

export interface CreditCard {
  id: string;
  name: string;
  bankName: string;
  cardBrand: CardBrand;
  lastFourDigits?: string;
  creditLimit: number;
  availableLimit: number;
  cutOffDay: number; // 1-31
  paymentDueDay: number; // 1-31
  interestRateMonthly: number; // Percentage e.g. 2.15% E.M.
  handlingFee: number; // Cuota de manejo mensual
  colorGradient: [string, string];
  currency: string;
  isArchived: boolean;
  createdAt: string;
}

export interface CardPurchase {
  id: string;
  cardId: string;
  description: string;
  categoryId: string;
  amount: number;
  installmentsTotal: number;
  installmentsPaid: number;
  monthlyInstallmentAmount: number;
  interestRateMonthly: number;
  firstInstallmentDate: string; // YYYY-MM-DD
  status: PurchaseStatus;
  createdAt: string;
}

export interface CardInstallment {
  id: string;
  purchaseId: string;
  installmentNumber: number;
  dueDate: string; // YYYY-MM-DD
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  isPaid: boolean;
  paidDate?: string;
}

export interface Transaction {
  id: string;
  accountId?: string | null;
  cardId?: string | null;
  type: TransactionType;
  amount: number;
  categoryId: string;
  description: string;
  notes?: string;
  date: string; // YYYY-MM-DD or ISO string
  toAccountId?: string | null; // For transfers
  cardPurchaseId?: string | null; // Linked purchase
  gmfAmount?: number; // Monto cobrado por 4x1000 si aplica
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'expense' | 'income';
  icon: string;
  color: string;
  keywords?: string[]; // Palabras clave para IA/clasificador automático
  isDefault?: boolean;
}

export interface Budget {
  id: string;
  categoryId: string;
  monthlyLimit: number;
  monthYear: string; // YYYY-MM
  createdAt: string;
}

export interface CardStatementSummary {
  cardId: string;
  cycleMonth: string; // YYYY-MM
  cutOffDate: string;
  paymentDueDate: string;
  daysToCutOff: number;
  daysToPayment: number;
  currentInstallmentsTotal: number;
  singleQuotaPurchasesTotal: number;
  handlingFee: number;
  estimatedInterestTotal: number;
  totalToPayThisMonth: number;
  minimumPayment: number;
  usedCredit: number;
  availableCredit: number;
  creditLimit: number;
}
