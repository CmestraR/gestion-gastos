import { getDatabase } from '../database.ts';
import type {
  CreditCard,
  CardPurchase,
  CardInstallment,
  CardStatementSummary,
  PaymentAllocation,
} from '../../types/finance.ts';
import { AccountRepository } from './accountRepository.ts';
import { StatementRepository } from './statementRepository.ts';
import { CycleRepository } from './cycleRepository.ts';
import { ReconciliationRepository } from './reconciliationRepository.ts';
import { getIssuerPolicy } from '../../utils/issuerPolicies/index.ts';
import { calculateCardCycleDates } from '../../utils/financialMath.ts';

export const CardRepository = {
  async getAll(): Promise<CreditCard[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      bank_name: string;
      card_brand: string;
      issuer_id: string;
      last_four_digits: string | null;
      credit_limit: number;
      available_limit: number;
      cut_off_day: number;
      payment_due_day: number;
      interest_rate_monthly: number;
      late_interest_rate_monthly: number;
      handling_fee: number;
      positive_balance: number;
      color_gradient_start: string;
      color_gradient_end: string;
      currency: string;
      is_archived: number;
      created_at: string;
    }>('SELECT * FROM credit_cards WHERE is_archived = 0 ORDER BY created_at ASC');

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      bankName: r.bank_name,
      cardBrand: r.card_brand as CreditCard['cardBrand'],
      issuerId: (r.issuer_id || 'generic') as CreditCard['issuerId'],
      lastFourDigits: r.last_four_digits || undefined,
      creditLimit: r.credit_limit,
      availableLimit: r.available_limit,
      cutOffDay: r.cut_off_day,
      paymentDueDay: r.payment_due_day,
      interestRateMonthly: r.interest_rate_monthly,
      lateInterestRateMonthly: r.late_interest_rate_monthly || 0,
      handlingFee: r.handling_fee,
      positiveBalance: r.positive_balance || 0,
      colorGradient: [r.color_gradient_start, r.color_gradient_end] as [string, string],
      currency: r.currency,
      isArchived: r.is_archived === 1,
      createdAt: r.created_at,
    }));
  },

  async getById(id: string): Promise<CreditCard | null> {
    const db = await getDatabase();
    const r = await db.getFirstAsync<{
      id: string;
      name: string;
      bank_name: string;
      card_brand: string;
      issuer_id: string;
      last_four_digits: string | null;
      credit_limit: number;
      available_limit: number;
      cut_off_day: number;
      payment_due_day: number;
      interest_rate_monthly: number;
      late_interest_rate_monthly: number;
      handling_fee: number;
      positive_balance: number;
      color_gradient_start: string;
      color_gradient_end: string;
      currency: string;
      is_archived: number;
      created_at: string;
    }>('SELECT * FROM credit_cards WHERE id = ?', [id]);

    if (!r) return null;

    return {
      id: r.id,
      name: r.name,
      bankName: r.bank_name,
      cardBrand: r.card_brand as CreditCard['cardBrand'],
      issuerId: (r.issuer_id || 'generic') as CreditCard['issuerId'],
      lastFourDigits: r.last_four_digits || undefined,
      creditLimit: r.credit_limit,
      availableLimit: r.available_limit,
      cutOffDay: r.cut_off_day,
      paymentDueDay: r.payment_due_day,
      interestRateMonthly: r.interest_rate_monthly,
      lateInterestRateMonthly: r.late_interest_rate_monthly || 0,
      handlingFee: r.handling_fee,
      positiveBalance: r.positive_balance || 0,
      colorGradient: [r.color_gradient_start, r.color_gradient_end] as [string, string],
      currency: r.currency,
      isArchived: r.is_archived === 1,
      createdAt: r.created_at,
    };
  },

  async create(card: CreditCard): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO credit_cards (
        id, name, bank_name, card_brand, issuer_id, last_four_digits, credit_limit, available_limit,
        cut_off_day, payment_due_day, interest_rate_monthly, late_interest_rate_monthly, handling_fee, positive_balance,
        color_gradient_start, color_gradient_end, currency, is_archived, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        card.id,
        card.name,
        card.bankName,
        card.cardBrand,
        card.issuerId || 'generic',
        card.lastFourDigits || null,
        card.creditLimit,
        card.availableLimit,
        card.cutOffDay,
        card.paymentDueDay,
        card.interestRateMonthly,
        card.lateInterestRateMonthly || 0,
        card.handlingFee,
        card.positiveBalance || 0,
        card.colorGradient[0],
        card.colorGradient[1],
        card.currency,
        card.isArchived ? 1 : 0,
        card.createdAt,
      ]
    );
  },

  async update(card: CreditCard): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE credit_cards SET
        name = ?, bank_name = ?, card_brand = ?, issuer_id = ?, last_four_digits = ?,
        credit_limit = ?, available_limit = ?, cut_off_day = ?, payment_due_day = ?,
        interest_rate_monthly = ?, late_interest_rate_monthly = ?, handling_fee = ?, positive_balance = ?,
        color_gradient_start = ?, color_gradient_end = ?, currency = ?
       WHERE id = ?`,
      [
        card.name,
        card.bankName,
        card.cardBrand,
        card.issuerId || 'generic',
        card.lastFourDigits || null,
        card.creditLimit,
        card.availableLimit,
        card.cutOffDay,
        card.paymentDueDay,
        card.interestRateMonthly,
        card.lateInterestRateMonthly || 0,
        card.handlingFee,
        card.positiveBalance || 0,
        card.colorGradient[0],
        card.colorGradient[1],
        card.currency,
        card.id,
      ]
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      // 1. Contar compras vinculadas
      const purchasesCount = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM card_purchases WHERE card_id = ?',
        [id]
      );

      // 2. Contar transacciones vinculadas
      const txCount = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM transactions WHERE card_id = ?',
        [id]
      );

      const totalHistory = (purchasesCount?.count || 0) + (txCount?.count || 0);

      if (totalHistory > 0) {
        // POLÍTICA DE ARCHIVADO: Si tiene historial, NO destruir; marcar como archivada
        await db.runAsync('UPDATE credit_cards SET is_archived = 1 WHERE id = ?', [id]);
      } else {
        // Si no tiene ningún movimiento ni compra, eliminación física limpia
        await db.runAsync('DELETE FROM credit_cards WHERE id = ?', [id]);
      }
    });
  },

  async getPurchasesForCard(cardId: string): Promise<CardPurchase[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      card_id: string;
      description: string;
      category_id: string;
      amount: number;
      installments_total: number;
      installments_paid: number;
      monthly_installment_amount: number;
      interest_rate_monthly: number;
      first_installment_date: string;
      status: string;
      created_at: string;
    }>("SELECT * FROM card_purchases WHERE card_id = ? AND status = 'active' ORDER BY created_at DESC", [cardId]);

    return rows.map((r) => ({
      id: r.id,
      cardId: r.card_id,
      description: r.description,
      categoryId: r.category_id,
      amount: r.amount,
      installmentsTotal: r.installments_total,
      installmentsPaid: r.installments_paid,
      monthlyInstallmentAmount: r.monthly_installment_amount,
      interestRateMonthly: r.interest_rate_monthly,
      firstInstallmentDate: r.first_installment_date,
      status: r.status as CardPurchase['status'],
      createdAt: r.created_at,
    }));
  },

  async getAllActivePurchases(): Promise<CardPurchase[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      card_id: string;
      description: string;
      category_id: string;
      amount: number;
      installments_total: number;
      installments_paid: number;
      monthly_installment_amount: number;
      interest_rate_monthly: number;
      first_installment_date: string;
      status: string;
      created_at: string;
    }>("SELECT * FROM card_purchases WHERE status = 'active' ORDER BY created_at DESC");

    return rows.map((r) => ({
      id: r.id,
      cardId: r.card_id,
      description: r.description,
      categoryId: r.category_id,
      amount: r.amount,
      installmentsTotal: r.installments_total,
      installmentsPaid: r.installments_paid,
      monthlyInstallmentAmount: r.monthly_installment_amount,
      interestRateMonthly: r.interest_rate_monthly,
      firstInstallmentDate: r.first_installment_date,
      status: r.status as CardPurchase['status'],
      createdAt: r.created_at,
    }));
  },

  /**
   * Creación 100% atómica de una compra con tarjeta de crédito:
   * Inserta compra, todas las cuotas, descuenta cupo e inserta transacción de consumo.
   */
  async createPurchaseAtomic(purchase: CardPurchase, installments: CardInstallment[]): Promise<void> {
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      // 1. Validar que la tarjeta existe y está activa
      const card = await db.getFirstAsync<{ id: string; is_archived: number; available_limit: number }>(
        'SELECT id, is_archived, available_limit FROM credit_cards WHERE id = ?',
        [purchase.cardId]
      );

      if (!card || card.is_archived === 1) {
        throw new Error('La tarjeta de crédito no existe o está archivada.');
      }

      // 2. Insertar compra principal
      await db.runAsync(
        `INSERT INTO card_purchases (
          id, card_id, description, category_id, amount, installments_total,
          installments_paid, monthly_installment_amount, interest_rate_monthly,
          first_installment_date, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          purchase.id,
          purchase.cardId,
          purchase.description,
          purchase.categoryId,
          purchase.amount,
          purchase.installmentsTotal,
          purchase.installmentsPaid,
          purchase.monthlyInstallmentAmount,
          purchase.interestRateMonthly,
          purchase.firstInstallmentDate,
          purchase.status,
          purchase.createdAt,
        ]
      );

      // 3. Insertar todas las cuotas generadas
      for (const inst of installments) {
        await db.runAsync(
          `INSERT INTO card_installments (
            id, purchase_id, installment_number, due_date, principal_amount,
            interest_amount, total_amount, is_paid, paid_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            inst.id,
            inst.purchaseId,
            inst.installmentNumber,
            inst.dueDate,
            inst.principalAmount,
            inst.interestAmount,
            inst.totalAmount,
            inst.isPaid ? 1 : 0,
            inst.paidDate || null,
          ]
        );
      }

      // 4. Reducir el cupo disponible de la tarjeta considerando solo las cuotas pendientes
      const unpaidInstallments = installments.filter((i) => !i.isPaid);
      const unpaidPrincipal = unpaidInstallments.reduce((sum, i) => sum + i.principalAmount, 0);

      await db.runAsync(
        `UPDATE credit_cards SET available_limit = MAX(0, available_limit - ?) WHERE id = ?`,
        [unpaidPrincipal, purchase.cardId]
      );

      // 5. Insertar transacción histórica de consumo (card_purchase)
      await db.runAsync(
        `INSERT INTO transactions (
          id, account_id, card_id, type, amount, category_id, description, notes, date,
          to_account_id, card_purchase_id, card_installment_id, principal_amount, interest_amount, gmf_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `tx-purch-${purchase.id}`,
          null,
          purchase.cardId,
          'card_purchase',
          purchase.amount,
          purchase.categoryId,
          purchase.description,
          `${purchase.installmentsTotal} cuotas (${purchase.interestRateMonthly}% E.M.)`,
          purchase.firstInstallmentDate,
          null,
          purchase.id,
          null,
          purchase.amount,
          0,
          0,
          purchase.createdAt,
        ]
      );
    });
  },

  async createPurchase(purchase: CardPurchase, installments: CardInstallment[]): Promise<void> {
    return this.createPurchaseAtomic(purchase, installments);
  },

  async getInstallmentsForPurchase(purchaseId: string): Promise<CardInstallment[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      purchase_id: string;
      installment_number: number;
      due_date: string;
      principal_amount: number;
      interest_amount: number;
      total_amount: number;
      is_paid: number;
      paid_date: string | null;
    }>('SELECT * FROM card_installments WHERE purchase_id = ? ORDER BY installment_number ASC', [purchaseId]);

    return rows.map((r) => ({
      id: r.id,
      purchaseId: r.purchase_id,
      installmentNumber: r.installment_number,
      dueDate: r.due_date,
      principalAmount: r.principal_amount,
      interestAmount: r.interest_amount,
      totalAmount: r.total_amount,
      isPaid: r.is_paid === 1,
      paidDate: r.paid_date || undefined,
    }));
  },

  async deletePurchase(purchaseId: string): Promise<void> {
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      const purchase = await db.getFirstAsync<{
        id: string;
        card_id: string;
        amount: number;
        installments_paid: number;
      }>('SELECT id, card_id, amount, installments_paid FROM card_purchases WHERE id = ?', [purchaseId]);

      if (!purchase) return;

      // REGLA DE INTEGRIDAD: Si tiene cuotas pagadas o dependencias, BLOQUEAR
      if (purchase.installments_paid > 0) {
        throw new Error('Esta compra tiene cuotas pagadas y movimientos relacionados. No puede eliminarse directamente.');
      }

      // Si no tiene cuotas pagadas, se puede eliminar de forma segura
      await db.runAsync('DELETE FROM card_installments WHERE purchase_id = ?', [purchaseId]);
      await db.runAsync('DELETE FROM card_purchases WHERE id = ?', [purchaseId]);
      await db.runAsync('DELETE FROM transactions WHERE card_purchase_id = ?', [purchaseId]);

      // Restaurar el cupo consumido
      await db.runAsync(
        'UPDATE credit_cards SET available_limit = MIN(credit_limit, available_limit + ?) WHERE id = ?',
        [purchase.amount, purchase.card_id]
      );
    });
  },

  /**
   * Ejecución 100% atómica del pago de cuota (SQLITE ES LA FUENTE DE VERDAD):
   * Consulta la cuota en SQLite, valida que esté pendiente (evita doble pago),
   * libera cupo por el capital exacto (1 sola vez), debita cuenta bancaria (1 sola vez)
   * e inserta transacción en historial con desglose completo.
   */
  async payInstallmentAtomic(
    installmentId: string,
    accountId?: string
  ): Promise<void> {
    const db = await getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      // 1. Consultar cuota directamente en SQLite (Fuente Única de Verdad)
      const inst = await db.getFirstAsync<{
        id: string;
        purchase_id: string;
        installment_number: number;
        due_date: string;
        principal_amount: number;
        interest_amount: number;
        total_amount: number;
        is_paid: number;
      }>('SELECT id, purchase_id, installment_number, due_date, principal_amount, interest_amount, total_amount, is_paid FROM card_installments WHERE id = ?', [installmentId]);

      if (!inst) {
        throw new Error('La cuota especificada no existe.');
      }

      // PROTECCIÓN CONTRA DOBLE PAGO
      if (inst.is_paid === 1) {
        throw new Error('Esta cuota ya fue pagada.');
      }

      // 2. Consultar compra asociada
      const purchase = await db.getFirstAsync<{
        id: string;
        card_id: string;
        description: string;
        installments_total: number;
        installments_paid: number;
      }>('SELECT id, card_id, description, installments_total, installments_paid FROM card_purchases WHERE id = ?', [inst.purchase_id]);

      if (!purchase) {
        throw new Error('La compra vinculada a la cuota no existe.');
      }

      // 3. Consultar y validar tarjeta de crédito
      const card = await db.getFirstAsync<{
        id: string;
        credit_limit: number;
        available_limit: number;
        is_archived: number;
      }>('SELECT id, credit_limit, available_limit, is_archived FROM credit_cards WHERE id = ?', [purchase.card_id]);

      if (!card || card.is_archived === 1) {
        throw new Error('La tarjeta de crédito no existe o está archivada.');
      }

      // 4. Marcar cuota como pagada con validación de filas afectadas
      const instRes = await db.runAsync(
        `UPDATE card_installments SET is_paid = 1, paid_date = ? WHERE id = ? AND is_paid = 0`,
        [today, installmentId]
      );
      if (instRes.changes === 0) {
        throw new Error('Esta cuota ya fue pagada.');
      }

      // 5. Incrementar número de cuotas pagadas en la compra
      const purchRes = await db.runAsync(
        `UPDATE card_purchases 
         SET installments_paid = installments_paid + 1,
             status = CASE WHEN installments_paid + 1 >= installments_total THEN 'completed' ELSE 'active' END
         WHERE id = ?`,
        [purchase.id]
      );
      if (purchRes.changes === 0) {
        throw new Error('No se pudo actualizar el estado de la compra diferida.');
      }

      // 6. Liberar cupo en la tarjeta correspondiente ÚNICAMENTE al capital pagado (ÚNICA FUENTE DE VERDAD)
      const cardRes = await db.runAsync(
        `UPDATE credit_cards 
         SET available_limit = MIN(credit_limit, available_limit + ?) 
         WHERE id = ?`,
        [inst.principal_amount, purchase.card_id]
      );
      if (cardRes.changes === 0) {
        throw new Error('No se pudo actualizar el cupo de la tarjeta de crédito.');
      }

      // 7. Si se especificó cuenta bancaria de origen, debitar saldo total e insertar movimiento con desglose
      if (accountId) {
        const acc = await db.getFirstAsync<{ id: string; is_archived: number; balance: number }>(
          'SELECT id, is_archived, balance FROM accounts WHERE id = ?',
          [accountId]
        );
        if (!acc || acc.is_archived === 1) {
          throw new Error('La cuenta bancaria seleccionada no existe o está archivada.');
        }

        await AccountRepository.updateBalance(accountId, -inst.total_amount);

        await db.runAsync(
          `INSERT INTO transactions (
            id, account_id, card_id, type, amount, category_id, description, notes, date,
            to_account_id, card_purchase_id, card_installment_id, principal_amount, interest_amount, gmf_amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `tx-pay-inst-${installmentId}`,
            accountId,
            purchase.card_id,
            'card_payment',
            inst.total_amount,
            'cat-financial',
            'Pago Cuota Tarjeta',
            `Pago cuota #${inst.installment_number} de compra '${purchase.description}' (Capital: $${inst.principal_amount}, Interés: $${inst.interest_amount})`,
            today,
            null,
            purchase.id,
            installmentId,
            inst.principal_amount,
            inst.interest_amount,
            0,
            now,
          ]
        );
      }
    });
  },

  /**
   * PAGO COMPLETO / ABONO CON IMPUTACIÓN CONTABLE (PAYMENT ALLOCATION)
   * Aplica la política bancaria del emisor (Nu, Bancolombia, RappiCard, Genérico),
   * libera cupo disponible ÚNICAMENTE por el capital aplicado,
   * debita la cuenta de origen e inserta la asignación auditada.
   */
  async payCreditCardAtomic(
    cardId: string,
    accountId: string,
    amount: number,
    statementId?: string,
    options?: { isDirected?: boolean; targetPurchaseId?: string }
  ): Promise<PaymentAllocation> {
    if (amount <= 0) {
      throw new Error('El monto del abono debe ser mayor a cero.');
    }

    const db = await getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();
    const txId = `tx-card-pay-${cardId}-${Date.now()}`;
    const allocationId = `alloc-${txId}`;

    return await db.withTransactionAsync(async () => {
      // 1. Consultar y validar tarjeta
      const card = await this.getById(cardId);

      if (!card || card.isArchived) {
        throw new Error('La tarjeta de crédito no existe o está archivada.');
      }

      const currentDebt = Math.max(0, +(card.creditLimit - card.availableLimit).toFixed(2));
      // 1. Obtener resumen de deuda consolidado (capital + no capital)
      const summary = await this.getCardStatementSummary(card);

      if (amount > summary.totalCurrentDebt) {
        throw new Error(
          `El monto del abono ($${amount}) no puede ser superior a la deuda actual de la tarjeta ($${summary.totalCurrentDebt}).`
        );
      }

      // 2. Consultar y validar cuenta bancaria
      const acc = await db.getFirstAsync<{ id: string; is_archived: number; balance: number }>(
        'SELECT id, is_archived, balance FROM accounts WHERE id = ?',
        [accountId]
      );
      if (!acc || acc.is_archived === 1) {
        throw new Error('La cuenta bancaria seleccionada no existe o está archivada.');
      }
      if (acc.balance < amount) {
        throw new Error(`La cuenta seleccionada no tiene saldo suficiente ($${acc.balance}) para realizar este pago ($${amount}).`);
      }

      // 3. Consultar extracto objetivo si se especificó, o el más reciente
      let stmt = statementId
        ? await StatementRepository.getStatementById(statementId)
        : await StatementRepository.getLatestStatement(cardId);

      // 4. Obtener conceptos realmente pendientes del extracto y de conciliaciones no facturadas
      const pending = stmt
        ? await StatementRepository.getPendingConcepts(stmt.id)
        : null;

      const nonPrincipalReconciliations = await ReconciliationRepository.getPendingNonPrincipalSummary(card.id);

      // 5. Obtener política del emisor
      const policy = getIssuerPolicy(card.issuerId);

      // 6. Construir contexto de imputación con conceptos pendientes reales
      const allocationContext = {
        creditLimit: card.creditLimit,
        availableLimit: card.availableLimit,
        totalStatementBalance: pending ? pending.remainingStatementBalance : 0,
        statementBalancePaid: stmt ? stmt.statementBalancePaid : 0,
        minimumPaymentOriginal: stmt ? stmt.minimumPaymentOriginal : 0,
        minimumPaymentPaid: stmt ? stmt.minimumPaymentPaid : 0,
        taxesAndFees: pending ? pending.remainingTaxesAndFees : 0,
        handlingFee: pending ? pending.remainingHandlingFee : 0,
        collectionFee: pending ? pending.remainingCollectionFee : 0,
        lateInterest: pending ? pending.remainingLateInterest : 0,
        currentInterest: pending ? pending.remainingCurrentInterest : 0,
        principalTotal: summary.principalDebt,
        unbilledDebt: summary.unbilledDebt,
        billedPrincipalRemaining: summary.billedPrincipalRemaining,
        unbilledPrincipalRemaining: summary.unbilledPrincipalRemaining,
        unbilledCollectionPending: nonPrincipalReconciliations.collectionPending,
        unbilledLateInterestPending: 0,
        unbilledCurrentInterestPending: nonPrincipalReconciliations.interestPending,
        unbilledFeesPending: nonPrincipalReconciliations.feesPending,
        unbilledTaxesPending: nonPrincipalReconciliations.taxesPending,
      };

      // 7. Ejecutar asignación de pago según la política
      const allocResult = policy.allocatePayment(amount, allocationContext, options);

      // Cap estricto de dominio: principalApplied no puede superar principalDebt
      allocResult.principalApplied = Math.min(allocResult.principalApplied, summary.principalDebt);

      // 8. Debitar cuenta bancaria
      await AccountRepository.updateBalance(accountId, -amount);

      // 9. Liberar cupo disponible ÚNICAMENTE por el capital aplicado
      const cardRes = await db.runAsync(
        'UPDATE credit_cards SET available_limit = MIN(credit_limit, available_limit + ?) WHERE id = ?',
        [allocResult.principalApplied, cardId]
      );
      if (cardRes.changes === 0) {
        throw new Error('No se pudo actualizar el cupo disponible de la tarjeta.');
      }

      // 10. Registrar transacción en historial
      await db.runAsync(
        `INSERT INTO transactions (
          id, account_id, card_id, type, amount, category_id, description, notes, date,
          to_account_id, card_purchase_id, card_installment_id, statement_id, principal_amount, interest_amount, gmf_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          txId,
          accountId,
          cardId,
          'card_payment',
          amount,
          'cat-financial',
          `Pago ${card.name}`,
          `Abono a tarjeta (Capital: $${allocResult.principalApplied}, Intereses Facturados: $${allocResult.currentInterestApplied + allocResult.lateInterestApplied}, Cargos Facturados: $${allocResult.handlingFeeApplied + allocResult.taxesAndFeesApplied + allocResult.collectionFeeApplied})`,
          today,
          null,
          null,
          null,
          stmt?.id || null,
          allocResult.principalApplied,
          allocResult.currentInterestApplied + allocResult.lateInterestApplied,
          0,
          now,
        ]
      );

      // 11. Registrar imputación en card_payment_allocations con conceptos facturados puros (BILLED ONLY)
      await db.runAsync(
        `INSERT INTO card_payment_allocations (
          id, transaction_id, card_id, statement_id, total_payment, principal_applied,
          current_interest_applied, late_interest_applied, handling_fee_applied,
          taxes_and_fees_applied, collection_fee_applied, credit_balance_applied,
          statement_applied, unbilled_applied, minimum_applied, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          allocationId,
          txId,
          cardId,
          stmt?.id || null,
          amount,
          allocResult.principalApplied,
          allocResult.currentInterestApplied, // BILLED ONLY
          allocResult.lateInterestApplied,    // BILLED ONLY
          allocResult.handlingFeeApplied,     // BILLED ONLY
          allocResult.taxesAndFeesApplied,    // BILLED ONLY
          allocResult.collectionFeeApplied,   // BILLED ONLY
          allocResult.creditBalanceApplied,
          allocResult.statementApplied,
          allocResult.unbilledApplied,
          allocResult.minimumApplied,
          now,
        ]
      );

      // 12. Aplicar y vincular pagos a conciliaciones no capitales pendientes (UNBILLED/RECONCILED)
      const unbilledInterest = ((allocResult.unbilledLateInterestApplied || 0) + (allocResult.unbilledCurrentInterestApplied || 0));
      const unbilledFees = allocResult.unbilledFeesApplied || 0;
      const unbilledTaxes = allocResult.unbilledTaxesApplied || 0;
      const unbilledCollection = allocResult.unbilledCollectionApplied || 0;

      if (unbilledInterest > 0 || unbilledFees > 0 || unbilledTaxes > 0 || unbilledCollection > 0) {
        await ReconciliationRepository.applyPaymentToReconciliations(card.id, allocationId, {
          collection: unbilledCollection,
          interest: unbilledInterest,
          fees: unbilledFees,
          taxes: unbilledTaxes,
        });
      }

      // 13. Si existe extracto vinculado, actualizar acumulados pagados y estado con statement_applied
      if (stmt) {
        await StatementRepository.updateStatementPayment(
          stmt.id,
          allocResult.statementApplied,
          allocResult.minimumApplied
        );
      }

      return {
        id: allocationId,
        transactionId: txId,
        cardId,
        statementId: stmt?.id,
        totalPayment: amount,
        principalApplied: allocResult.principalApplied,
        currentInterestApplied: allocResult.currentInterestApplied,
        lateInterestApplied: allocResult.lateInterestApplied,
        handlingFeeApplied: allocResult.handlingFeeApplied,
        taxesAndFeesApplied: allocResult.taxesAndFeesApplied,
        collectionFeeApplied: allocResult.collectionFeeApplied,
        creditBalanceApplied: allocResult.creditBalanceApplied,
        statementApplied: allocResult.statementApplied,
        unbilledApplied: allocResult.unbilledApplied,
        minimumApplied: allocResult.minimumApplied,
        createdAt: now,
      };
    });
  },

  /**
   * Resumen y cálculo exacto de los 3 saldos financieros para una tarjeta:
   * 1. Principal Debt vs Non-Principal Debt -> Total Current Debt
   * 2. Billed Statement Debt Remaining
   * 3. Unbilled Debt (Billed vs Unbilled consistency)
   */
  async getCardStatementSummary(card: CreditCard, referenceDate: Date = new Date()): Promise<CardStatementSummary> {
    const cycleDates = calculateCardCycleDates(card.cutOffDay, card.paymentDueDay, referenceDate);
    const db = await getDatabase();

    // 1. Capital total que consume cupo
    const principalDebt = Math.max(0, +(card.creditLimit - card.availableLimit).toFixed(2));

    // 2. Consultar extracto registrado en base de datos
    const latestStatement = await StatementRepository.getLatestStatement(card.id);

    let billedStatementDebtRemaining = 0;
    let billedPrincipalRemaining = 0;
    let billedNonPrincipalRemaining = 0;
    let minimumPaymentRemaining = 0;
    let minimumPaymentOriginal = 0;
    let totalStatementBalanceOriginal = 0;
    let statementStatus: CardStatementSummary['statementStatus'] = 'open';

    if (latestStatement) {
      totalStatementBalanceOriginal = latestStatement.totalStatementBalance;
      minimumPaymentOriginal = latestStatement.minimumPaymentOriginal;
      statementStatus = latestStatement.status;

      // Obtener conceptos pendientes reales descontando allocations
      const pending = await StatementRepository.getPendingConcepts(latestStatement.id);
      billedStatementDebtRemaining = pending.remainingStatementBalance;
      billedPrincipalRemaining = Math.min(principalDebt, pending.remainingPrincipal);
      billedNonPrincipalRemaining = pending.remainingNonPrincipal;
      minimumPaymentRemaining = pending.remainingMinimumPayment;
    }

    // 3. Consultar cargos/intereses no facturados de conciliación pendientes (descontando lo pagado)
    const nonPrincipalSummary = await ReconciliationRepository.getPendingNonPrincipalSummary(card.id);
    const unbilledNonPrincipalRemaining = nonPrincipalSummary.totalPending;

    // 4. Deuda no principal total
    const nonPrincipalDebt = +(billedNonPrincipalRemaining + unbilledNonPrincipalRemaining).toFixed(2);

    // 5. Deuda total actual
    const totalCurrentDebt = +(principalDebt + nonPrincipalDebt).toFixed(2);

    // 6. Deuda no facturada (capital post-corte + cargos no facturados)
    const unbilledPrincipalRemaining = Math.max(0, +(principalDebt - billedPrincipalRemaining).toFixed(2));
    const unbilledDebt = +(unbilledPrincipalRemaining + unbilledNonPrincipalRemaining).toFixed(2);

    // 7. Detección de inconsistencia financiera sin ocultamiento silencioso
    let hasInconsistency = false;
    let inconsistencyReason: string | undefined = undefined;

    if (billedStatementDebtRemaining > totalCurrentDebt && (card.positiveBalance || 0) <= 0) {
      hasInconsistency = true;
      inconsistencyReason = `Inconsistencia detectada: El saldo facturado pendiente ($${billedStatementDebtRemaining}) supera la deuda total calculada ($${totalCurrentDebt}). Se requiere conciliación.`;
    }

    return {
      cardId: card.id,
      cycleMonth: cycleDates.cutOffDate.substring(0, 7),
      cutOffDate: cycleDates.cutOffDate,
      paymentDueDate: cycleDates.paymentDueDate,
      daysToCutOff: cycleDates.daysToCutOff,
      daysToPayment: cycleDates.daysToPayment,
      isCutOffPassed: cycleDates.isCutOffPassed,
      isPaymentOverdue: cycleDates.isPaymentOverdue,
      principalDebt,
      nonPrincipalDebt,
      totalCurrentDebt,
      billedStatementDebtRemaining,
      unbilledDebt,
      billedPrincipalRemaining,
      unbilledPrincipalRemaining,
      billedNonPrincipalRemaining,
      unbilledNonPrincipalRemaining,
      hasInconsistency,
      inconsistencyReason,
      minimumPaymentRemaining,
      minimumPaymentOriginal,
      totalStatementBalanceOriginal,
      statementStatus,
      currentInstallmentsTotal: 0,
      singleQuotaPurchasesTotal: 0,
      handlingFee: card.handlingFee,
      estimatedInterestTotal: 0,
      totalToPayThisMonth: billedStatementDebtRemaining > 0 ? billedStatementDebtRemaining : totalCurrentDebt,
      minimumPayment: minimumPaymentRemaining > 0 ? minimumPaymentRemaining : Math.min(totalCurrentDebt, 50000),
      usedCredit: totalCurrentDebt,
      availableCredit: card.availableLimit,
      creditLimit: card.creditLimit,
      hasStatementSnapshot: !!latestStatement,
    };
  },
};
