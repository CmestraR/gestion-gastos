import type {
  CreditCardIssuerPolicy,
  StatementAllocationContext,
  AllocationResult,
  AllocationConcept,
} from './types.ts';

export class RappiCardPolicy implements CreditCardIssuerPolicy {
  readonly issuerId = 'rappicard';
  readonly issuerName = 'RappiCard';
  readonly supportsDirectedPayment = false;
  readonly supportsAlternativePayment = true;
  readonly supportsEarlyPayment = true;
  readonly isEstimated = false;
  readonly allocationOrder: AllocationConcept[] = [
    'collection_fee',
    'late_interest',
    'current_interest',
    'taxes_and_fees',
    'handling_fee',
    'principal',
  ];

  allocatePayment(
    paymentAmount: number,
    ctx: StatementAllocationContext,
    _options?: { isDirected?: boolean; targetPurchaseId?: string }
  ): AllocationResult {
    let remainingPayment = Math.max(0, +paymentAmount.toFixed(2));
    let collectionFeeApplied = 0;
    let lateInterestApplied = 0;
    let currentInterestApplied = 0;
    let taxesAndFeesApplied = 0;
    let handlingFeeApplied = 0;
    let principalApplied = 0;

    // Prelación oficial RappiCard:
    // 1. Gastos de cobranza
    // 2. Intereses de mora
    // 3. Intereses remuneratorios
    // 4. Impuestos
    // 5. Comisiones / Cuota de manejo
    // 6. Capital (todo el excedente se imputa directamente a capital)
    const unpaidCollection = Math.max(0, ctx.collectionFee || 0);
    const unpaidLateInterest = Math.max(0, ctx.lateInterest);
    const unpaidCurrentInterest = Math.max(0, ctx.currentInterest);
    const unpaidTaxes = Math.max(0, ctx.taxesAndFees);
    const unpaidHandling = Math.max(0, ctx.handlingFee);

    // 1. Gastos de cobranza (Extracto)
    if (remainingPayment > 0 && unpaidCollection > 0) {
      collectionFeeApplied = Math.min(remainingPayment, unpaidCollection);
      remainingPayment -= collectionFeeApplied;
    }

    // 2. Intereses de mora (Extracto)
    if (remainingPayment > 0 && unpaidLateInterest > 0) {
      lateInterestApplied = Math.min(remainingPayment, unpaidLateInterest);
      remainingPayment -= lateInterestApplied;
    }

    // 3. Intereses remuneratorios / corrientes (Extracto)
    if (remainingPayment > 0 && unpaidCurrentInterest > 0) {
      currentInterestApplied = Math.min(remainingPayment, unpaidCurrentInterest);
      remainingPayment -= currentInterestApplied;
    }

    // 4. Impuestos (Extracto)
    if (remainingPayment > 0 && unpaidTaxes > 0) {
      taxesAndFeesApplied = Math.min(remainingPayment, unpaidTaxes);
      remainingPayment -= taxesAndFeesApplied;
    }

    // 5. Comisiones / Cuota de manejo (Extracto)
    if (remainingPayment > 0 && unpaidHandling > 0) {
      handlingFeeApplied = Math.min(remainingPayment, unpaidHandling);
      remainingPayment -= handlingFeeApplied;
    }

    // 6. Conceptos No Facturados de Conciliación (Unbilled Non-Principal)
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
    if (remainingPayment > 0 && (ctx.unbilledCurrentInterestPending || 0) > 0) {
      unbilledCurrentInterestApplied = Math.min(remainingPayment, ctx.unbilledCurrentInterestPending || 0);
      remainingPayment -= unbilledCurrentInterestApplied;
    }
    if (remainingPayment > 0 && (ctx.unbilledTaxesPending || 0) > 0) {
      unbilledTaxesApplied = Math.min(remainingPayment, ctx.unbilledTaxesPending || 0);
      remainingPayment -= unbilledTaxesApplied;
    }
    if (remainingPayment > 0 && (ctx.unbilledFeesPending || 0) > 0) {
      unbilledFeesApplied = Math.min(remainingPayment, ctx.unbilledFeesPending || 0);
      remainingPayment -= unbilledFeesApplied;
    }

    // 7. Capital (Estricto: NUNCA puede superar principalDebt)
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
      collectionFeeApplied: +collectionFeeApplied.toFixed(2),
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
      isEstimated: false,
    };
  }
}
