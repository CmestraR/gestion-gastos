import type { Transaction, Account, CreditCard, TransactionType } from '../types/finance';

/**
 * Matriz Conceptual de Efectos Financieros Consolidados
 * Define formalmente cómo cada tipo de transacción afecta al patrimonio global:
 * - consumption: Gasto devengado / Consumo de bienes o servicios
 * - cashInflow: Entrada real de efectivo externo al ecosistema
 * - cashOutflow: Salida real de efectivo hacia terceros
 * - assetDelta: Cambio algebraico en activos totales (+ o -)
 * - liabilityDelta: Cambio algebraico en pasivos totales (+ o -)
 * - netWorthDelta: Cambio en el Patrimonio Neto (Activos - Pasivos)
 */
export interface FinancialEffectMatrix {
  consumption: number;
  cashInflow: number;
  cashOutflow: number;
  assetDelta: number;
  liabilityDelta: number;
  netWorthDelta: number;
}

/**
 * Movimiento Físico de Efectivo por Cuenta Individual (Account Cash Movement)
 * Refleja el débito o crédito exacto que sufre una cuenta específica en su libro mayor.
 */
export interface AccountCashMovement {
  accountId: string;
  amountDelta: number; // Negativo para egresos, positivo para ingresos
  gmfDelta: number;    // Impuesto deducido
  totalDelta: number;  // amountDelta - gmfDelta
}

/**
 * Calcula el movimiento físico de una cuenta bancaria específica ante una transacción
 */
export function calculateAccountCashMovement(tx: Transaction, targetAccountId: string): AccountCashMovement | null {
  const amount = Number(tx.amount) || 0;
  const gmf = Number(tx.gmfAmount) || 0;

  if (tx.accountId === targetAccountId) {
    // Cuenta de origen
    if (tx.type === 'income') {
      return { accountId: targetAccountId, amountDelta: amount, gmfDelta: 0, totalDelta: amount };
    }
    if (tx.type === 'expense' || tx.type === 'transfer') {
      return { accountId: targetAccountId, amountDelta: -amount, gmfDelta: gmf, totalDelta: -(amount + gmf) };
    }
    if (tx.type === 'card_payment') {
      return { accountId: targetAccountId, amountDelta: -amount, gmfDelta: 0, totalDelta: -amount };
    }
  }

  if (tx.toAccountId === targetAccountId && tx.type === 'transfer') {
    // Cuenta de destino en transferencia
    return { accountId: targetAccountId, amountDelta: amount, gmfDelta: 0, totalDelta: amount };
  }

  return null;
}

/**
 * Calcula los efectos contables y financieros exactos de una transacción individual
 */
export function evaluateTransactionEffects(tx: Transaction): FinancialEffectMatrix {
  const amount = Number(tx.amount) || 0;
  const gmf = Number(tx.gmfAmount) || 0;
  const totalDeduction = amount + gmf;

  switch (tx.type) {
    case 'income':
      // Ingreso ordinario: Aumenta activos líquidos, caja positiva, incrementa patrimonio
      return {
        consumption: 0,
        cashInflow: amount,
        cashOutflow: 0,
        assetDelta: amount,
        liabilityDelta: 0,
        netWorthDelta: amount,
      };

    case 'expense':
      // Gasto corriente: Consumo total (monto + 4x1000), salida de caja, reduce activos y patrimonio
      return {
        consumption: totalDeduction,
        cashInflow: 0,
        cashOutflow: totalDeduction,
        assetDelta: -totalDeduction,
        liabilityDelta: 0,
        netWorthDelta: -totalDeduction,
      };

    case 'card_purchase':
      // Compra con tarjeta de crédito:
      // - Consumo: 100% del valor de la compra en la fecha en que se realiza
      // - Flujo de caja inmediato: $0 (el dinero no sale de cuentas bancarias aún)
      // - Pasivo: Se incrementa la deuda con la entidad emisora
      // - Patrimonio: Disminuye por el nuevo pasivo contraído
      return {
        consumption: amount,
        cashInflow: 0,
        cashOutflow: 0,
        assetDelta: 0,
        liabilityDelta: amount,
        netWorthDelta: -amount,
      };

    case 'card_payment':
      // Abono o pago a tarjeta de crédito:
      // - Consumo: $0 (el gasto ya fue causado cuando se hizo la compra)
      // - Flujo de caja: Salida real de dinero bancario
      // - Activos: Disminuyen por el dinero pagado
      // - Pasivos: Disminuyen por la amortización de la deuda
      // - Patrimonio: Neutral ($0 de cambio, permuta de activo por pasivo)
      return {
        consumption: 0,
        cashInflow: 0,
        cashOutflow: amount,
        assetDelta: -amount,
        liabilityDelta: -amount,
        netWorthDelta: 0,
      };

    case 'transfer':
      // Transferencia entre cuentas propias:
      // - Monto transferido: Movimiento interno neutral entre activos
      // - 4x1000 (GMF si aplica): Costo financiero / Pérdida patrimonial real
      return {
        consumption: gmf,
        cashInflow: 0,
        cashOutflow: gmf,
        assetDelta: gmf ? -gmf : 0,
        liabilityDelta: 0,
        netWorthDelta: gmf ? -gmf : 0,
      };

    case 'card_opening_balance':
      // Saldo de apertura inicial de tarjeta:
      // - Consumo: $0 (corresponde a movimientos previos a la app)
      // - Flujo de caja: $0 (no es movimiento de cuenta bancaria)
      // - Pasivo: Incrementa el pasivo inicial de la tarjeta
      // - Patrimonio: Reduce el patrimonio neto por el pasivo inicial
      return {
        consumption: 0,
        cashInflow: 0,
        cashOutflow: 0,
        assetDelta: 0,
        liabilityDelta: amount,
        netWorthDelta: -amount,
      };

    case 'balance_adjustment':
      // Ajuste de balance / conciliación
      return {
        consumption: 0,
        cashInflow: 0,
        cashOutflow: 0,
        assetDelta: 0,
        liabilityDelta: amount,
        netWorthDelta: -amount,
      };

    default:
      return {
        consumption: 0,
        cashInflow: 0,
        cashOutflow: 0,
        assetDelta: 0,
        liabilityDelta: 0,
        netWorthDelta: 0,
      };
  }
}

/**
 * Calcula el Consumo Total (Devengado / Causación) para un periodo mensual (YYYY-MM)
 */
export function calculateMonthlyConsumption(transactions: Transaction[], monthYear: string): number {
  return transactions
    .filter((tx) => tx.date.startsWith(monthYear))
    .reduce((sum, tx) => sum + evaluateTransactionEffects(tx).consumption, 0);
}

/**
 * Calcula el Flujo de Caja Real (Entradas, Salidas y Flujo Neto de Efectivo) para un mes (YYYY-MM)
 */
export function calculateMonthlyCashFlow(transactions: Transaction[], monthYear: string) {
  let cashInflow = 0;
  let cashOutflow = 0;

  for (const tx of transactions) {
    if (!tx.date.startsWith(monthYear)) continue;
    const effects = evaluateTransactionEffects(tx);
    cashInflow += effects.cashInflow;
    cashOutflow += effects.cashOutflow;
  }

  return {
    cashInflow: +cashInflow.toFixed(2),
    cashOutflow: +cashOutflow.toFixed(2),
    netCashFlow: +(cashInflow - cashOutflow).toFixed(2),
  };
}

/**
 * Calcula el Patrimonio Neto Consolidado (Activos Líquidos - Pasivos en Tarjetas - Deudas Personales)
 */
export function calculateConsolidatedNetWorth(
  accounts: Account[],
  creditCards: CreditCard[]
) {
  // Activos líquidos (cuentas bancarias, billeteras, efectivo)
  const totalAssets = accounts
    .filter((acc) => acc.type !== 'debt' && acc.includeInTotal !== false && !acc.isArchived)
    .reduce((sum, acc) => sum + acc.balance, 0);

  // Deuda en tarjetas de crédito (cupo utilizado = cupo total - cupo disponible)
  const totalCreditCardDebt = creditCards
    .filter((card) => !card.isArchived)
    .reduce((sum, card) => sum + Math.max(0, card.creditLimit - card.availableLimit), 0);

  // Deudas personales (cuentas de tipo 'debt' con saldo negativo)
  const totalPersonalDebts = accounts
    .filter((acc) => acc.type === 'debt' && !acc.isArchived)
    .reduce((sum, acc) => sum + Math.abs(Math.min(0, acc.balance)), 0);

  const totalLiabilities = +(totalCreditCardDebt + totalPersonalDebts).toFixed(2);
  const netWorth = +(totalAssets - totalLiabilities).toFixed(2);

  return {
    totalAssets: +totalAssets.toFixed(2),
    totalCreditCardDebt: +totalCreditCardDebt.toFixed(2),
    totalPersonalDebts: +totalPersonalDebts.toFixed(2),
    totalLiabilities,
    netWorth,
  };
}
