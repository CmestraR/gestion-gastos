import { getDatabase } from '../database';
import { CreditCard, CardPurchase, CardInstallment } from '../../types/finance';
import { AccountRepository } from './accountRepository';

export const CardRepository = {
  async getAll(): Promise<CreditCard[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      bank_name: string;
      card_brand: string;
      last_four_digits: string | null;
      credit_limit: number;
      available_limit: number;
      cut_off_day: number;
      payment_due_day: number;
      interest_rate_monthly: number;
      handling_fee: number;
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
      lastFourDigits: r.last_four_digits || undefined,
      creditLimit: r.credit_limit,
      availableLimit: r.available_limit,
      cutOffDay: r.cut_off_day,
      paymentDueDay: r.payment_due_day,
      interestRateMonthly: r.interest_rate_monthly,
      handlingFee: r.handling_fee,
      colorGradient: [r.color_gradient_start, r.color_gradient_end] as [string, string],
      currency: r.currency,
      isArchived: r.is_archived === 1,
      createdAt: r.created_at,
    }));
  },

  async create(card: CreditCard): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO credit_cards (
        id, name, bank_name, card_brand, last_four_digits, credit_limit, available_limit,
        cut_off_day, payment_due_day, interest_rate_monthly, handling_fee,
        color_gradient_start, color_gradient_end, currency, is_archived, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        card.id,
        card.name,
        card.bankName,
        card.cardBrand,
        card.lastFourDigits || null,
        card.creditLimit,
        card.availableLimit,
        card.cutOffDay,
        card.paymentDueDay,
        card.interestRateMonthly,
        card.handlingFee,
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
        name = ?, bank_name = ?, card_brand = ?, last_four_digits = ?,
        credit_limit = ?, available_limit = ?, cut_off_day = ?, payment_due_day = ?,
        interest_rate_monthly = ?, handling_fee = ?,
        color_gradient_start = ?, color_gradient_end = ?, currency = ?
       WHERE id = ?`,
      [
        card.name,
        card.bankName,
        card.cardBrand,
        card.lastFourDigits || null,
        card.creditLimit,
        card.availableLimit,
        card.cutOffDay,
        card.paymentDueDay,
        card.interestRateMonthly,
        card.handlingFee,
        card.colorGradient[0],
        card.colorGradient[1],
        card.currency,
        card.id,
      ]
    );
  },

  async updateAvailableLimit(cardId: string, newAvailable: number): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE credit_cards SET available_limit = ? WHERE id = ?',
      [newAvailable, cardId]
    );
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'DELETE FROM transactions WHERE card_id = ? OR card_purchase_id IN (SELECT id FROM card_purchases WHERE card_id = ?)',
        [id, id]
      );
      await db.runAsync(
        'DELETE FROM card_installments WHERE purchase_id IN (SELECT id FROM card_purchases WHERE card_id = ?)',
        [id]
      );
      await db.runAsync('DELETE FROM card_purchases WHERE card_id = ?', [id]);
      await db.runAsync('DELETE FROM credit_cards WHERE id = ?', [id]);
    });
  },

  // === Compras y Cuotas ===

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
    }>('SELECT * FROM card_purchases WHERE card_id = ? ORDER BY created_at DESC', [cardId]);

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
    }>('SELECT * FROM card_purchases WHERE status = "active" ORDER BY created_at DESC');

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

  async createPurchase(purchase: CardPurchase, installments: CardInstallment[]): Promise<void> {
    const db = await getDatabase();

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO card_purchases (
          id, card_id, description, category_id, amount, installments_total, installments_paid,
          monthly_installment_amount, interest_rate_monthly, first_installment_date, status, created_at
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

      for (const inst of installments) {
        await db.runAsync(
          `INSERT INTO card_installments (
            id, purchase_id, installment_number, due_date, principal_amount, interest_amount, total_amount, is_paid, paid_date
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

      // Reducir el cupo disponible de la tarjeta considerando solo las cuotas pendientes
      const unpaidInstallments = installments.filter((i) => !i.isPaid);
      const unpaidPrincipal = unpaidInstallments.reduce((sum, i) => sum + i.principalAmount, 0);

      await db.runAsync(
        `UPDATE credit_cards SET available_limit = MAX(0, available_limit - ?) WHERE id = ?`,
        [unpaidPrincipal, purchase.cardId]
      );
    });
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

  async markInstallmentAsPaid(installmentId: string, purchaseId: string, principalAmount: number, cardId: string): Promise<void> {
    const db = await getDatabase();
    const today = new Date().toISOString().split('T')[0];

    await db.withTransactionAsync(async () => {
      // Marcar cuota como pagada
      await db.runAsync(
        `UPDATE card_installments SET is_paid = 1, paid_date = ? WHERE id = ?`,
        [today, installmentId]
      );

      // Incrementar número de cuotas pagadas en la compra
      await db.runAsync(
        `UPDATE card_purchases 
         SET installments_paid = installments_paid + 1,
             status = CASE WHEN installments_paid + 1 >= installments_total THEN 'completed' ELSE 'active' END
         WHERE id = ?`,
        [purchaseId]
      );

      // Liberar cupo en la tarjeta correspondiente al capital pagado
      await db.runAsync(
        `UPDATE credit_cards 
         SET available_limit = MIN(credit_limit, available_limit + ?) 
         WHERE id = ?`,
        [principalAmount, cardId]
      );
    });
  },

  /**
   * Ejecución 100% atómica del pago de cuota:
   * Marca cuota pagada, actualiza compra, libera cupo 1 sola vez, debita cuenta bancaria 1 sola vez y crea transacción en historial.
   */
  async payInstallmentAtomic(
    installmentId: string,
    purchaseId: string,
    principalAmount: number,
    totalAmount: number,
    cardId: string,
    accountId?: string
  ): Promise<void> {
    const db = await getDatabase();
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      // 1. Marcar cuota como pagada
      await db.runAsync(
        `UPDATE card_installments SET is_paid = 1, paid_date = ? WHERE id = ?`,
        [today, installmentId]
      );

      // 2. Incrementar número de cuotas pagadas en la compra
      await db.runAsync(
        `UPDATE card_purchases 
         SET installments_paid = installments_paid + 1,
             status = CASE WHEN installments_paid + 1 >= installments_total THEN 'completed' ELSE 'active' END
         WHERE id = ?`,
        [purchaseId]
      );

      // 3. Liberar cupo en la tarjeta correspondiente al capital pagado (ÚNICA FUENTE DE VERDAD)
      await db.runAsync(
        `UPDATE credit_cards 
         SET available_limit = MIN(credit_limit, available_limit + ?) 
         WHERE id = ?`,
        [principalAmount, cardId]
      );

      // 4. Si se especificó cuenta bancaria de origen, debitar saldo (ÚNICA VEZ) e insertar movimiento
      if (accountId) {
        await AccountRepository.updateBalance(accountId, -totalAmount);

        await db.runAsync(
          `INSERT INTO transactions (
            id, account_id, card_id, type, amount, category_id, description, notes, date, to_account_id, card_purchase_id, gmf_amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `tx-pay-inst-${installmentId}`,
            accountId,
            cardId,
            'card_payment',
            totalAmount,
            'cat-financial',
            'Pago Cuota Tarjeta',
            `Pago cuota de compra #${purchaseId}`,
            today,
            null,
            purchaseId,
            0,
            now,
          ]
        );
      }
    });
  },
};
