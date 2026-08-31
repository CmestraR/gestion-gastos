import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import { CreditCard, CardStatementSummary } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { formatCurrency } from '../../utils/formatters';
import { CustomIcon } from '../common/CustomIcon';

interface CardStatementModalProps {
  visible: boolean;
  card: CreditCard | null;
  statement: CardStatementSummary | null;
  onClose: () => void;
}

const MONTH_NAMES_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MONTH_NAMES_FULL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const CardStatementModal: React.FC<CardStatementModalProps> = ({
  visible,
  card,
  statement,
  onClose,
}) => {
  const { accounts, payCreditCard, currency, activePurchases, transactions } = useFinancial();
  const { showSuccess, showWarning, showError } = useAlert();
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');
  const [customPayAmount, setCustomPayAmount] = useState<string>('');
  const [isAbonarSheetOpen, setIsAbonarSheetOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'purchases' | 'payments'>('all');
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(2); // Default to current month (index 2 in 7-month window)

  // Filtrar compras activas en esta tarjeta
  const cardPurchases = useMemo(() => {
    if (!card) return [];
    return activePurchases.filter((p) => p.cardId === card.id);
  }, [activePurchases, card]);

  // Filtrar pagos y abonos reales realizados a esta tarjeta
  const cardPayments = useMemo(() => {
    if (!card) return [];
    return transactions.filter(
      (t) =>
        (t.cardId === card.id || t.description.toLowerCase().includes(card.name.toLowerCase())) &&
        t.type === 'card_payment'
    );
  }, [transactions, card]);

  // Generar 7 meses reales calculados (2 anteriores, actual, 4 futuros)
  const dynamicMonths = useMemo(() => {
    if (!card || !statement) return [];
    const now = new Date();
    const result = [];

    for (let offset = -2; offset <= 4; offset++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const year = targetDate.getFullYear();
      const monthIdx = targetDate.getMonth();
      const labelShort = `${MONTH_NAMES_SHORT[monthIdx]} ${String(year).slice(-2)}`;
      const labelFull = `${MONTH_NAMES_FULL[monthIdx]} de ${year}`;
      const isCurrent = offset === 0;

      // Calcular compras y cuotas que caen en este mes
      let monthlyInstallmentsTotal = 0;
      let estimatedInterest = 0;
      const monthActivePurchases: Array<{
        id: string;
        description: string;
        quotaNumber: number;
        totalQuotas: number;
        amount: number;
        rate: number;
      }> = [];

      cardPurchases.forEach((p) => {
        const startParts = p.firstInstallmentDate.split('-');
        const startYear = parseInt(startParts[0], 10) || year;
        const startMonth = (parseInt(startParts[1], 10) || 1) - 1;

        // Diferencia en meses desde la primera cuota
        const monthDiff = (year - startYear) * 12 + (monthIdx - startMonth);

        if (monthDiff >= 0 && monthDiff < p.installmentsTotal) {
          const quotaNum = monthDiff + 1;
          monthlyInstallmentsTotal += p.monthlyInstallmentAmount;
          // Interés aproximado si la tasa es mayor a 0
          if (p.interestRateMonthly > 0 && p.installmentsTotal > 1) {
            estimatedInterest += p.amount * (p.interestRateMonthly / 100) * 0.5;
          }
          monthActivePurchases.push({
            id: p.id,
            description: p.description,
            quotaNumber: quotaNum,
            totalQuotas: p.installmentsTotal,
            amount: p.monthlyInstallmentAmount,
            rate: p.interestRateMonthly,
          });
        }
      });

      const handlingFee = card.handlingFee || 0;
      const singleQuotaPurchases = isCurrent ? statement.singleQuotaPurchasesTotal : 0;
      const totalToPay = monthlyInstallmentsTotal + singleQuotaPurchases + estimatedInterest + handlingFee;

      // Fechas de corte y pago para este mes
      const cutOffDateStr = `${card.cutOffDay} ${MONTH_NAMES_SHORT[monthIdx].toLowerCase()} ${year}`;
      const paymentMonthIdx = (monthIdx + 1) % 12;
      const paymentYear = monthIdx === 11 ? year + 1 : year;
      const paymentDueStr = `${card.paymentDueDay} ${MONTH_NAMES_SHORT[paymentMonthIdx].toLowerCase()} ${paymentYear}`;

      result.push({
        labelShort,
        labelFull,
        isCurrent,
        totalToPay,
        monthlyInstallmentsTotal,
        singleQuotaPurchases,
        estimatedInterest,
        handlingFee,
        cutOffDateStr,
        paymentDueStr,
        monthActivePurchases,
      });
    }

    return result;
  }, [card, cardPurchases, statement]);

  // Encontrar el monto máximo para escalar las barras de la gráfica con precisión matemática
  const maxMonthlyAmount = useMemo(() => {
    if (dynamicMonths.length === 0) return 1;
    const max = Math.max(...dynamicMonths.map((m) => m.totalToPay), 1);
    return max;
  }, [dynamicMonths]);

  if (!card || !statement) return null;

  const selectedMonth = dynamicMonths[selectedMonthIndex] || dynamicMonths[2] || {
    labelShort: '',
    labelFull: '',
    isCurrent: true,
    totalToPay: 0,
    monthlyInstallmentsTotal: 0,
    singleQuotaPurchases: 0,
    estimatedInterest: 0,
    handlingFee: 0,
    cutOffDateStr: '',
    paymentDueStr: '',
    monthActivePurchases: [],
  };

  const handlePay = async (amount: number, note: string) => {
    if (!selectedAccountId) {
      showWarning('Cuenta Requerida', 'Selecciona una cuenta de origen con saldo disponible.');
      return;
    }

    const selectedAcc = accounts.find((a) => a.id === selectedAccountId);
    if (selectedAcc && selectedAcc.balance < amount) {
      showWarning(
        'Saldo Insuficiente',
        `Tu cuenta "${selectedAcc.name}" solo tiene ${formatCurrency(selectedAcc.balance, currency)}.`
      );
      return;
    }

    try {
      await payCreditCard(card.id, amount, selectedAccountId, note);
      showSuccess(
        '¡Abono Realizado!',
        `Se abonaron ${formatCurrency(amount, currency)} a ${card.name}. Tu cupo disponible ha sido liberado exitosamente.`
      );
      setIsAbonarSheetOpen(false);
      setCustomPayAmount('');
    } catch (e) {
      showError('Error', 'No se pudo procesar el abono a la tarjeta.');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        {/* Fondo táctil para cerrar */}
        <TouchableOpacity
          style={styles.backdropDismiss}
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Contenedor Principal de la Tarjeta Nu Bank */}
        <View style={styles.modalContainer}>
          {/* Header Superior Estilo Nu Bank */}
          <View style={styles.topHeader}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn}>
              <CustomIcon name="ChevronLeft" size={24} color="#FFFFFF" />
              <Text style={styles.backText}>Extractos</Text>
            </TouchableOpacity>
            <View style={styles.cardBadge}>
              <Text style={styles.cardBadgeText}>{card.name} • {card.bankName}</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollContent}>
            {/* Gráfica de Barras Real y Dinámica Estilo Nu */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitleHeader}>Proyección de Pagos ({selectedMonth.labelFull})</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chartScroll}
              >
                {dynamicMonths.map((m, idx) => {
                  const isSelected = selectedMonthIndex === idx;
                  // Altura calculada matemáticamente en base al monto real
                  const barHeight = m.totalToPay > 0
                    ? Math.max(18, (m.totalToPay / maxMonthlyAmount) * 85)
                    : 12;

                  return (
                    <TouchableOpacity
                      key={m.labelShort}
                      onPress={() => setSelectedMonthIndex(idx)}
                      style={styles.barColumn}
                      activeOpacity={0.7}
                    >
                      <View style={styles.barSlot}>
                        <View
                          style={[
                            styles.barVisual,
                            { height: barHeight },
                            isSelected && styles.barVisualSelected,
                            m.totalToPay === 0 && styles.barVisualZero,
                          ]}
                        />
                      </View>
                      <Text style={[styles.barLabel, isSelected && styles.barLabelSelected]}>
                        {m.labelShort}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Alerta de Inconsistencia Financiera si aplica */}
            {statement.hasInconsistency && (
              <View style={styles.inconsistencyBanner}>
                <CustomIcon name="AlertTriangle" size={16} color="#F59E0B" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.inconsistencyTitle}>Revisión Contable Requerida</Text>
                  <Text style={styles.inconsistencyText}>{statement.inconsistencyReason}</Text>
                </View>
              </View>
            )}

            {/* Resumen de los 3 Saldos Contables Oficiales */}
            <View style={styles.threeBalancesCard}>
              <Text style={styles.threeBalancesHeader}>Estado Contable de Deuda</Text>
              
              <View style={styles.balanceRow}>
                <View>
                  <Text style={styles.balanceLabel}>1. Deuda Total Actual</Text>
                  <Text style={styles.balanceSub}>Capital ($ {formatCurrency(statement.principalDebt || statement.usedCredit, currency)}) + Cargos ($ {formatCurrency(statement.nonPrincipalDebt || 0, currency)})</Text>
                </View>
                <Text style={styles.balanceValueRed}>{formatCurrency(statement.totalCurrentDebt || statement.usedCredit, currency)}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.balanceRow}>
                <View>
                  <Text style={styles.balanceLabel}>2. Saldo Facturado Pendiente</Text>
                  <Text style={styles.balanceSub}>Extracto al corte ({statement.statementStatus || 'open'})</Text>
                </View>
                <Text style={styles.balanceValueAmber}>{formatCurrency(statement.billedStatementDebtRemaining, currency)}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.balanceRow}>
                <View>
                  <Text style={styles.balanceLabel}>3. Deuda No Facturada</Text>
                  <Text style={styles.balanceSub}>Consumos y cargos posteriores al corte</Text>
                </View>
                <Text style={styles.balanceValueBlue}>{formatCurrency(statement.unbilledDebt, currency)}</Text>
              </View>
            </View>

            {/* Resumen del Mes Seleccionado en la Gráfica */}
            <View style={styles.nuSummaryHero}>
              <Text style={styles.nuSubheading}>Este es tu pago mínimo estimado</Text>
              <Text style={styles.nuMainAmount}>
                {formatCurrency(selectedMonth.totalToPay, currency)}
              </Text>

              <View style={styles.nuDetailsList}>
                <View style={styles.nuDetailRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.nuDetailText}>
                    Deuda total al corte • <Text style={styles.boldText}>{formatCurrency(statement.usedCredit, currency)}</Text>
                  </Text>
                </View>
                <View style={styles.nuDetailRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.nuDetailText}>
                    Fecha límite de pago • <Text style={styles.boldText}>{selectedMonth.paymentDueStr}</Text>
                  </Text>
                </View>
                <View style={styles.nuDetailRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.nuDetailText}>
                    Fecha de corte • <Text style={styles.boldText}>{selectedMonth.cutOffDateStr}</Text>
                  </Text>
                </View>
              </View>
            </View>

            {/* Desglose del Periodo Seleccionado */}
            <View style={styles.breakdownCard}>
              <Text style={styles.breakdownTitle}>Desglose de {selectedMonth.labelFull}</Text>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownItemText}>Cuotas activas del mes</Text>
                <Text style={styles.breakdownItemVal}>
                  {formatCurrency(selectedMonth.monthlyInstallmentsTotal, currency)}
                </Text>
              </View>
              {selectedMonth.singleQuotaPurchases > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownItemText}>Compras a 1 cuota (0% int.)</Text>
                  <Text style={styles.breakdownItemVal}>
                    {formatCurrency(selectedMonth.singleQuotaPurchases, currency)}
                  </Text>
                </View>
              )}
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownItemText}>Intereses corrientes est.</Text>
                <Text style={styles.breakdownItemVal}>
                  {formatCurrency(selectedMonth.estimatedInterest, currency)}
                </Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownItemText}>Cuota de manejo</Text>
                <Text style={styles.breakdownItemVal}>
                  {formatCurrency(selectedMonth.handlingFee, currency)}
                </Text>
              </View>
            </View>

            {/* Filtros de Movimientos */}
            <View style={styles.filterPillsRow}>
              <TouchableOpacity
                style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
                onPress={() => setActiveFilter('all')}
              >
                <Text style={[styles.filterChipText, activeFilter === 'all' && styles.filterChipTextActive]}>
                  Todos ({selectedMonth.monthActivePurchases.length + (selectedMonth.isCurrent ? cardPayments.length : 0)})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, activeFilter === 'purchases' && styles.filterChipActive]}
                onPress={() => setActiveFilter('purchases')}
              >
                <Text style={[styles.filterChipText, activeFilter === 'purchases' && styles.filterChipTextActive]}>
                  Cuotas del Mes ({selectedMonth.monthActivePurchases.length})
                </Text>
              </TouchableOpacity>
              {selectedMonth.isCurrent && cardPayments.length > 0 && (
                <TouchableOpacity
                  style={[styles.filterChip, activeFilter === 'payments' && styles.filterChipActive]}
                  onPress={() => setActiveFilter('payments')}
                >
                  <Text style={[styles.filterChipText, activeFilter === 'payments' && styles.filterChipTextActive]}>
                    Abonos ({cardPayments.length})
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Lista de Cuotas y Movimientos correspondientes a este mes */}
            <View style={styles.movementsContainer}>
              {selectedMonth.monthActivePurchases.length === 0 && (!selectedMonth.isCurrent || cardPayments.length === 0) ? (
                <View style={styles.emptyMovements}>
                  <CustomIcon name="CheckCircle2" size={28} color="#10B981" />
                  <Text style={styles.emptyMovementsText}>
                    ¡Sin cuotas pendientes para {selectedMonth.labelFull}!
                  </Text>
                </View>
              ) : (
                <>
                  {/* Cuotas de compras activas para este mes (Gasto/Consumo) */}
                  {(activeFilter === 'all' || activeFilter === 'purchases') &&
                    selectedMonth.monthActivePurchases.map((p) => (
                      <View key={p.id} style={styles.movementItem}>
                        <View style={styles.movementLeft}>
                          <View style={styles.quotaBadge}>
                            <Text style={styles.quotaBadgeText}>Cuota {p.quotaNumber}/{p.totalQuotas}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.movementTitle}>{p.description}</Text>
                            <Text style={styles.movementSub}>
                              Valor cuota mensual • {p.rate > 0 ? `Tasa: ${p.rate}% E.M.` : '0% interés'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.movementAmount}>{formatCurrency(p.amount, currency)}</Text>
                      </View>
                    ))}

                  {/* Abonos y pagos reales realizados a la tarjeta en el mes actual */}
                  {(activeFilter === 'all' || activeFilter === 'payments') &&
                    selectedMonth.isCurrent &&
                    cardPayments.map((t) => (
                      <View key={t.id} style={[styles.movementItem, { borderColor: 'rgba(16, 185, 129, 0.35)', borderWidth: 1 }]}>
                        <View style={styles.movementLeft}>
                          <View style={[styles.quotaBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                            <Text style={[styles.quotaBadgeText, { color: '#34D399' }]}>Abono</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.movementTitle, { color: '#34D399' }]}>
                              {t.description}
                            </Text>
                            <Text style={styles.movementSub}>{t.notes || 'Abono realizado a la tarjeta'}</Text>
                          </View>
                        </View>
                        <Text style={[styles.movementAmount, { color: '#34D399' }]}>
                          - {formatCurrency(t.amount, currency)}
                        </Text>
                      </View>
                    ))}
                </>
              )}
            </View>

            {/* Pagar o Abonar Drawer Desplegable */}
            {isAbonarSheetOpen && (
              <View style={styles.paySection}>
                <Text style={styles.paySectionTitle}>Pagar con la cuenta:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accList}>
                  {accounts.map((acc) => {
                    const isSelected = acc.id === selectedAccountId;
                    return (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.accChip, isSelected && styles.accChipSelected]}
                        onPress={() => setSelectedAccountId(acc.id)}
                      >
                        <CustomIcon name="Landmark" size={13} color={isSelected ? '#FFFFFF' : '#94A3B8'} />
                        <Text style={[styles.accChipText, isSelected && styles.accChipTextSelected]}>
                          {acc.name} ({formatCurrency(acc.balance, currency)})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <View style={styles.quickPayButtons}>
                  <TouchableOpacity
                    style={styles.payOptionBtn}
                    onPress={() => handlePay(selectedMonth.totalToPay, `Pago Total ${selectedMonth.labelShort}`)}
                  >
                    <Text style={styles.payOptionBtnLabel}>Pagar Total Facturado</Text>
                    <Text style={styles.payOptionBtnAmount}>{formatCurrency(selectedMonth.totalToPay, currency)}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.payOptionBtn, { backgroundColor: '#1E1B4B', borderColor: '#4338CA' }]}
                    onPress={() => handlePay(statement.minimumPayment, 'Pago Mínimo')}
                  >
                    <Text style={styles.payOptionBtnLabel}>Pagar Mínimo</Text>
                    <Text style={styles.payOptionBtnAmount}>{formatCurrency(statement.minimumPayment, currency)}</Text>
                  </TouchableOpacity>
                </View>

                {/* Abono Personalizado */}
                <View style={styles.customPayRow}>
                  <TextInput
                    style={styles.customInput}
                    placeholder="Otro valor de abono..."
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                    value={customPayAmount}
                    onChangeText={setCustomPayAmount}
                  />
                  <TouchableOpacity
                    style={styles.customSubmitBtn}
                    onPress={() => {
                      const val = parseFloat(customPayAmount);
                      if (!val || val <= 0) {
                        Alert.alert('Valor Inválido', 'Ingresa un monto válido.');
                        return;
                      }
                      handlePay(val, 'Abono Personalizado');
                    }}
                  >
                    <Text style={styles.customSubmitBtnText}>Abonar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* Botón Flotante Nu Bank al fondo sin ningún espacio */}
          <View style={styles.stickyBottomBar}>
            <TouchableOpacity
              style={styles.nuAbonarBtn}
              onPress={() => setIsAbonarSheetOpen(!isAbonarSheetOpen)}
              activeOpacity={0.85}
            >
              <Text style={styles.nuAbonarBtnText}>
                {isAbonarSheetOpen ? 'Cerrar Opciones de Pago' : 'Abonar'}
              </Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '92%',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'android' ? 24 : 16,
    overflow: 'hidden',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardBadge: {
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderWidth: 1,
    borderColor: '#7C3AED',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cardBadgeText: {
    color: '#C4B5FD',
    fontSize: 11,
    fontWeight: '700',
  },
  scrollContent: {
    flex: 1,
  },
  chartCard: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chartTitleHeader: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chartScroll: {
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    gap: 12,
  },
  barColumn: {
    alignItems: 'center',
    width: 40,
  },
  barSlot: {
    height: 90,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
  },
  barVisual: {
    width: 32,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    borderRadius: 6,
  },
  barVisualSelected: {
    backgroundColor: '#8B5CF6',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
    elevation: 6,
  },
  barVisualZero: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
  },
  barLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 6,
  },
  barLabelSelected: {
    color: '#FFFFFF',
  },
  nuSummaryHero: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  nuSubheading: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  nuMainAmount: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 14,
    letterSpacing: 0.5,
  },
  nuDetailsList: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 10,
  },
  nuDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
    marginRight: 8,
  },
  nuDetailText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  boldText: {
    color: '#F1F5F9',
    fontWeight: '600',
  },
  breakdownCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  breakdownTitle: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  breakdownItemText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  breakdownItemVal: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#1E293B',
  },
  filterChipActive: {
    backgroundColor: '#7C3AED',
  },
  filterChipText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  movementsContainer: {
    gap: 10,
    marginBottom: 14,
  },
  emptyMovements: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
    backgroundColor: '#1E293B',
    borderRadius: 14,
  },
  emptyMovementsText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  movementItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 12,
    borderRadius: 12,
  },
  movementLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  quotaBadge: {
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  quotaBadgeText: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: '700',
  },
  movementTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  movementSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  movementAmount: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stickyBottomBar: {
    paddingTop: 10,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  nuAbonarBtn: {
    backgroundColor: '#8B5CF6',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  nuAbonarBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  paySection: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  paySectionTitle: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  accList: {
    marginBottom: 14,
  },
  accChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F172A',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  accChipSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#818CF8',
  },
  accChipText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  accChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  quickPayButtons: {
    gap: 8,
    marginBottom: 12,
  },
  payOptionBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#065F46',
    borderWidth: 1,
    borderColor: '#10B981',
    padding: 12,
    borderRadius: 12,
  },
  payOptionBtnLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  payOptionBtnAmount: {
    color: '#6EE7B7',
    fontSize: 14,
    fontWeight: 'bold',
  },
  customPayRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customInput: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
  },
  customSubmitBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 10,
  },
  customSubmitBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  inconsistencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  inconsistencyTitle: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  inconsistencyText: {
    color: '#CBD5E1',
    fontSize: 11,
    lineHeight: 15,
  },
  threeBalancesCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  threeBalancesHeader: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  balanceLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  balanceSub: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 1,
  },
  balanceValueRed: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: 'bold',
  },
  balanceValueAmber: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: 'bold',
  },
  balanceValueBlue: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 8,
  },
});
