export type AccountType = 'savings' | 'checking' | 'cash' | 'wallet' | 'investment' | 'debt';
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'other';
export type CardIssuerId = 'nu' | 'bancolombia' | 'rappicard' | 'generic';
export type TransactionType = 'expense' | 'income' | 'transfer' | 'card_payment' | 'card_purchase' | 'balance_adjustment' | 'card_opening_balance';
export type PurchaseStatus = 'active' | 'completed' | 'cancelled';
export type BillingCycleStatus = 'open' | 'closed' | 'paid' | 'partially_paid' | 'overdue';
export type StatementStatus = 'open' | 'partially_paid' | 'minimum_covered' | 'paid' | 'overdue';

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
  issuerId?: CardIssuerId; // Emisor para reglas de imputación ('nu' | 'bancolombia' | 'rappicard' | 'generic')
  lastFourDigits?: string;
  creditLimit: number;
  availableLimit: number;
  cutOffDay: number; // 1-31
  paymentDueDay: number; // 1-31
  interestRateMonthly: number; // Percentage e.g. 2.15% E.M.
  lateInterestRateMonthly?: number; // Tasa de mora si aplica (% E.M.)
  handlingFee: number; // Cuota de manejo mensual
  positiveBalance?: number; // Saldo a favor si aplica
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

export interface CardBillingCycle {
  id: string;
  cardId: string;
  cycleNumber: number;
  startDate: string; // YYYY-MM-DD
  cutOffDate: string; // YYYY-MM-DD
  paymentDueDate: string; // YYYY-MM-DD
  status: BillingCycleStatus;
  createdAt: string;
}

export interface CardStatement {
  id: string;
  cardId: string;
  billingCycleId: string;
  statementDate: string; // YYYY-MM-DD (fecha del snapshot de corte)
  dueDate: string; // YYYY-MM-DD
  openingBalance: number; // Saldo anterior traído al corte
  purchasesTotal: number; // Total compras facturadas en este ciclo
  advancesTotal: number; // Avances en efectivo si aplica
  principalTotal: number; // Capital total facturado (cuotas + compras 1 cuota)
  currentInterest: number; // Intereses corrientes facturados
  lateInterest: number; // Intereses de mora facturados
  handlingFee: number; // Cuota de manejo facturada
  taxesAndFees: number; // Impuestos, comisiones o seguros
  collectionFee: number; // Gastos de cobranza si aplica
  totalStatementBalance: number; // Saldo total del extracto original (inmutable)
  minimumPaymentOriginal: number; // Pago mínimo informado por el banco
  statementBalancePaid: number; // Monto acumulado pagado hacia este extracto
  minimumPaymentPaid: number; // Monto acumulado pagado hacia el pago mínimo
  status: StatementStatus;
  isManualSnapshot?: boolean; // Si fue ingresado manualmente por el usuario
  isOpeningBalance?: boolean; // Si corresponde al saldo inicial de apertura de la tarjeta
  notes?: string;
  createdAt: string;
}

export interface PaymentAllocation {
  id: string;
  transactionId: string;
  cardId: string;
  statementId?: string;
  totalPayment: number;
  principalApplied: number; // Solo esto libera cupo disponible
  currentInterestApplied: number;
  lateInterestApplied: number;
  handlingFeeApplied: number;
  taxesAndFeesApplied: number;
  collectionFeeApplied: number;
  creditBalanceApplied: number;
  statementApplied: number; // Porción que amortiza el extracto
  unbilledApplied: number; // Porción que amortiza deuda post-corte
  minimumApplied: number; // Porción que cubre el pago mínimo
  createdAt: string;
}

export interface CardReconciliation {
  id: string;
  cardId: string;
  statementId?: string;
  reconciliationDate: string;
  appCalculatedDebt: number;
  bankReportedDebt: number;
  differenceAmount: number; // bankReportedDebt - appCalculatedDebt
  differenceCategory?: 'capital' | 'interest' | 'fees' | 'taxes' | 'collection' | 'unclassified';
  status?: 'applied' | 'pending_review';
  adjustmentTransactionId?: string;
  notes?: string;
  createdAt: string;
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
  cardInstallmentId?: string | null; // Linked specific installment
  statementId?: string | null; // Linked statement if card payment
  principalAmount?: number; // Capital portion (for card payments)
  interestAmount?: number; // Interest portion (for card payments)
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
  isCutOffPassed?: boolean;
  isPaymentOverdue?: boolean;
  // Los 3 saldos financieros de Fase 2.1 (Matemáticamente consistentes)
  principalDebt: number; // Capital total pendiente (creditLimit - availableLimit)
  nonPrincipalDebt: number; // Intereses, comisiones, impuestos, mora pendientes
  totalCurrentDebt: number; // Deuda Total Actual (principalDebt + nonPrincipalDebt)
  billedStatementDebtRemaining: number; // Saldo Facturado Pendiente del último extracto
  unbilledDebt: number; // Deuda No Facturada (totalCurrentDebt - billedStatementDebtRemaining)
  billedPrincipalRemaining: number; // Capital facturado pendiente en el extracto
  unbilledPrincipalRemaining: number; // Capital no facturado (compras post-corte)
  billedNonPrincipalRemaining: number; // Cargos/intereses facturados pendientes
  unbilledNonPrincipalRemaining: number; // Cargos/intereses no facturados
  hasInconsistency?: boolean; // Flag si billedStatementDebtRemaining > totalCurrentDebt
  inconsistencyReason?: string;
  minimumPaymentRemaining: number; // Pago mínimo pendiente
  minimumPaymentOriginal: number; // Pago mínimo original
  totalStatementBalanceOriginal: number; // Saldo total del extracto original
  statementStatus: StatementStatus;
  // Desglose de componentes
  currentInstallmentsTotal: number;
  singleQuotaPurchasesTotal: number;
  handlingFee: number;
  estimatedInterestTotal: number;
  totalToPayThisMonth: number;
  minimumPayment: number;
  usedCredit: number;
  availableCredit: number;
  creditLimit?: number;
  hasStatementSnapshot?: boolean;
}
