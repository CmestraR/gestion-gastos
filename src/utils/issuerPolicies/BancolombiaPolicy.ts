import type {
  CreditCardIssuerPolicy,
  StatementAllocationContext,
  AllocationResult,
  AllocationConcept,
} from './types.ts';

export class BancolombiaPolicy implements CreditCardIssuerPolicy {
  readonly issuerId = 'bancolombia';
  readonly issuerName = 'Bancolombia';
  readonly supportsDirectedPayment = false;
  readonly supportsAlternativePayment = false;
  readonly supportsEarlyPayment = true;
  readonly isEstimated = true;
  readonly allocationOrder: AllocationConcept[] = [
    'late_interest',
    'handling_fee',
    'taxes_and_fees',
    'current_interest',
    'principal',
  ];

  allocatePayment(
    paymentAmount: number,
    ctx: StatementAllocationContext,
    options?: { isDirected?: boolean; targetPurchaseId?: string }
  ): AllocationResult {
    if (options?.isDirected) {
      throw new Error(
        'Bancolombia no permite dirigir abonos a compras específicas. Todo pago se aplica según la prelación del banco.'
      );
    }

    let remainingPayment = Math.max(0, +paymentAmount.toFixed(2));
    let lateInterestApplied = 0;
    let handlingFeeApplied = 0;
    let taxesAndFeesApplied = 0;
    let currentInterestApplied = 0;
    let principalApplied = 0;

    const unpaidLateInterest = Math.max(0, ctx.lateInterest);
    const unpaidHandling = Math.max(0, ctx.handlingFee);
    const unpaidTaxes = Math.max(0, ctx.taxesAndFees);
    const unpaidCurrentInterest = Math.max(0, ctx.currentInterest);

    // 1. Mora (Extracto)
    if (remainingPayment > 0 && unpaidLateInterest > 0) {
      lateInterestApplied = Math.min(remainingPayment, unpaidLateInterest);
      remainingPayment -= lateInterestApplied;
    }

    // 2. Comisiones / Cuota de manejo (Extracto)
    if (remainingPayment > 0 && unpaidHandling > 0) {
      handlingFeeApplied = Math.min(remainingPayment, unpaidHandling);
      remainingPayment -= handlingFeeApplied;
    }

    // 3. Impuestos (Extracto)
    if (remainingPayment > 0 && unpaidTaxes > 0) {
      taxesAndFeesApplied = Math.min(remainingPayment, unpaidTaxes);
      remainingPayment -= taxesAndFeesApplied;
    }

    // 4. Intereses Corrientes (Extracto)
    if (remainingPayment > 0 && unpaidCurrentInterest > 0) {
      currentInterestApplied = Math.min(remainingPayment, unpaidCurrentInterest);
      remainingPayment -= currentInterestApplied;
    }

    // 5. Conceptos No Facturados de Conciliación
    let unbilledLateInterestApplied = 0;
    let unbilledCurrentInterestApplied = 0;
    let unbilledFeesApplied = 0;
    let unbilledTaxesApplied = 0;
    let unbilledCollectionApplied = 0;

    if (remainingPayment > 0 && (ctx.unbilledCollectionPending || 0) > 0) {
      unbilledCollectionApplied = Math.min(remainingPayment, ctx.unbilledCollectionPending || 0);
      remainingPayment -= unbilledCollectionApplied;
    }
    if (remainingPayment > 0 && (ctx.unbilledLateInterestPending || 0) > 0) {
      unbilledLateInterestApplied = Math.min(remainingPayment, ctx.unbilledLateInterestPending || 0);
      remainingPayment -= unbilledLateInterestApplied;
    }
    if (remainingPayment > 0 && (ctx.unbilledFeesPending || 0) > 0) {
      unbilledFeesApplied = Math.min(remainingPayment, ctx.unbilledFeesPending || 0);
      remainingPayment -= unbilledFeesApplied;
    }
    if (remainingPayment > 0 && (ctx.unbilledTaxesPending || 0) > 0) {
      unbilledTaxesApplied = Math.min(remainingPayment, ctx.unbilledTaxesPending || 0);
      remainingPayment -= unbilledTaxesApplied;
    }
    if (remainingPayment > 0 && (ctx.unbilledCurrentInterestPending || 0) > 0) {
      unbilledCurrentInterestApplied = Math.min(remainingPayment, ctx.unbilledCurrentInterestPending || 0);
      remainingPayment -= unbilledCurrentInterestApplied;
    }

    // 6. Capital (Estricto: NUNCA puede superar principalDebt)
    const principalDebt = Math.max(0, +(ctx.creditLimit - ctx.availableLimit).toFixed(2));
    if (remainingPayment > 0 && principalDebt > 0) {
      principalApplied = Math.min(remainingPayment, principalDebt);
      remainingPayment -= principalApplied;
    }
    const creditBalanceApplied = +remainingPayment.toFixed(2);

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
      creditBalanceApplied,
      statementApplied: +statementApplied.toFixed(2),
      unbilledApplied: +unbilledApplied.toFixed(2),
      minimumApplied: +minimumApplied.toFixed(2),
      unbilledCollectionApplied: +unbilledCollectionApplied.toFixed(2),
      unbilledLateInterestApplied: +unbilledLateInterestApplied.toFixed(2),
      unbilledCurrentInterestApplied: +unbilledCurrentInterestApplied.toFixed(2),
      unbilledFeesApplied: +unbilledFeesApplied.toFixed(2),
      unbilledTaxesApplied: +unbilledTaxesApplied.toFixed(2),
      remainingStatementBalance,
      remainingMinimumPayment,
      resultingAvailableLimit,
      isEstimated: true,
      notes: 'Distribución estimada según prelación general de Bancolombia',
    };
  }
}
