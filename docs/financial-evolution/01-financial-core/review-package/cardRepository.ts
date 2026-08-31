import { getDatabase } from '../database.ts';
import type { CreditCard, CardPurchase, CardInstallment } from '../../types/finance.ts';
import { AccountRepository } from './accountRepository.ts';

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
      // 1. Verificar si la tarjeta tiene historial financiero
      const txCount = await db.getFirstAsync<{ count: number }>(
        'SELECT count(*) as count FROM transactions WHERE card_id = ? OR card_purchase_id IN (SELECT id FROM card_purchases WHERE card_id = ?)',
        [id, id]
      );
      const purchaseCount = await db.getFirstAsync<{ count: number }>(
        'SELECT count(*) as count FROM card_purchases WHERE card_id = ?',
        [id]
      );

      const hasHistory = (txCount?.count || 0) > 0 || (purchaseCount?.count || 0) > 0;

      if (hasHistory) {
        // POLÍTICA: Si tiene historial financiero, ARCHIVAR para preservar la integridad contable
        await db.runAsync('UPDATE credit_cards SET is_archived = 1 WHERE id = ?', [id]);
      } else {
        // Si nunca tuvo movimientos, permitir eliminación física limpia
        await db.runAsync('DELETE FROM credit_cards WHERE id = ?', [id]);
      }
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

  /**
   * Creación 100% Atómica de una Compra con Tarjeta y sus Cuotas (ÚNICA FUENTE DE VERDAD)
   * Valida tarjeta, inserta compra, inserta todas las cuotas, reduce cupo e inserta transacción de consumo en una sola transacción ACID.
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

      // 2. Insertar compra
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

      // 3. Insertar todas las cuotas
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
};
