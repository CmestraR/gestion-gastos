import { getDatabase } from '../database.ts';
import type { CardBillingCycle, BillingCycleStatus } from '../../types/finance.ts';

/**
 * Calcula de manera robusta el último día válido para un mes determinado (28, 29, 30 o 31)
 */
export function clampDayToMonth(year: number, monthZeroIndexed: number, desiredDay: number): number {
  const lastDayOfMonth = new Date(year, monthZeroIndexed + 1, 0).getDate();
  return Math.min(desiredDay, lastDayOfMonth);
}

/**
 * Formatea año, mes y día como YYYY-MM-DD
 */
export function formatDateYMD(year: number, monthZeroIndexed: number, day: number): string {
  const m = String(monthZeroIndexed + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export const CycleRepository = {
  /**
   * Obtiene o genera automáticamente el ciclo de facturación activo para una tarjeta
   */
  async getOrCreateCurrentCycle(
    cardId: string,
    referenceDate: Date = new Date()
  ): Promise<CardBillingCycle> {
    const db = await getDatabase();

    // 1. Consultar tarjeta para conocer sus días de corte y pago
    const card = await db.getFirstAsync<{
      id: string;
      cut_off_day: number;
      payment_due_day: number;
      is_archived: number;
    }>('SELECT id, cut_off_day, payment_due_day, is_archived FROM credit_cards WHERE id = ?', [cardId]);

    if (!card) {
      throw new Error(`La tarjeta con ID ${cardId} no existe.`);
    }

    const refYear = referenceDate.getFullYear();
    const refMonth = referenceDate.getMonth();
    const refDay = referenceDate.getDate();

    // Determinar fechas del ciclo actual
    let cycleCutYear = refYear;
    let cycleCutMonth = refMonth;

    const actualCutDayThisMonth = clampDayToMonth(refYear, refMonth, card.cut_off_day);
    if (refDay > actualCutDayThisMonth) {
      // Si la fecha actual ya superó el corte de este mes, el ciclo abierto corta el próximo mes
      cycleCutMonth += 1;
      if (cycleCutMonth > 11) {
        cycleCutMonth = 0;
        cycleCutYear += 1;
      }
    }

    // Fecha de corte
    const cutDay = clampDayToMonth(cycleCutYear, cycleCutMonth, card.cut_off_day);
    const cutOffDateStr = formatDateYMD(cycleCutYear, cycleCutMonth, cutDay);

    // Fecha de inicio (un día después del corte del mes anterior)
    let prevCutYear = cycleCutYear;
    let prevCutMonth = cycleCutMonth - 1;
    if (prevCutMonth < 0) {
      prevCutMonth = 11;
      prevCutYear -= 1;
    }
    const prevCutDay = clampDayToMonth(prevCutYear, prevCutMonth, card.cut_off_day);
    const startDate = new Date(prevCutYear, prevCutMonth, prevCutDay + 1);
    const startDateStr = formatDateYMD(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

    // Fecha límite de pago (normalmente en el mes posterior al corte o según payment_due_day)
    let dueYear = cycleCutYear;
    let dueMonth = cycleCutMonth;
    if (card.payment_due_day <= card.cut_off_day) {
      dueMonth += 1;
      if (dueMonth > 11) {
        dueMonth = 0;
        dueYear += 1;
      }
    }
    const dueDay = clampDayToMonth(dueYear, dueMonth, card.payment_due_day);
    const paymentDueDateStr = formatDateYMD(dueYear, dueMonth, dueDay);

    // 2. Verificar si ya existe en base de datos
    const existing = await db.getFirstAsync<{
      id: string;
      card_id: string;
      cycle_number: number;
      start_date: string;
      cut_off_date: string;
      payment_due_date: string;
      status: BillingCycleStatus;
      created_at: string;
    }>(
      'SELECT id, card_id, cycle_number, start_date, cut_off_date, payment_due_date, status, created_at FROM card_billing_cycles WHERE card_id = ? AND cut_off_date = ?',
      [cardId, cutOffDateStr]
    );

    if (existing) {
      return {
        id: existing.id,
        cardId: existing.card_id,
        cycleNumber: existing.cycle_number,
        startDate: existing.start_date,
        cutOffDate: existing.cut_off_date,
        paymentDueDate: existing.payment_due_date,
        status: existing.status,
        createdAt: existing.created_at,
      };
    }

    // 3. Crear nuevo ciclo
    const countRes = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM card_billing_cycles WHERE card_id = ?',
      [cardId]
    );
    const nextNumber = (countRes?.count || 0) + 1;
    const newCycleId = `cycle-${cardId}-${cutOffDateStr}`;
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO card_billing_cycles (
        id, card_id, cycle_number, start_date, cut_off_date, payment_due_date, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
      [newCycleId, cardId, nextNumber, startDateStr, cutOffDateStr, paymentDueDateStr, now]
    );

    return {
      id: newCycleId,
      cardId,
      cycleNumber: nextNumber,
      startDate: startDateStr,
      cutOffDate: cutOffDateStr,
      paymentDueDate: paymentDueDateStr,
      status: 'open',
      createdAt: now,
    };
  },

  /**
   * Determina el ciclo correspondiente para una compra según su fecha
   */
  async getCycleForPurchaseDate(cardId: string, purchaseDateYMD: string): Promise<CardBillingCycle> {
    const parts = purchaseDateYMD.split('-');
    const pDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return this.getOrCreateCurrentCycle(cardId, pDate);
  },

  /**
   * Obtiene todos los ciclos registrados de una tarjeta
   */
  async getCyclesForCard(cardId: string): Promise<CardBillingCycle[]> {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      id: string;
      card_id: string;
      cycle_number: number;
      start_date: string;
      cut_off_date: string;
      payment_due_date: string;
      status: BillingCycleStatus;
      created_at: string;
    }>(
      'SELECT id, card_id, cycle_number, start_date, cut_off_date, payment_due_date, status, created_at FROM card_billing_cycles WHERE card_id = ? ORDER BY cut_off_date DESC',
      [cardId]
    );

    return rows.map((r) => ({
      id: r.id,
      cardId: r.card_id,
      cycleNumber: r.cycle_number,
      startDate: r.start_date,
      cutOffDate: r.cut_off_date,
      paymentDueDate: r.payment_due_date,
      status: r.status,
      createdAt: r.created_at,
    }));
  },
};
