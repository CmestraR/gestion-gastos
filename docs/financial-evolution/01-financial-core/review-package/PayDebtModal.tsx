import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
} from 'react-native';
import { Account, CreditCard, CardPurchase, Transaction } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { formatCurrency, formatInputNumber, parseInputNumber } from '../../utils/formatters';
import { calculateMonthlyQuota, generateAmortizationSchedule } from '../../utils/financialMath';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';

interface PayDebtModalProps {
  visible: boolean;
  debtAccount: Account | null;
  onClose: () => void;
}

export const PayDebtModal: React.FC<PayDebtModalProps> = ({
  visible,
  debtAccount,
  onClose,
}) => {
  const {
    accounts,
    creditCards,
    addTransaction,
    addCardPurchase,
    updateAccount,
    currency,
  } = useFinancial();
  const { showSuccess, showWarning, showError } = useAlert();

  const [paymentMethod, setPaymentMethod] = useState<'account' | 'card'>('account');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  // Cuenta origen (débito / efectivo)
  const nonDebtAccounts = accounts.filter((a) => a.type !== 'debt' && a.id !== debtAccount?.id);
  const [selectedAccountId, setSelectedAccountId] = useState(nonDebtAccounts[0]?.id || '');

  // Tarjeta de crédito origen
  const [selectedCardId, setSelectedCardId] = useState(creditCards[0]?.id || '');
  const [installments, setInstallments] = useState('1');

  // Deuda actual acumulada (en positivo para cálculo)
  const currentDebt = debtAccount ? Math.abs(debtAccount.balance) : 0;

  useEffect(() => {
    if (visible && debtAccount) {
      setAmount(formatInputNumber(Math.abs(debtAccount.balance).toString()));
      setNotes('');
      setInstallments('1');
      if (nonDebtAccounts[0]) setSelectedAccountId(nonDebtAccounts[0].id);
      if (creditCards[0]) setSelectedCardId(creditCards[0].id);
    }
  }, [visible, debtAccount]);

  const parsedAmount = parseInputNumber(amount);
  const parsedInstallments = parseInt(installments, 10) || 1;
  const selectedCard = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  // Cuotas de tarjeta
  const cardRate = parsedInstallments === 1 ? 0 : (selectedCard?.interestRateMonthly || 0);
  const liveQuota = calculateMonthlyQuota(parsedAmount, cardRate, parsedInstallments);
  const totalProjected = parsedInstallments > 1 ? liveQuota * parsedInstallments : parsedAmount;

  // GMF si la cuenta paga impuesto
  const hasGmf = selectedAccount?.hasGmf4x1000 && parsedAmount > 0;
  const gmfAmount = hasGmf ? Math.round(parsedAmount * 0.004) : 0;

  const handlePay = async () => {
    if (!debtAccount) return;

    if (parsedAmount <= 0) {
      showWarning('Monto Inválido', 'Ingresa un valor mayor a cero para abonar a la deuda.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

    try {
      if (paymentMethod === 'account') {
        // Pago desde Cuenta Bancaria / Efectivo
        if (!selectedAccount) {
          showWarning('Cuenta Requerida', 'Selecciona la cuenta de la cual saldrá el dinero.');
          return;
        }

        // 1. Abonar a la cuenta de deuda (aumenta el balance hacia 0 o positivo)
        const updatedDebtAccount: Account = {
          ...debtAccount,
          balance: debtAccount.balance + parsedAmount,
        };
        await updateAccount(updatedDebtAccount);

        // 2. Registrar la transacción de traspaso / pago de deuda
        const tx: Transaction = {
          id: `tx-debt-pay-${Date.now()}`,
          accountId: selectedAccount.id,
          toAccountId: debtAccount.id,
          type: 'transfer',
          amount: parsedAmount,
          categoryId: 'cat-financial',
          description: `Abono a Deuda: ${debtAccount.name}`,
          notes: notes.trim() || `Pago realizado desde ${selectedAccount.name}`,
          date: todayStr,
          gmfAmount: hasGmf ? gmfAmount : undefined,
          createdAt: nowIso,
        };
        await addTransaction(tx);

        showSuccess('¡Abono Realizado!', `Se abonaron ${formatCurrency(parsedAmount, currency)} a ${debtAccount.name} desde ${selectedAccount.name}.`);
      } else {
        // Pago con Tarjeta de Crédito en cuotas
        if (!selectedCard) {
          showWarning('Tarjeta Requerida', 'Debes tener una tarjeta de crédito registrada.');
          return;
        }

        // 1. Abonar a la cuenta de deuda
        const updatedDebtAccount: Account = {
          ...debtAccount,
          balance: debtAccount.balance + parsedAmount,
        };
        await updateAccount(updatedDebtAccount);

        // 2. Crear la compra a cuotas en la tarjeta
        const purchaseId = `purch-debt-${Date.now()}`;
        const newPurchase: CardPurchase = {
          id: purchaseId,
          cardId: selectedCard.id,
          description: `Pago Deuda: ${debtAccount.name}`,
          categoryId: 'cat-financial',
          amount: parsedAmount,
          installmentsTotal: parsedInstallments,
          installmentsPaid: 0,
          monthlyInstallmentAmount: liveQuota,
          interestRateMonthly: cardRate,
          firstInstallmentDate: todayStr,
          status: 'active',
          createdAt: nowIso,
        };

        const schedule = generateAmortizationSchedule(
          purchaseId,
          parsedAmount,
          cardRate,
          parsedInstallments,
          new Date(),
          0
        );

        await addCardPurchase(newPurchase, schedule);

        showSuccess(
          '¡Deuda Pagada con Tarjeta!',
          `Se difirió el pago de ${formatCurrency(parsedAmount, currency)} a ${parsedInstallments} cuota(s) en ${selectedCard.name}.`
        );
      }

      onClose();
    } catch (e) {
      showError('Error', 'No se pudo procesar el pago de la deuda.');
    }
  };

  if (!debtAccount) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.backdropDismiss}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.tag}>PAGAR / ABONAR DEUDA</Text>
              <Text style={styles.title}>{debtAccount.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CustomIcon name="X" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 25 }}>
            {/* Tarjeta de Resumen de la Deuda */}
            <View style={styles.debtSummaryCard}>
              <View style={styles.debtSummaryHeader}>
                <CustomIcon name="Receipt" size={18} color="#EF4444" />
                <Text style={styles.debtSummaryLabel}>Deuda Pendiente Acumulada</Text>
              </View>
              <Text style={styles.debtSummaryValue}>
                {formatCurrency(currentDebt, currency)}
              </Text>
              {debtAccount.interestRateMonthly ? (
                <Text style={styles.debtInterestText}>
                  Interés pactado: {debtAccount.interestRateMonthly}% E.M.
                </Text>
              ) : null}
            </View>

            {/* Input de Monto a Pagar */}
            <Text style={styles.fieldLabel}>Monto a Abonar / Cancelar</Text>
            <View style={styles.amountBox}>
              <Text style={styles.currencySymbol}>{currency} $</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor="#475569"
                keyboardType="numeric"
                value={amount}
                onChangeText={(text) => setAmount(formatInputNumber(text))}
              />
            </View>

            {/* Accesos Rápidos de Monto */}
            <View style={styles.quickAmountsRow}>
              <TouchableOpacity
                style={styles.quickAmountBtn}
                onPress={() => setAmount(formatInputNumber(currentDebt.toString()))}
              >
                <Text style={styles.quickAmountBtnText}>Total ({formatCurrency(currentDebt, currency)})</Text>
              </TouchableOpacity>
              {currentDebt > 0 && (
                <TouchableOpacity
                  style={styles.quickAmountBtn}
                  onPress={() => setAmount(formatInputNumber(Math.round(currentDebt / 2).toString()))}
                >
                  <Text style={styles.quickAmountBtnText}>50%</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Selector de Método de Pago */}
            <Text style={styles.fieldLabel}>Pagar Utilizando</Text>
            <View style={styles.methodTabs}>
              <TouchableOpacity
                style={[styles.methodTab, paymentMethod === 'account' && styles.methodTabActive]}
                onPress={() => setPaymentMethod('account')}
              >
                <CustomIcon name="Landmark" size={14} color={paymentMethod === 'account' ? '#FFFFFF' : '#94A3B8'} />
                <Text style={[styles.methodTabText, paymentMethod === 'account' && styles.methodTabTextActive]}>
                  Cuenta / Efectivo
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.methodTab, paymentMethod === 'card' && styles.methodTabActive]}
                onPress={() => setPaymentMethod('card')}
              >
                <CustomIcon name="CreditCard" size={14} color={paymentMethod === 'card' ? '#FFFFFF' : '#94A3B8'} />
                <Text style={[styles.methodTabText, paymentMethod === 'card' && styles.methodTabTextActive]}>
                  Tarjeta de Crédito
                </Text>
              </TouchableOpacity>
            </View>

            {/* Configuración si es Pago con Cuenta */}
            {paymentMethod === 'account' ? (
              <View style={styles.accountSelectionBlock}>
                <Text style={styles.subFieldLabel}>Seleccionar Cuenta Origen</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsRow}>
                  {nonDebtAccounts.map((acc) => {
                    const isSelected = acc.id === selectedAccountId;
                    return (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.accountChip, isSelected && styles.accountChipSelected]}
                        onPress={() => setSelectedAccountId(acc.id)}
                      >
                        <CustomIcon name={acc.icon || 'Landmark'} size={13} color={isSelected ? '#FFFFFF' : '#94A3B8'} />
                        <Text style={[styles.accountChipText, isSelected && styles.accountChipTextSelected]}>
                          {acc.name}
                        </Text>
                        <Text style={styles.accountChipBalance}>
                          ({formatCurrency(acc.balance, currency)})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {hasGmf && (
                  <View style={styles.gmfNoticeBox}>
                    <Text style={styles.gmfNoticeText}>
                      ⚠️ Esta cuenta aplica 4x1000. Se descontará un gravamen adicional de {formatCurrency(gmfAmount, currency)}.
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              /* Configuración si es Pago con Tarjeta a Cuotas */
              <View style={styles.cardSelectionBlock}>
                <Text style={styles.subFieldLabel}>Seleccionar Tarjeta de Crédito</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsRow}>
                  {creditCards.map((c) => {
                    const isSelected = c.id === selectedCardId;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.accountChip, isSelected && styles.accountChipSelected]}
                        onPress={() => setSelectedCardId(c.id)}
                      >
                        <CustomIcon name="CreditCard" size={13} color={isSelected ? '#FFFFFF' : '#94A3B8'} />
                        <Text style={[styles.accountChipText, isSelected && styles.accountChipTextSelected]}>
                          {c.name}
                        </Text>
                        <Text style={styles.accountChipBalance}>
                          (Disp: {formatCurrency(c.availableLimit, currency)})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Cuotas de la Tarjeta */}
                <Text style={styles.subFieldLabel}>Diferir a Cuotas ({installments} cuotas)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quotaRow}>
                  {[1, 2, 3, 6, 9, 12, 18, 24].map((q) => (
                    <TouchableOpacity
                      key={q}
                      style={[styles.quotaChip, parsedInstallments === q && styles.quotaChipSelected]}
                      onPress={() => setInstallments(q.toString())}
                    >
                      <Text style={[styles.quotaChipText, parsedInstallments === q && styles.quotaChipTextSelected]}>
                        {q === 1 ? '1 Cuota (0% Int)' : `${q}x`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Simulador de Cuota */}
                {parsedAmount > 0 && (
                  <View style={styles.quotaSimBox}>
                    <View style={styles.simRow}>
                      <Text style={styles.simLabel}>Cuota Mensual Estimada:</Text>
                      <Text style={styles.simValueHighlight}>{formatCurrency(liveQuota, currency)} / mes</Text>
                    </View>
                    {parsedInstallments > 1 && (
                      <View style={styles.simRow}>
                        <Text style={styles.simLabel}>Total con Intereses ({selectedCard?.interestRateMonthly}% E.M.):</Text>
                        <Text style={styles.simValue}>{formatCurrency(totalProjected, currency)}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Notas opcionales */}
            <Text style={styles.fieldLabel}>Notas (Opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Detalles del comprobante o acuerdo..."
              placeholderTextColor="#64748B"
              value={notes}
              onChangeText={setNotes}
            />

            {/* Botón de Confirmación */}
            <TouchableOpacity style={styles.payBtn} onPress={handlePay} activeOpacity={0.85}>
              <CustomIcon name="CheckCircle2" size={18} color="#FFFFFF" />
              <Text style={styles.payBtnText}>Confirmar Pago de Deuda</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    flex: 1,
  },
  modalContainer: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: Theme.borderRadius.xl,
    borderTopRightRadius: Theme.borderRadius.xl,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 35,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  tag: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: 'bold',
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: Theme.colors.surfaceElevated,
    padding: 6,
    borderRadius: 20,
  },
  debtSummaryCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  debtSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  debtSummaryLabel: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
  },
  debtSummaryValue: {
    color: '#EF4444',
    fontSize: 22,
    fontWeight: 'bold',
  },
  debtInterestText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
  },
  fieldLabel: {
    color: '#CBD5E1',
    fontSize: 12.5,
    fontWeight: 'bold',
    marginBottom: 6,
    marginTop: 8,
  },
  subFieldLabel: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 6,
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8,
  },
  currencySymbol: {
    color: '#818CF8',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    paddingVertical: 10,
  },
  quickAmountsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  quickAmountBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickAmountBtnText: {
    color: '#818CF8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  methodTabs: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
    gap: 4,
  },
  methodTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  methodTabActive: {
    backgroundColor: '#6366F1',
  },
  methodTabText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  methodTabTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  accountSelectionBlock: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardSelectionBlock: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  accountsRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    gap: 5,
    borderWidth: 1,
    borderColor: '#334155',
  },
  accountChipSelected: {
    backgroundColor: Theme.colors.primary,
    borderColor: '#818CF8',
  },
  accountChipText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  accountChipTextSelected: {
    color: '#FFFFFF',
  },
  accountChipBalance: {
    color: '#64748B',
    fontSize: 10.5,
  },
  gmfNoticeBox: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  gmfNoticeText: {
    color: '#FBBF24',
    fontSize: 11,
  },
  quotaRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  quotaChip: {
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quotaChipSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#818CF8',
  },
  quotaChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  quotaChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  quotaSimBox: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  simRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  simLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },
  simValue: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  simValueHighlight: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  payBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
