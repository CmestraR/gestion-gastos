import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Dimensions,
} from 'react-native';
import { CreditCard, CardStatementSummary } from '../../types/finance.ts';
import { useFinancial } from '../../context/FinancialContext.tsx';
import { useAlert } from '../../context/AlertContext.tsx';
import { formatCurrency, formatInputNumber, parseInputNumber } from '../../utils/formatters.ts';
import { getIssuerPolicy } from '../../utils/issuerPolicies/index.ts';
import { Theme } from '../common/Theme.ts';
import { CustomIcon } from '../common/CustomIcon.ts';

interface PayCardModalProps {
  visible: boolean;
  card: CreditCard | null;
  statementSummary?: CardStatementSummary | null;
  onClose: () => void;
}

type PaymentOption = 'minimum' | 'statement' | 'total_debt' | 'custom';

export const PayCardModal: React.FC<PayCardModalProps> = ({
  visible,
  card,
  statementSummary,
  onClose,
}) => {
  const { accounts, payCreditCard, currency } = useFinancial();
  const { showSuccess, showWarning, showError } = useAlert();

  const [paymentOption, setPaymentOption] = useState<PaymentOption>('statement');
  const [customAmount, setCustomAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');

  // Cuentas con saldo disponible
  const liquidAccounts = useMemo(() => {
    return accounts.filter((a) => a.type !== 'debt' && !a.isArchived);
  }, [accounts]);

  useEffect(() => {
    if (liquidAccounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(liquidAccounts[0].id);
    }
  }, [liquidAccounts, selectedAccountId]);

  useEffect(() => {
    if (visible && statementSummary) {
      if (statementSummary.billedStatementDebtRemaining > 0) {
        setPaymentOption('statement');
      } else if (statementSummary.totalCurrentDebt > 0) {
        setPaymentOption('total_debt');
      } else {
        setPaymentOption('custom');
      }
      setCustomAmount('');
    }
  }, [visible, statementSummary]);

  const minPayment = statementSummary?.minimumPaymentRemaining || 0;
  const statementBalance = statementSummary?.billedStatementDebtRemaining || 0;
  const totalDebt = statementSummary?.totalCurrentDebt || (card ? card.creditLimit - card.availableLimit : 0);

  // Calcular el monto a pagar según la opción seleccionada
  const selectedAmount = useMemo(() => {
    if (paymentOption === 'minimum') return minPayment;
    if (paymentOption === 'statement') return statementBalance > 0 ? statementBalance : totalDebt;
    if (paymentOption === 'total_debt') return totalDebt;
    return parseInputNumber(customAmount);
  }, [paymentOption, minPayment, statementBalance, totalDebt, customAmount]);

  // Previsualización de la imputación contable según la política del emisor
  const allocationPreview = useMemo(() => {
    if (!card || selectedAmount <= 0) return null;

    const policy = getIssuerPolicy(card.issuerId);
    const context = {
      creditLimit: card.creditLimit,
      availableLimit: card.availableLimit,
      totalStatementBalance: statementBalance > 0 ? statementBalance : totalDebt,
      statementBalancePaid: (statementSummary?.totalStatementBalanceOriginal || 0) - statementBalance,
      minimumPaymentOriginal: statementSummary?.minimumPaymentOriginal || 0,
      minimumPaymentPaid: (statementSummary?.minimumPaymentOriginal || 0) - minPayment,
      taxesAndFees: 0,
      handlingFee: card.handlingFee || 0,
      collectionFee: 0,
      lateInterest: 0,
      currentInterest: 0,
      principalTotal: totalDebt,
      unbilledDebt: statementSummary?.unbilledDebt || 0,
    };

    try {
      return policy.allocatePayment(selectedAmount, context);
    } catch {
      return null;
    }
  }, [card, selectedAmount, statementBalance, totalDebt, statementSummary, minPayment]);

  const handlePay = async () => {
    if (!card) return;

    if (!selectedAccountId) {
      showWarning('Cuenta Requerida', 'Selecciona una cuenta de origen para realizar el pago.');
      return;
    }

    if (selectedAmount <= 0) {
      showWarning('Monto Inválido', 'El monto a abonar debe ser mayor a cero.');
      return;
    }

    if (selectedAmount > totalDebt) {
      showWarning(
        'Monto Excede Deuda',
        `El monto a pagar (${formatCurrency(selectedAmount, currency)}) no puede superar la deuda total actual (${formatCurrency(totalDebt, currency)}).`
      );
      return;
    }

    const originAccount = accounts.find((a) => a.id === selectedAccountId);
    if (originAccount && originAccount.balance < selectedAmount) {
      showWarning(
        'Saldo Insuficiente',
        `La cuenta ${originAccount.name} no cuenta con fondos suficientes (${formatCurrency(originAccount.balance, currency)}).`
      );
      return;
    }

    try {
      await payCreditCard(card.id, selectedAmount, selectedAccountId);
      showSuccess(
        '¡Pago Realizado con Éxito!',
        `Se debitaron ${formatCurrency(selectedAmount, currency)} y se liberaron ${formatCurrency(allocationPreview?.principalApplied || selectedAmount, currency)} de cupo disponible.`
      );
      onClose();
    } catch (e: any) {
      showError('Error en el Pago', e.message || 'No se pudo procesar el pago.');
    }
  };

  if (!card) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.backdropDismiss} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.tag}>GESTIÓN DE PAGOS</Text>
              <Text style={styles.title}>Pagar {card.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CustomIcon name="X" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Resumen de los 3 Saldos */}
            <View style={styles.debtCard}>
              <View style={styles.debtHeader}>
                <Text style={styles.debtLabel}>Deuda Total Actual</Text>
                <Text style={styles.debtAmount}>{formatCurrency(totalDebt, currency)}</Text>
              </View>
              <View style={styles.debtRow}>
                <View style={styles.debtSubCol}>
                  <Text style={styles.debtSubLabel}>Facturado Pendiente</Text>
                  <Text style={styles.debtSubValue}>{formatCurrency(statementBalance, currency)}</Text>
                </View>
                <View style={styles.debtSubCol}>
                  <Text style={styles.debtSubLabel}>No Facturado (Post-Corte)</Text>
                  <Text style={styles.debtSubValue}>
                    {formatCurrency(statementSummary?.unbilledDebt || 0, currency)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Opciones de Pago */}
            <Text style={styles.sectionLabel}>Selecciona el Valor a Pagar</Text>
            <View style={styles.optionsGrid}>
              {/* Opción 1: Pago Mínimo */}
              {minPayment > 0 && (
                <TouchableOpacity
                  style={[styles.optionCard, paymentOption === 'minimum' && styles.optionCardActive]}
                  onPress={() => setPaymentOption('minimum')}
                >
                  <View style={styles.optionHeader}>
                    <Text style={[styles.optionTitle, paymentOption === 'minimum' && styles.optionTitleActive]}>
                      Pago Mínimo
                    </Text>
                    <CustomIcon
                      name={paymentOption === 'minimum' ? 'CheckCircle2' : 'Circle'}
                      size={16}
                      color={paymentOption === 'minimum' ? '#818CF8' : '#64748B'}
                    />
                  </View>
                  <Text style={[styles.optionValue, paymentOption === 'minimum' && styles.optionValueActive]}>
                    {formatCurrency(minPayment, currency)}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Opción 2: Pago Total del Extracto */}
              {statementBalance > 0 && (
                <TouchableOpacity
                  style={[styles.optionCard, paymentOption === 'statement' && styles.optionCardActive]}
                  onPress={() => setPaymentOption('statement')}
                >
                  <View style={styles.optionHeader}>
                    <Text style={[styles.optionTitle, paymentOption === 'statement' && styles.optionTitleActive]}>
                      Total Extracto
                    </Text>
                    <CustomIcon
                      name={paymentOption === 'statement' ? 'CheckCircle2' : 'Circle'}
                      size={16}
                      color={paymentOption === 'statement' ? '#818CF8' : '#64748B'}
                    />
                  </View>
                  <Text style={[styles.optionValue, paymentOption === 'statement' && styles.optionValueActive]}>
                    {formatCurrency(statementBalance, currency)}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Opción 3: Total Deuda */}
              <TouchableOpacity
                style={[styles.optionCard, paymentOption === 'total_debt' && styles.optionCardActive]}
                onPress={() => setPaymentOption('total_debt')}
              >
                <View style={styles.optionHeader}>
                  <Text style={[styles.optionTitle, paymentOption === 'total_debt' && styles.optionTitleActive]}>
                    Deuda Total
                  </Text>
                  <CustomIcon
                    name={paymentOption === 'total_debt' ? 'CheckCircle2' : 'Circle'}
                    size={16}
                    color={paymentOption === 'total_debt' ? '#818CF8' : '#64748B'}
                  />
                </View>
                <Text style={[styles.optionValue, paymentOption === 'total_debt' && styles.optionValueActive]}>
                  {formatCurrency(totalDebt, currency)}
                </Text>
              </TouchableOpacity>

              {/* Opción 4: Otro Valor */}
              <TouchableOpacity
                style={[styles.optionCard, paymentOption === 'custom' && styles.optionCardActive]}
                onPress={() => setPaymentOption('custom')}
              >
                <View style={styles.optionHeader}>
                  <Text style={[styles.optionTitle, paymentOption === 'custom' && styles.optionTitleActive]}>
                    Otro Valor
                  </Text>
                  <CustomIcon
                    name={paymentOption === 'custom' ? 'CheckCircle2' : 'Circle'}
                    size={16}
                    color={paymentOption === 'custom' ? '#818CF8' : '#64748B'}
                  />
                </View>
                <Text style={[styles.optionValue, paymentOption === 'custom' && styles.optionValueActive]}>
                  {customAmount ? `$${customAmount}` : 'Digitar monto'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Input personalizado si selecciona Otro Valor */}
            {paymentOption === 'custom' && (
              <View style={styles.customInputBox}>
                <Text style={styles.inputLabel}>Monto Personalizado a Abonar</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  value={customAmount}
                  onChangeText={(v) => setCustomAmount(formatInputNumber(v))}
                />
              </View>
            )}

            {/* Cuenta de Origen */}
            <Text style={styles.sectionLabel}>Cuenta de Origen (Débito)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsRow}>
              {liquidAccounts.map((acc) => {
                const isSelected = selectedAccountId === acc.id;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.accountChip, isSelected && styles.accountChipSelected]}
                    onPress={() => setSelectedAccountId(acc.id)}
                  >
                    <Text style={[styles.accChipName, isSelected && styles.accChipTextSelected]}>
                      {acc.name}
                    </Text>
                    <Text style={[styles.accChipBal, isSelected && styles.accChipTextSelected]}>
                      {formatCurrency(acc.balance, currency)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Desglose Contable e Imputación de Pagos (Payment Allocation Preview) */}
            {allocationPreview && (
              <View style={styles.previewBox}>
                <View style={styles.previewHeader}>
                  <CustomIcon name="Sparkles" size={14} color="#818CF8" />
                  <Text style={styles.previewTitle}>
                    Imputación Contable ({getIssuerPolicy(card.issuerId).issuerName})
                  </Text>
                  {getIssuerPolicy(card.issuerId).isEstimated && (
                    <View style={styles.estimatedBadge}>
                      <Text style={styles.estimatedBadgeText}>ESTIMADA</Text>
                    </View>
                  )}
                </View>

                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Abono a Capital (Libera Cupo):</Text>
                  <Text style={[styles.previewValue, { color: '#10B981', fontWeight: 'bold' }]}>
                    +{formatCurrency(allocationPreview.principalApplied, currency)}
                  </Text>
                </View>

                {allocationPreview.collectionFeeApplied > 0 && (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Gastos de Cobranza:</Text>
                    <Text style={[styles.previewValue, { color: '#EF4444' }]}>
                      {formatCurrency(allocationPreview.collectionFeeApplied, currency)}
                    </Text>
                  </View>
                )}

                {(allocationPreview.currentInterestApplied > 0 || allocationPreview.lateInterestApplied > 0) && (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Intereses Cubiertos:</Text>
                    <Text style={[styles.previewValue, { color: '#F59E0B' }]}>
                      {formatCurrency(
                        allocationPreview.currentInterestApplied + allocationPreview.lateInterestApplied,
                        currency
                      )}
                    </Text>
                  </View>
                )}

                {(allocationPreview.handlingFeeApplied > 0 || allocationPreview.taxesAndFeesApplied > 0) && (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Cargos / Comisiones / Impuestos:</Text>
                    <Text style={[styles.previewValue, { color: '#94A3B8' }]}>
                      {formatCurrency(
                        allocationPreview.handlingFeeApplied + allocationPreview.taxesAndFeesApplied,
                        currency
                      )}
                    </Text>
                  </View>
                )}

                {allocationPreview.unbilledApplied > 0 && (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Aplicado a Deuda No Facturada:</Text>
                    <Text style={[styles.previewValue, { color: '#38BDF8' }]}>
                      {formatCurrency(allocationPreview.unbilledApplied, currency)}
                    </Text>
                  </View>
                )}

                <View style={styles.divider} />

                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Nuevo Cupo Disponible:</Text>
                  <Text style={[styles.previewValue, { color: '#FFFFFF', fontWeight: 'bold' }]}>
                    {formatCurrency(allocationPreview.resultingAvailableLimit, currency)}
                  </Text>
                </View>
              </View>
            )}

            {/* Botón Pagar */}
            <TouchableOpacity style={styles.payButton} onPress={handlePay} activeOpacity={0.8}>
              <CustomIcon name="CheckCircle2" size={18} color="#FFFFFF" />
              <Text style={styles.payButtonText}>
                Confirmar Pago de {formatCurrency(selectedAmount, currency)}
              </Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    backgroundColor: Theme.colors.surfaceCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: Dimensions.get('window').height * 0.9,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tag: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Theme.colors.surfaceElevated,
  },
  debtCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  debtHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  debtLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  debtAmount: {
    color: '#F87171',
    fontSize: 20,
    fontWeight: 'bold',
  },
  debtRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10,
    gap: 12,
  },
  debtSubCol: {
    flex: 1,
  },
  debtSubLabel: {
    color: '#64748B',
    fontSize: 10,
  },
  debtSubValue: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  sectionLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  optionCard: {
    width: '48%',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  optionCardActive: {
    borderColor: '#818CF8',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  optionTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  optionTitleActive: {
    color: '#818CF8',
  },
  optionValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  optionValueActive: {
    color: '#818CF8',
  },
  customInputBox: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Theme.colors.surfaceElevated,
    color: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  accountsRow: {
    marginBottom: 16,
  },
  accountChip: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  accountChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  accChipName: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  accChipBal: {
    color: '#10B981',
    fontSize: 11,
    marginTop: 2,
  },
  accChipTextSelected: {
    color: '#818CF8',
  },
  previewBox: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  previewTitle: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  estimatedBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  estimatedBadgeText: {
    color: '#F59E0B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3,
  },
  previewLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  previewValue: {
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 8,
  },
  payButton: {
    backgroundColor: Theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  payButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
