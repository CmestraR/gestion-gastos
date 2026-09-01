import type { CardIssuerId } from '../../types/finance.ts';

export type AllocationConcept =
  | 'taxes_and_fees'
  | 'handling_fee'
  | 'collection_fee'
  | 'late_interest'
  | 'current_interest'
  | 'principal';

export interface StatementAllocationContext {
  creditLimit: number;
  availableLimit: number;
  totalStatementBalance: number;
  statementBalancePaid: number;
  minimumPaymentOriginal: number;
  minimumPaymentPaid: number;
  taxesAndFees: number;
  handlingFee: number;
  collectionFee: number;
  lateInterest: number;
  currentInterest: number;
  principalTotal: number;
  unbilledDebt: number;
  billedPrincipalRemaining?: number;
  unbilledPrincipalRemaining?: number;
  unbilledCollectionPending?: number;
  unbilledLateInterestPending?: number;
  unbilledCurrentInterestPending?: number;
  unbilledFeesPending?: number;
  unbilledTaxesPending?: number;
}

export interface AllocationResult {
  totalPayment: number;
  taxesAndFeesApplied: number;
  handlingFeeApplied: number;
  collectionFeeApplied: number;
  lateInterestApplied: number;
  currentInterestApplied: number;
  principalApplied: number;
  creditBalanceApplied: number;
  statementApplied: number;
  unbilledApplied: number;
  minimumApplied: number;
  unbilledCollectionApplied?: number;
  unbilledLateInterestApplied?: number;
  unbilledCurrentInterestApplied?: number;
  unbilledFeesApplied?: number;
  unbilledTaxesApplied?: number;
  remainingStatementBalance: number;
  remainingMinimumPayment: number;
  resultingAvailableLimit: number;
  isEstimated: boolean;
  notes?: string;
}

export interface CreditCardIssuerPolicy {
  readonly issuerId: CardIssuerId;
  readonly issuerName: string;
  readonly supportsDirectedPayment: boolean;
  readonly supportsAlternativePayment: boolean;
  readonly supportsEarlyPayment: boolean;
  readonly isEstimated?: boolean;
  readonly allocationOrder: AllocationConcept[];

  allocatePayment(
    paymentAmount: number,
    ctx: StatementAllocationContext,
    options?: { isDirected?: boolean; targetPurchaseId?: string }
  ): AllocationResult;
}
