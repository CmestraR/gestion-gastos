import type {
  CreditCardIssuerPolicy,
  StatementAllocationContext,
  AllocationResult,
  AllocationConcept,
} from './types.ts';

export class NuPolicy implements CreditCardIssuerPolicy {
  readonly issuerId = 'nu';
  readonly issuerName = 'Nu Colombia';
  readonly supportsDirectedPayment = false;
  readonly supportsAlternativePayment = false;
  readonly supportsEarlyPayment = true;
  readonly isEstimated = false;
  readonly allocationOrder: AllocationConcept[] = [
    'taxes_and_fees',
    'handling_fee',
    'late_interest',
    'current_interest',
    'principal',
  ];

  allocatePayment(
    paymentAmount: number,
    ctx: StatementAllocationContext,
    options?: { isDirected?: boolean; targetPurchaseId?: string }
  ): AllocationResult {
    if (options?.isDirected && !this.supportsDirectedPayment) {
      throw new Error('Nu Colombia no permite dirigir abonos a compras específicas en esta versión.');
    }

    let remainingPayment = Math.max(0, +paymentAmount.toFixed(2));
    let taxesAndFeesApplied = 0;
    let handlingFeeApplied = 0;
    let lateInterestApplied = 0;
    let currentInterestApplied = 0;
    let principalApplied = 0;

    // Conceptos pendientes recibidos
    const unpaidTaxes = Math.max(0, ctx.taxesAndFees);
    const unpaidHandling = Math.max(0, ctx.handlingFee);
    const unpaidLateInterest = Math.max(0, ctx.lateInterest);
    const unpaidCurrentInterest = Math.max(0, ctx.currentInterest);

    // 1. Impuestos y Cargos
    if (remainingPayment > 0 && unpaidTaxes > 0) {
      taxesAndFeesApplied = Math.min(remainingPayment, unpaidTaxes);
      remainingPayment -= taxesAndFeesApplied;
    }

    // 2. Cuota de Manejo / Comisiones
    if (remainingPayment > 0 && unpaidHandling > 0) {
      handlingFeeApplied = Math.min(remainingPayment, unpaidHandling);
      remainingPayment -= handlingFeeApplied;
    }

    // 3. Intereses de Mora
    if (remainingPayment > 0 && unpaidLateInterest > 0) {
      lateInterestApplied = Math.min(remainingPayment, unpaidLateInterest);
      remainingPayment -= lateInterestApplied;
    }

    // 4. Intereses Corrientes
    if (remainingPayment > 0 && unpaidCurrentInterest > 0) {
      currentInterestApplied = Math.min(remainingPayment, unpaidCurrentInterest);
      remainingPayment -= currentInterestApplied;
    }

    // 5. Todo el excedente se imputa a Capital (libera cupo)
    if (remainingPayment > 0) {
      principalApplied = +remainingPayment.toFixed(2);
      remainingPayment = 0;
    }

    const statementRemaining = Math.max(0, +(ctx.totalStatementBalance - ctx.statementBalancePaid).toFixed(2));
    const statementApplied = Math.min(statementRemaining, paymentAmount);
    const unbilledApplied = Math.max(0, +(paymentAmount - statementApplied).toFixed(2));

    const minRemaining = Math.max(0, +(ctx.minimumPaymentOriginal - ctx.minimumPaymentPaid).toFixed(2));
    const minimumApplied = Math.min(minRemaining, statementApplied);

    const remainingStatementBalance = Math.max(0, +(statementRemaining - statementApplied).toFixed(2));
    const remainingMinimumPayment = Math.max(0, +(minRemaining - minimumApplied).toFixed(2));
    const resultingAvailableLimit = Math.min(ctx.creditLimit, +(ctx.availableLimit + principalApplied).toFixed(2));

    return {
      totalPayment: paymentAmount,
      taxesAndFeesApplied: +taxesAndFeesApplied.toFixed(2),
      handlingFeeApplied: +handlingFeeApplied.toFixed(2),
      collectionFeeApplied: 0,
      lateInterestApplied: +lateInterestApplied.toFixed(2),
      currentInterestApplied: +currentInterestApplied.toFixed(2),
      principalApplied: +principalApplied.toFixed(2),
      creditBalanceApplied: 0,
      statementApplied: +statementApplied.toFixed(2),
      unbilledApplied: +unbilledApplied.toFixed(2),
      minimumApplied: +minimumApplied.toFixed(2),
      remainingStatementBalance,
      remainingMinimumPayment,
      resultingAvailableLimit,
      isEstimated: false,
    };
  }
}
