import { CardInstallment, CreditCard, CardPurchase, CardStatementSummary } from '../types/finance';

/**
 * Convierte Tasa Efectiva Anual (E.A.) a Tasa Efectiva Mensual (E.M.)
 * Fórmula: EM = (1 + EA)^(1/12) - 1
 */
export function convertEAToEM(eaPercentage: number): number {
  if (eaPercentage <= 0) return 0;
  const ea = eaPercentage / 100;
  const em = Math.pow(1 + ea, 1 / 12) - 1;
  return +(em * 100).toFixed(4);
}

/**
 * Convierte Tasa Efectiva Mensual (E.M.) a Tasa Efectiva Anual (E.A.)
 * Fórmula: EA = (1 + EM)^12 - 1
 */
export function convertEMToEA(emPercentage: number): number {
  if (emPercentage <= 0) return 0;
  const em = emPercentage / 100;
  const ea = Math.pow(1 + em, 12) - 1;
  return +(ea * 100).toFixed(2);
}

/**
 * Calcula la cuota mensual fija (Sistema Francés) para un monto, tasa mensual y plazo.
 */
export function calculateMonthlyQuota(
  principal: number,
  monthlyInterestPercentage: number,
  installments: number
): number {
  if (principal <= 0 || installments <= 0) return 0;
  if (installments === 1 || monthlyInterestPercentage <= 0) {
    return +(principal / installments).toFixed(2);
  }

  const r = monthlyInterestPercentage / 100;
  const numerator = principal * (r * Math.pow(1 + r, installments));
  const denominator = Math.pow(1 + r, installments) - 1;

  const quota = numerator / denominator;
  return +quota.toFixed(2);
}

/**
 * Genera la tabla de amortización detallada para una compra a cuotas
 */
export function generateAmortizationSchedule(
  purchaseId: string,
  principal: number,
  monthlyInterestPercentage: number,
  installments: number,
  firstDueDate: Date = new Date(),
  alreadyPaidCount: number = 0
): CardInstallment[] {
  const schedule: CardInstallment[] = [];
  if (principal <= 0 || installments <= 0) return schedule;

  const monthlyQuota = calculateMonthlyQuota(principal, monthlyInterestPercentage, installments);
  const r = monthlyInterestPercentage / 100;
  let remainingPrincipal = principal;

  for (let i = 1; i <= installments; i++) {
    const dueDate = new Date(firstDueDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));

    let interestAmount = 0;
    let principalAmount = 0;

    if (installments === 1 || r <= 0) {
      principalAmount = +(principal / installments).toFixed(2);
      interestAmount = 0;
    } else {
      interestAmount = +(remainingPrincipal * r).toFixed(2);
      principalAmount = +(monthlyQuota - interestAmount).toFixed(2);

      // Ajuste para la última cuota por redondeo
      if (i === installments) {
        principalAmount = +remainingPrincipal.toFixed(2);
      }
    }

    const totalAmount = +(principalAmount + interestAmount).toFixed(2);
    remainingPrincipal = Math.max(0, remainingPrincipal - principalAmount);
    const isPaid = i <= alreadyPaidCount;

    schedule.push({
      id: `${purchaseId}-inst-${i}`,
      purchaseId,
      installmentNumber: i,
      dueDate: dueDate.toISOString().split('T')[0],
      principalAmount,
      interestAmount,
      totalAmount,
      isPaid,
      paidDate: isPaid ? dueDate.toISOString().split('T')[0] : undefined,
    });
  }

  return schedule;
}

/**
 * Calcula las próximas fechas de corte y pago para una tarjeta de crédito
 */
export function calculateCardCycleDates(
  cutOffDay: number,
  paymentDueDay: number,
  referenceDate: Date = new Date()
) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const currentDay = referenceDate.getDate();

  // Fecha de corte de este ciclo
  let cutOffDate = new Date(year, month, cutOffDay);
  if (currentDay > cutOffDay) {
    // Si ya pasó el día de corte de este mes, la próxima fecha de corte es el siguiente mes
    cutOffDate = new Date(year, month + 1, cutOffDay);
  }

  // Fecha límite de pago
  // Si el día de pago es menor que el día de corte (ej. corte 15, pago 5), el pago es el mes siguiente al corte
  let paymentDueDate: Date;
  if (paymentDueDay <= cutOffDay) {
    paymentDueDate = new Date(cutOffDate.getFullYear(), cutOffDate.getMonth() + 1, paymentDueDay);
  } else {
    paymentDueDate = new Date(cutOffDate.getFullYear(), cutOffDate.getMonth(), paymentDueDay);
  }

  // Diferencia en días
  const oneDayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  
  const daysToCutOff = Math.round((cutOffDate.getTime() - startOfToday.getTime()) / oneDayMs);
  const daysToPayment = Math.round((paymentDueDate.getTime() - startOfToday.getTime()) / oneDayMs);

  return {
    cutOffDate: cutOffDate.toISOString().split('T')[0],
    paymentDueDate: paymentDueDate.toISOString().split('T')[0],
    daysToCutOff,
    daysToPayment,
  };
}

/**
 * Simula el extracto mensual consolidado de una tarjeta de crédito
 */
export function calculateCardStatement(
  card: CreditCard,
  activePurchases: CardPurchase[],
  referenceDate: Date = new Date()
): CardStatementSummary {
  const { cutOffDate, paymentDueDate, daysToCutOff, daysToPayment } = calculateCardCycleDates(
    card.cutOffDay,
    card.paymentDueDay,
    referenceDate
  );

  let currentInstallmentsTotal = 0;
  let singleQuotaPurchasesTotal = 0;
  let estimatedInterestTotal = 0;
  let totalOutstandingDebt = 0;

  for (const purchase of activePurchases) {
    if (purchase.status !== 'active') continue;

    const remainingQuotaCount = purchase.installmentsTotal - purchase.installmentsPaid;
    if (remainingQuotaCount <= 0) continue;

    if (purchase.installmentsTotal === 1) {
      singleQuotaPurchasesTotal += purchase.amount;
      totalOutstandingDebt += purchase.amount;
    } else {
      // Compra a múltiples cuotas
      const monthlyAmount = purchase.monthlyInstallmentAmount > 0 
        ? purchase.monthlyInstallmentAmount 
        : calculateMonthlyQuota(purchase.amount, purchase.interestRateMonthly, purchase.installmentsTotal);
      
      currentInstallmentsTotal += monthlyAmount;
      totalOutstandingDebt += (monthlyAmount * remainingQuotaCount);

      // Interés estimado en la cuota actual
      const currentBalance = (purchase.amount / purchase.installmentsTotal) * remainingQuotaCount;
      const interestPortion = +(currentBalance * (purchase.interestRateMonthly / 100)).toFixed(2);
      estimatedInterestTotal += interestPortion;
    }
  }

  const handlingFee = card.handlingFee || 0;
  const totalToPayThisMonth = +(currentInstallmentsTotal + singleQuotaPurchasesTotal + handlingFee).toFixed(2);
  
  // Pago mínimo aproximado (10% de compras a 1 cuota + cuotas activas + cuota de manejo)
  const minimumPayment = +(
    (singleQuotaPurchasesTotal * 0.1) +
    currentInstallmentsTotal +
    handlingFee
  ).toFixed(2);

  const usedCredit = +totalOutstandingDebt.toFixed(2);
  const availableCredit = Math.max(0, +(card.creditLimit - usedCredit).toFixed(2));

  const cycleMonth = cutOffDate.substring(0, 7);

  return {
    cardId: card.id,
    cycleMonth,
    cutOffDate,
    paymentDueDate,
    daysToCutOff,
    daysToPayment,
    currentInstallmentsTotal: +currentInstallmentsTotal.toFixed(2),
    singleQuotaPurchasesTotal: +singleQuotaPurchasesTotal.toFixed(2),
    handlingFee,
    estimatedInterestTotal: +estimatedInterestTotal.toFixed(2),
    totalToPayThisMonth,
    minimumPayment,
    usedCredit,
    availableCredit,
    creditLimit: card.creditLimit,
  };
}
