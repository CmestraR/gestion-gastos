import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CardPurchase, CardInstallment, CreditCard } from '../../types/finance';
import { CardRepository } from '../../database/repositories/cardRepository';
import { useFinancial } from '../../context/FinancialContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';

interface InstallmentAmortizationModalProps {
  visible: boolean;
  purchase: CardPurchase | null;
  card: CreditCard | null;
  onClose: () => void;
}

export const InstallmentAmortizationModal: React.FC<InstallmentAmortizationModalProps> = ({
  visible,
  purchase,
  card,
  onClose,
}) => {
  const { accounts, payCardInstallment, currency } = useFinancial();
  const [installments, setInstallments] = useState<CardInstallment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  useEffect(() => {
    if (visible && purchase) {
      loadInstallments();
      if (accounts.length > 0) {
        setSelectedAccountId(accounts[0].id);
      }
    }
  }, [visible, purchase]);

  const loadInstallments = async () => {
    if (!purchase) return;
    setLoading(true);
    try {
      const list = await CardRepository.getInstallmentsForPurchase(purchase.id);
      setInstallments(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!purchase || !card) return null;

  const totalPaidPrincipal = installments
    .filter((i) => i.isPaid)
    .reduce((sum, i) => sum + i.principalAmount, 0);

  const remainingPrincipal = Math.max(0, purchase.amount - totalPaidPrincipal);

  const handlePayInstallment = (inst: CardInstallment) => {
    Alert.alert(
      'Confirmar Pago de Cuota',
      `¿Deseas registrar el pago de la Cuota #${inst.installmentNumber} por un total de ${formatCurrency(inst.totalAmount, currency)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Pagar Cuota',
          onPress: async () => {
            try {
              await payCardInstallment(
                inst.id,
                purchase.id,
                inst.principalAmount,
                card.id,
                inst.totalAmount,
                selectedAccountId || undefined
              );
              await loadInstallments();
            } catch (e) {
              Alert.alert('Error', 'No se pudo procesar el pago.');
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={styles.modalContainer}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.cardTag}>{card.name} • {card.bankName}</Text>
              <Text style={styles.title}>{purchase.description}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CustomIcon name="X" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Resumen de la Compra */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.summaryLabel}>Monto Inicial</Text>
                <Text style={styles.summaryValue}>{formatCurrency(purchase.amount, currency)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.summaryLabel}>Saldo Pendiente</Text>
                <Text style={[styles.summaryValue, { color: '#F87171' }]}>
                  {formatCurrency(remainingPrincipal, currency)}
                </Text>
              </View>
            </View>

            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressText}>
                  Progreso: {purchase.installmentsPaid} de {purchase.installmentsTotal} cuotas
                </Text>
                <Text style={styles.interestText}>
                  Tasa: {purchase.interestRateMonthly}% E.M.
                </Text>
              </View>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${(purchase.installmentsPaid / purchase.installmentsTotal) * 100}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* Selector de cuenta para pago de cuota */}
          {accounts.length > 0 && (
            <View style={styles.accountSelector}>
              <Text style={styles.accountSelectorLabel}>Pagar cuotas desde:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accList}>
                {accounts.map((acc) => {
                  const isSelected = acc.id === selectedAccountId;
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      style={[styles.accChip, isSelected && styles.accChipSelected]}
                      onPress={() => setSelectedAccountId(acc.id)}
                    >
                      <CustomIcon
                        name={acc.icon || 'Landmark'}
                        size={12}
                        color={isSelected ? '#FFFFFF' : '#94A3B8'}
                      />
                      <Text style={[styles.accChipText, isSelected && styles.accChipTextSelected]}>
                        {acc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Tabla de Amortización */}
          <Text style={styles.sectionHeading}>Tabla de Amortización (Cuotas)</Text>

          {loading ? (
            <ActivityIndicator size="large" color={Theme.colors.primary} style={{ marginVertical: 30 }} />
          ) : (
            <ScrollView style={styles.scheduleList} showsVerticalScrollIndicator={false}>
              {installments.map((inst) => (
                <View key={inst.id} style={[styles.instRow, inst.isPaid && styles.instRowPaid]}>
                  <View style={styles.instLeft}>
                    <View style={[styles.quotaNumberBadge, inst.isPaid && styles.quotaPaidBadge]}>
                      <Text style={styles.quotaNumberText}>#{inst.installmentNumber}</Text>
                    </View>
                    <View>
                      <Text style={styles.instDate}>Vence: {formatDate(inst.dueDate)}</Text>
                      <Text style={styles.instBreakdown}>
                        Cap: {formatCurrency(inst.principalAmount, currency)} | Int: {formatCurrency(inst.interestAmount, currency)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.instRight}>
                    <Text style={styles.instTotal}>{formatCurrency(inst.totalAmount, currency)}</Text>
                    {inst.isPaid ? (
                      <View style={styles.paidBadge}>
                        <CustomIcon name="Check" size={12} color="#10B981" />
                        <Text style={styles.paidText}>Pagada</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.payBtn}
                        onPress={() => handlePayInstallment(inst)}
                      >
                        <Text style={styles.payBtnText}>Pagar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'flex-end',
    margin: 0,
  },
  modalContainer: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: Theme.borderRadius.xl,
    borderTopRightRadius: Theme.borderRadius.xl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 45,
    maxHeight: '90%',
    marginBottom: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTag: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: Theme.colors.surfaceElevated,
    padding: 6,
    borderRadius: 20,
  },
  summaryCard: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  progressContainer: {},
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  interestText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  accountSelector: {
    marginBottom: 14,
  },
  accountSelectorLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginBottom: 6,
    fontWeight: '600',
  },
  accList: {
    flexDirection: 'row',
  },
  accChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    gap: 6,
  },
  accChipSelected: {
    backgroundColor: Theme.colors.primary,
  },
  accChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  accChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sectionHeading: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  scheduleList: {
    maxHeight: 320,
  },
  instRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceCard,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  instRowPaid: {
    opacity: 0.65,
    backgroundColor: '#0F172A',
  },
  instLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  quotaNumberBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  quotaPaidBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  quotaNumberText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  instDate: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  instBreakdown: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1,
  },
  instRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  instTotal: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  paidText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: 'bold',
  },
  payBtn: {
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  payBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
