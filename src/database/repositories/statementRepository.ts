import { getDatabase } from '../database.ts';
import type { CardStatement, StatementStatus } from '../../types/finance.ts';

export const StatementRepository = {
  /**
   * Crea un Snapshot Inmutable de Extracto.
   * Rechaza extractos duplicados para el mismo ciclo.
   */
  async createSnapshot(
    data: Omit<CardStatement, 'id' | 'createdAt'>
  ): Promise<CardStatement> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const statementId = `stmt-${data.cardId}-${data.billingCycleId}`;

    // Validar que no exista un extracto ya registrado para este ciclo
    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM card_statements WHERE card_id = ? AND billing_cycle_id = ?',
      [data.cardId, data.billingCycleId]
    );

    if (existing) {
      throw new Error('Ya existe un extracto registrado para este ciclo de facturación.');
    }

    await db.runAsync(
      `INSERT INTO card_statements (
        id, card_id, billing_cycle_id, statement_date, due_date, opening_balance,
        purchases_total, advances_total, principal_total, current_interest, late_interest,
        handling_fee, taxes_and_fees, collection_fee, total_statement_balance, minimum_payment_original,
        statement_balance_paid, minimum_payment_paid, status, is_manual_snapshot, is_opening_balance, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        statementId,
        data.cardId,
        data.billingCycleId,
        data.statementDate,
        data.dueDate,
        data.openingBalance,
        data.purchasesTotal,
        data.advancesTotal,
        data.principalTotal,
        data.currentInterest,
        data.lateInterest,
        data.handlingFee,
        data.taxesAndFees,
        data.collectionFee || 0,
        data.totalStatementBalance,
        data.minimumPaymentOriginal,
        data.statementBalancePaid || 0,
        data.minimumPaymentPaid || 0,
        data.status || 'open',
        data.isManualSnapshot ? 1 : 0,
        data.isOpeningBalance ? 1 : 0,
        data.notes || null,
        now,
      ]
    );

    return {
      ...data,
      id: statementId,
      collectionFee: data.collectionFee || 0,
      createdAt: now,
    };
  },

  /**
   * Registra un extracto manual estándar
   */
  async createManualStatement(stmt: CardStatement): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    const existing = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM card_statements WHERE id = ?',
      [stmt.id]
    );

    if (existing) {
      throw new Error(`Ya existe un extracto con el ID ${stmt.id}.`);
    }

    await db.runAsync(
      `INSERT INTO card_statements (
        id, card_id, billing_cycle_id, statement_date, due_date, opening_balance,
        purchases_total, advances_total, principal_total, current_interest, late_interest,
        handling_fee, taxes_and_fees, collection_fee, total_statement_balance, minimum_payment_original,
        statement_balance_paid, minimum_payment_paid, status, is_manual_snapshot, is_opening_balance, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        stmt.id,
        stmt.cardId,
        stmt.billingCycleId,
        stmt.statementDate,
        stmt.dueDate,
        stmt.openingBalance,
        stmt.purchasesTotal,
        stmt.advancesTotal,
        stmt.principalTotal,
        stmt.currentInterest,
        stmt.lateInterest,
        stmt.handlingFee,
        stmt.taxesAndFees,
        stmt.collectionFee || 0,
        stmt.totalStatementBalance,
        stmt.minimumPaymentOriginal,
        stmt.statementBalancePaid,
        stmt.minimumPaymentPaid,
        stmt.status,
        1, // is_manual_snapshot
        stmt.isOpeningBalance ? 1 : 0,
        stmt.notes || null,
        stmt.createdAt || now,
      ]
    );
  },

  /**
   * Comprueba si una tarjeta ya tiene un Opening Balance registrado
   */
  async hasOpeningBalance(cardId: string): Promise<boolean> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM card_statements WHERE card_id = ? AND is_opening_balance = 1',
      [cardId]
    );
    return !!row;
  },

  /**
   * Registra un extracto de apertura inicial auditado (Opening Balance).
   * Solo permite UN saldo de apertura por tarjeta.
   */
  async createOpeningBalanceSnapshot(data: {
    cardId: string;
    billingCycleId: string;
    statementDate: string;
    dueDate: string;
    principalTotal: number;
    interestAndFeesTotal: number;
    minimumPayment?: number;
    notes?: string;
  }): Promise<CardStatement> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const statementId = `stmt-open-${data.cardId}-${Date.now()}`;

    // 1. Validar a nivel de dominio y base de datos que no exista ya un opening balance
    const existingOpening = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM card_statements WHERE card_id = ? AND is_opening_balance = 1',
      [data.cardId]
    );

    if (existingOpening) {
      throw new Error(
        'Esta tarjeta ya cuenta con un Saldo de Apertura inicial registrado. Para registrar ajustes posteriores utilice el módulo de Conciliación Bancaria.'
      );
    }

    const totalBalance = +(data.principalTotal + data.interestAndFeesTotal).toFixed(2);
    const minimumPayment = data.minimumPayment !== undefined && data.minimumPayment > 0
      ? data.minimumPayment
      : totalBalance;

    let createdStatement: CardStatement | null = null;

    await db.withTransactionAsync(async () => {
      // 2. Insertar extracto de apertura
      await db.runAsync(
        `INSERT INTO card_statements (
          id, card_id, billing_cycle_id, statement_date, due_date, opening_balance,
          purchases_total, advances_total, principal_total, current_interest, late_interest,
          handling_fee, taxes_and_fees, collection_fee, total_statement_balance, minimum_payment_original,
          statement_balance_paid, minimum_payment_paid, status, is_manual_snapshot, is_opening_balance, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          statementId,
          data.cardId,
          data.billingCycleId,
          data.statementDate,
          data.dueDate,
          0,
          data.principalTotal,
          0,
          data.principalTotal,
          data.interestAndFeesTotal,
          0,
          0,
          0,
          0,
          totalBalance,
          minimumPayment,
          0,
          0,
          'open',
          1,
          1,
          data.notes || 'Saldo de Apertura Inicial',
          now,
        ]
      );

      // 3. Registrar transacción de apertura en libro mayor de auditoría
      const txOpeningId = `tx-open-${data.cardId}-${Date.now()}`;
      await db.runAsync(
        `INSERT INTO transactions (
          id, account_id, card_id, type, amount, category_id, description, notes, date,
          to_account_id, card_purchase_id, card_installment_id, statement_id, principal_amount, interest_amount, gmf_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          txOpeningId,
          null,
          data.cardId,
          'card_opening_balance',
          totalBalance,
          'cat-financial',
          'Saldo de Apertura Tarjeta',
          data.notes || 'Registro de saldo inicial anterior a la aplicación',
          data.statementDate,
          null,
          null,
          null,
          statementId,
          data.principalTotal,
          data.interestAndFeesTotal,
          0,
          now,
        ]
      );

      // 4. Reducir el cupo disponible exclusivamente por la porción de capital (principalTotal)
      await db.runAsync(
        'UPDATE credit_cards SET available_limit = MAX(0, available_limit - ?) WHERE id = ?',
        [data.principalTotal, data.cardId]
      );

      createdStatement = {
        id: statementId,
        cardId: data.cardId,
        billingCycleId: data.billingCycleId,
        statementDate: data.statementDate,
        dueDate: data.dueDate,
        openingBalance: 0,
        purchasesTotal: data.principalTotal,
        advancesTotal: 0,
        principalTotal: data.principalTotal,
        currentInterest: data.interestAndFeesTotal,
        lateInterest: 0,
        handlingFee: 0,
        taxesAndFees: 0,
        collectionFee: 0,
        totalStatementBalance: totalBalance,
        minimumPaymentOriginal: minimumPayment,
        statementBalancePaid: 0,
        minimumPaymentPaid: 0,
        status: 'open',
        isManualSnapshot: true,
        isOpeningBalance: true,
        notes: data.notes || 'Saldo de Apertura Inicial',
        createdAt: now,
      };
    });

    return createdStatement!;
  },

  /**
   * Obtiene los conceptos realmente pendientes de un extracto descontando pagos previos
   */
  async getPendingConcepts(statementId: string) {
    const db = await getDatabase();
    const stmt = await this.getStatementById(statementId);
    if (!stmt) {
      return {
        stmt: null,
        remainingTaxesAndFees: 0,
        remainingHandlingFee: 0,
        remainingCollectionFee: 0,
        remainingLateInterest: 0,
        remainingCurrentInterest: 0,
        remainingPrincipal: 0,
        remainingNonPrincipal: 0,
        remainingStatementBalance: 0,
        remainingMinimumPayment: 0,
      };
    }

    const allocs = await db.getAllAsync<{
      taxes_and_fees_applied: number;
      handling_fee_applied: number;
      collection_fee_applied: number;
      late_interest_applied: number;
      current_interest_applied: number;
      principal_applied: number;
      statement_applied: number;
    }>(
      'SELECT taxes_and_fees_applied, handling_fee_applied, collection_fee_applied, late_interest_applied, current_interest_applied, principal_applied, statement_applied FROM card_payment_allocations WHERE statement_id = ?',
      [statementId]
    );

    let sumTaxes = 0;
    let sumHandling = 0;
    let sumCollection = 0;
    let sumLate = 0;
    let sumCurrent = 0;
    let sumPrincipal = 0;

    for (const a of allocs) {
      sumTaxes += a.taxes_and_fees_applied || 0;
      sumHandling += a.handling_fee_applied || 0;
      sumCollection += a.collection_fee_applied || 0;
      sumLate += a.late_interest_applied || 0;
      sumCurrent += a.current_interest_applied || 0;
      sumPrincipal += a.principal_applied || 0;
    }

    const remainingTaxesAndFees = Math.max(0, +(stmt.taxesAndFees - sumTaxes).toFixed(2));
    const remainingHandlingFee = Math.max(0, +(stmt.handlingFee - sumHandling).toFixed(2));
    const remainingCollectionFee = Math.max(0, +(stmt.collectionFee - sumCollection).toFixed(2));
    const remainingLateInterest = Math.max(0, +(stmt.lateInterest - sumLate).toFixed(2));
    const remainingCurrentInterest = Math.max(0, +(stmt.currentInterest - sumCurrent).toFixed(2));
    const remainingPrincipal = Math.max(0, +(stmt.principalTotal - sumPrincipal).toFixed(2));
    const remainingNonPrincipal = +(
      remainingTaxesAndFees +
      remainingHandlingFee +
      remainingCollectionFee +
      remainingLateInterest +
      remainingCurrentInterest
    ).toFixed(2);
    const remainingStatementBalance = Math.max(
      0,
      +(stmt.totalStatementBalance - stmt.statementBalancePaid).toFixed(2)
    );
    const remainingMinimumPayment = Math.max(
      0,
      +(stmt.minimumPaymentOriginal - stmt.minimumPaymentPaid).toFixed(2)
    );

    return {
      stmt,
      remainingTaxesAndFees,
      remainingHandlingFee,
      remainingCollectionFee,
      remainingLateInterest,
      remainingCurrentInterest,
      remainingPrincipal,
      remainingNonPrincipal,
      remainingStatementBalance,
      remainingMinimumPayment,
    };
  },

  /**
   * Obtiene el extracto más reciente de una tarjeta
   */
  async getLatestStatement(cardId: string): Promise<CardStatement | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      id: string;
      card_id: string;
      billing_cycle_id: string;
      statement_date: string;
      due_date: string;
      opening_balance: number;
      purchases_total: number;
      advances_total: number;
      principal_total: number;
      current_interest: number;
      late_interest: number;
      handling_fee: number;
      taxes_and_fees: number;
      collection_fee: number;
      total_statement_balance: number;
      minimum_payment_original: number;
      statement_balance_paid: number;
      minimum_payment_paid: number;
      status: StatementStatus;
      is_manual_snapshot: number;
      is_opening_balance: number;
      notes: string | null;
      created_at: string;
    }>(
      'SELECT * FROM card_statements WHERE card_id = ? ORDER BY statement_date DESC, created_at DESC LIMIT 1',
      [cardId]
    );

    if (!row) return null;

    return {
      id: row.id,
      cardId: row.card_id,
      billingCycleId: row.billing_cycle_id,
      statementDate: row.statement_date,
      dueDate: row.due_date,
      openingBalance: row.opening_balance,
      purchasesTotal: row.purchases_total,
      advancesTotal: row.advances_total,
      principalTotal: row.principal_total,
      currentInterest: row.current_interest,
      lateInterest: row.late_interest,
      handlingFee: row.handling_fee,
      taxesAndFees: row.taxes_and_fees,
      collectionFee: row.collection_fee || 0,
      totalStatementBalance: row.total_statement_balance,
      minimumPaymentOriginal: row.minimum_payment_original,
      statementBalancePaid: row.statement_balance_paid,
      minimumPaymentPaid: row.minimum_payment_paid,
      status: row.status,
      isManualSnapshot: row.is_manual_snapshot === 1,
      isOpeningBalance: row.is_opening_balance === 1,
      notes: row.notes || undefined,
      createdAt: row.created_at,
    };
  },

  /**
   * Obtiene un extracto por su ID
   */
  async getStatementById(id: string): Promise<CardStatement | null> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<any>(
      'SELECT * FROM card_statements WHERE id = ?',
      [id]
    );

    if (!row) return null;

    return {
      id: row.id,
      cardId: row.card_id,
      billingCycleId: row.billing_cycle_id,
      statementDate: row.statement_date,
      dueDate: row.due_date,
      openingBalance: row.opening_balance,
      purchasesTotal: row.purchases_total,
      advancesTotal: row.advances_total,
      principalTotal: row.principal_total,
      currentInterest: row.current_interest,
      lateInterest: row.late_interest,
      handlingFee: row.handling_fee,
      taxesAndFees: row.taxes_and_fees,
      collectionFee: row.collection_fee || 0,
      totalStatementBalance: row.total_statement_balance,
      minimumPaymentOriginal: row.minimum_payment_original,
      statementBalancePaid: row.statement_balance_paid,
      minimumPaymentPaid: row.minimum_payment_paid,
      status: row.status,
      isManualSnapshot: row.is_manual_snapshot === 1,
      isOpeningBalance: row.is_opening_balance === 1,
      notes: row.notes || undefined,
      createdAt: row.created_at,
    };
  },

  /**
   * Obtiene todos los extractos de una tarjeta ordenados por fecha descendente
   */
  async getStatementsForCard(cardId: string): Promise<CardStatement[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM card_statements WHERE card_id = ? ORDER BY statement_date DESC',
      [cardId]
    );

    return rows.map((row) => ({
      id: row.id,
      cardId: row.card_id,
      billingCycleId: row.billing_cycle_id,
      statementDate: row.statement_date,
      dueDate: row.due_date,
      openingBalance: row.opening_balance,
      purchasesTotal: row.purchases_total,
      advancesTotal: row.advances_total,
      principalTotal: row.principal_total,
      currentInterest: row.current_interest,
      lateInterest: row.late_interest,
      handlingFee: row.handling_fee,
      taxesAndFees: row.taxes_and_fees,
      collectionFee: row.collection_fee || 0,
      totalStatementBalance: row.total_statement_balance,
      minimumPaymentOriginal: row.minimum_payment_original,
      statementBalancePaid: row.statement_balance_paid,
      minimumPaymentPaid: row.minimum_payment_paid,
      status: row.status,
      isManualSnapshot: row.is_manual_snapshot === 1,
      isOpeningBalance: row.is_opening_balance === 1,
      notes: row.notes || undefined,
      createdAt: row.created_at,
    }));
  },

  /**
   * Actualiza el saldo pagado hacia un extracto y reevalúa su estado
   * Garantiza que nunca se supere totalStatementBalance ni minimumPaymentOriginal
   */
  async updateStatementPayment(
    statementId: string,
    paymentDelta: number,
    minimumPaymentDelta: number
  ): Promise<void> {
    const db = await getDatabase();
    const stmt = await this.getStatementById(statementId);
    if (!stmt) return;

    const newStatementPaid = Math.min(
      stmt.totalStatementBalance,
      Math.max(0, +(stmt.statementBalancePaid + paymentDelta).toFixed(2))
    );
    const newMinimumPaid = Math.min(
      stmt.minimumPaymentOriginal,
      Math.max(0, +(stmt.minimumPaymentPaid + minimumPaymentDelta).toFixed(2))
    );

    // Determinar nuevo estado
    let newStatus: StatementStatus = 'open';
    if (newStatementPaid >= stmt.totalStatementBalance) {
      newStatus = 'paid';
    } else if (newMinimumPaid >= stmt.minimumPaymentOriginal) {
      newStatus = 'minimum_covered';
    } else if (newStatementPaid > 0) {
      newStatus = 'partially_paid';
    }

    // Verificar si está vencido
    const today = new Date().toISOString().split('T')[0];
    if (today > stmt.dueDate && newStatus !== 'paid' && newStatus !== 'minimum_covered') {
      newStatus = 'overdue';
    }

    await db.runAsync(
      `UPDATE card_statements 
       SET statement_balance_paid = ?,
           minimum_payment_paid = ?,
           status = ?
       WHERE id = ?`,
      [newStatementPaid, newMinimumPaid, newStatus, statementId]
    );
  },
};
