import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { Transaction, CardPurchase, TransactionType } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { calculateMonthlyQuota, generateAmortizationSchedule } from '../../utils/financialMath';
import { formatCurrency, formatInputNumber, parseInputNumber } from '../../utils/formatters';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';
import { ParsedBankMessage } from '../../utils/bankNotificationParser';
import { predictCategory } from '../../utils/aiCategorizer';

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  defaultType?: 'expense' | 'income' | 'card_purchase' | 'transfer';
  prefillData?: Partial<ParsedBankMessage> | null;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  visible,
  onClose,
  defaultType = 'expense',
  prefillData,
}) => {
  const {
    accounts,
    creditCards,
    categories,
    addTransaction,
    addCardPurchase,
    currency,
  } = useFinancial();
  const { showSuccess, showWarning, showError } = useAlert();

  const [activeTab, setActiveTab] = useState<'expense' | 'income' | 'card_purchase' | 'transfer'>(defaultType);

  // Campos comunes
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    categories.find((c) => c.type === 'expense')?.id || 'cat-food'
  );
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
  const [selectedToAccountId, setSelectedToAccountId] = useState(accounts[1]?.id || '');

  // Campos de tarjeta
  const [selectedCardId, setSelectedCardId] = useState(creditCards[0]?.id || '');
  const [installments, setInstallments] = useState('1');
  const [isZeroInterestPromo, setIsZeroInterestPromo] = useState(false);
  const [alreadyPaidQuotas, setAlreadyPaidQuotas] = useState('0');

  // Auto-llenado si viene de detección de notificación bancaria
  useEffect(() => {
    if (prefillData) {
      if (prefillData.amount) {
        setAmount(formatInputNumber(prefillData.amount.toString()));
      }
      if (prefillData.description) {
        setDescription(prefillData.description);
        const predicted = predictCategory(prefillData.description, categories, prefillData.type === 'income' ? 'income' : 'expense');
        if (predicted) {
          setSelectedCategoryId(predicted.id);
        }
      }
      if (prefillData.type && prefillData.type !== 'card_payment') {
        setActiveTab(prefillData.type);
      }

      // Buscar si coincide con alguna tarjeta o cuenta por nombre de banco
      if (prefillData.bankName) {
        const foundCard = creditCards.find(
          (c) => c.bankName.toLowerCase().includes(prefillData.bankName!.toLowerCase()) ||
                 c.name.toLowerCase().includes(prefillData.bankName!.toLowerCase())
        );
        if (foundCard) {
          setSelectedCardId(foundCard.id);
        }

        const foundAcc = accounts.find(
          (a) => a.bankName.toLowerCase().includes(prefillData.bankName!.toLowerCase()) ||
                 a.name.toLowerCase().includes(prefillData.bankName!.toLowerCase())
        );
        if (foundAcc) {
          setSelectedAccountId(foundAcc.id);
        }
      }
    }
  }, [prefillData, creditCards, accounts]);

  const selectedCard = creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
  const parsedAmount = parseInputNumber(amount);
  const parsedInstallments = parseInt(installments, 10) || 1;

  // Si es a 1 cuota o está activada la promo 0% interés, la tasa es 0
  const effectiveMonthlyRate = (parsedInstallments === 1 || isZeroInterestPromo)
    ? 0
    : (selectedCard?.interestRateMonthly || 0);

  // Cálculo en vivo de cuota mensual
  const liveMonthlyQuota = calculateMonthlyQuota(parsedAmount, effectiveMonthlyRate, parsedInstallments);
  const totalProjected = parsedInstallments > 1 ? liveMonthlyQuota * parsedInstallments : parsedAmount;
  const totalInterest = Math.max(0, totalProjected - parsedAmount);

  const filteredCategories = categories.filter((c) => {
    if (activeTab === 'income') return c.type === 'income';
    return c.type === 'expense';
  });

  const handleSave = async () => {
    if (parsedAmount <= 0) {
      showWarning('Monto Inválido', 'Ingresa un valor mayor a cero.');
      return;
    }
    if (!description.trim()) {
      showWarning('Descripción Requerida', 'Por favor escribe en qué consistió el movimiento.');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

    try {
      if (activeTab === 'card_purchase') {
        // Compra con Tarjeta de Crédito
        if (!selectedCard) {
          showWarning('Tarjeta Requerida', 'Debes registrar al menos una tarjeta de crédito primero.');
          return;
        }

        const parsedPaid = Math.min(parsedInstallments - 1, Math.max(0, parseInt(alreadyPaidQuotas, 10) || 0));

        // Calcular la fecha de inicio según las cuotas ya pagadas
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - parsedPaid);
        const startDateStr = startDate.toISOString().split('T')[0];

        const purchaseId = `purch-${Date.now()}`;
        const newPurchase: CardPurchase = {
          id: purchaseId,
          cardId: selectedCard.id,
          description: description.trim(),
          categoryId: selectedCategoryId,
          amount: parsedAmount,
          installmentsTotal: parsedInstallments,
          installmentsPaid: parsedPaid,
          monthlyInstallmentAmount: liveMonthlyQuota,
          interestRateMonthly: effectiveMonthlyRate,
          firstInstallmentDate: startDateStr,
          status: parsedPaid >= parsedInstallments ? 'completed' : 'active',
          createdAt: startDateStr,
        };

        const schedule = generateAmortizationSchedule(
          purchaseId,
          parsedAmount,
          effectiveMonthlyRate,
          parsedInstallments,
          startDate,
          parsedPaid
        );

        await addCardPurchase(newPurchase, schedule);
        const promoText = isZeroInterestPromo && parsedInstallments > 1 ? ' (Promoción 0% Interés)' : '';
        const historyText = parsedPaid > 0 ? ` con ${parsedPaid} cuotas ya pagadas` : '';
        showSuccess('¡Compra Registrada!', `Se registraron ${parsedInstallments} cuotas en ${selectedCard.name}${promoText}${historyText}.`);
      } else if (activeTab === 'transfer') {
        // Transferencia entre cuentas (ej. Bancolombia a Nu)
        if (!selectedAccountId || !selectedToAccountId || selectedAccountId === selectedToAccountId) {
          showWarning('Cuentas Inválidas', 'Selecciona dos cuentas diferentes para la transferencia.');
          return;
        }

        const sourceAcc = accounts.find((a) => a.id === selectedAccountId);
        const targetAcc = accounts.find((a) => a.id === selectedToAccountId);

        const newTx: Transaction = {
          id: `tx-${Date.now()}`,
          accountId: selectedAccountId,
          toAccountId: selectedToAccountId,
          type: 'transfer',
          amount: parsedAmount,
          categoryId: 'cat-financial',
          description: description.trim() || `Traspaso de ${sourceAcc?.name} a ${targetAcc?.name}`,
          notes: notes.trim() || undefined,
          date: todayStr,
          createdAt: nowIso,
        };

        await addTransaction(newTx);
        showSuccess('¡Transferencia Registrada!', `Se transfirieron ${formatCurrency(parsedAmount, currency)} exitosamente.`);
      } else {
        // Gasto normal o Ingreso
        if (!selectedAccountId) {
          showWarning('Cuenta Requerida', 'Debes seleccionar una cuenta de origen/destino.');
          return;
        }

        const newTx: Transaction = {
          id: `tx-${Date.now()}`,
          accountId: selectedAccountId,
          type: activeTab as TransactionType,
          amount: parsedAmount,
          categoryId: selectedCategoryId,
          description: description.trim(),
          notes: notes.trim() || undefined,
          date: todayStr,
          createdAt: nowIso,
        };

        await addTransaction(newTx);
        showSuccess('¡Movimiento Registrado!', 'Tus finanzas se actualizaron con éxito.');
      }

      // Reset
      setAmount('');
      setDescription('');
      setNotes('');
      setIsZeroInterestPromo(false);
      onClose();
    } catch (e) {
      showError('Error', 'No se pudo guardar la transacción.');
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
        <TouchableOpacity
          style={styles.backdropDismiss}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalContainer}>
          {/* Tabs Principales */}
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'expense' && styles.tabExpense]}
              onPress={() => {
                setActiveTab('expense');
                setSelectedCategoryId(categories.find((c) => c.type === 'expense')?.id || 'cat-food');
              }}
            >
              <CustomIcon name="ArrowDownRight" size={14} color={activeTab === 'expense' ? '#FFFFFF' : '#94A3B8'} />
              <Text style={[styles.tabText, activeTab === 'expense' && styles.tabTextActive]}>Gasto</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'card_purchase' && styles.tabCard]}
              onPress={() => setActiveTab('card_purchase')}
            >
              <CustomIcon name="CreditCard" size={14} color={activeTab === 'card_purchase' ? '#FFFFFF' : '#94A3B8'} />
              <Text style={[styles.tabText, activeTab === 'card_purchase' && styles.tabTextActive]}>Tarjeta</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'income' && styles.tabIncome]}
              onPress={() => {
                setActiveTab('income');
                setSelectedCategoryId(categories.find((c) => c.type === 'income')?.id || 'cat-salary');
              }}
            >
              <CustomIcon name="ArrowUpRight" size={14} color={activeTab === 'income' ? '#FFFFFF' : '#94A3B8'} />
              <Text style={[styles.tabText, activeTab === 'income' && styles.tabTextActive]}>Ingreso</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'transfer' && styles.tabTransfer]}
              onPress={() => setActiveTab('transfer')}
            >
              <CustomIcon name="Repeat" size={12} color={activeTab === 'transfer' ? '#FFFFFF' : '#94A3B8'} />
              <Text style={[styles.tabText, activeTab === 'transfer' && styles.tabTextActive]} numberOfLines={1}>Transferir</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Input de Monto Destacado con Formato Automático de Miles */}
            <View style={styles.amountBox}>
              <Text style={styles.currencySymbol}>{currency} $</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor="#475569"
                keyboardType="numeric"
                value={amount}
                onChangeText={(text) => setAmount(formatInputNumber(text))}
                autoFocus
              />
            </View>

            {/* Descripción */}
            <Text style={styles.fieldLabel}>Concepto o Descripción</Text>
            <TextInput
              style={styles.input}
              placeholder="ej. Almuerzo, Uber, Supermercado, Pago Nómina"
              placeholderTextColor="#64748B"
              value={description}
              onChangeText={(text) => {
                setDescription(text);
                const predicted = predictCategory(text, categories, activeTab === 'income' ? 'income' : 'expense');
                if (predicted) {
                  setSelectedCategoryId(predicted.id);
                }
              }}
            />

            {/* Configuración Específica de Tarjeta de Crédito */}
            {activeTab === 'card_purchase' && (
              <View style={styles.cardSettingsBlock}>
                <Text style={styles.fieldLabel}>Seleccionar Tarjeta de Crédito</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardsRow}>
                  {creditCards.map((c) => {
                    const isSelected = c.id === (selectedCard?.id || selectedCardId);
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.cardSelectChip, isSelected && styles.cardSelectChipActive]}
                        onPress={() => setSelectedCardId(c.id)}
                      >
                        <CustomIcon name="CreditCard" size={14} color={isSelected ? '#FFFFFF' : '#94A3B8'} />
                        <Text style={[styles.cardChipText, isSelected && styles.cardChipTextActive]}>
                          {c.name}
                        </Text>
                        <Text style={styles.cardChipSub}>
                          (Disp: {formatCurrency(c.availableLimit, currency)})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Selector de Cuotas */}
                <Text style={styles.fieldLabel}>Número de Cuotas ({installments} cuotas)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quotaRow}>
                  {[1, 2, 3, 6, 9, 12, 18, 24, 36].map((q) => (
                    <TouchableOpacity
                      key={q}
                      style={[styles.quotaChip, parsedInstallments === q && styles.quotaChipSelected]}
                      onPress={() => setInstallments(q.toString())}
                    >
                      <Text style={[styles.quotaChipText, parsedInstallments === q && styles.quotaChipTextSelected]}>
                        {q === 1 ? '1 Cuota (0% Interés)' : `${q}x`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Switch de Promoción 0% Interés para múltiples cuotas */}
                {parsedInstallments > 1 && (
                  <View style={styles.promoToggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.promoTitle}>Promoción 0% Interés</Text>
                      <Text style={styles.promoSub}>Aplica para compras con alianza / tasa cero</Text>
                    </View>
                    <Switch
                      value={isZeroInterestPromo}
                      onValueChange={setIsZeroInterestPromo}
                      trackColor={{ false: '#334155', true: '#10B981' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                )}

                {/* Cuotas ya pagadas anteriormente (Para compras antiguas en curso) */}
                {parsedInstallments > 1 && (
                  <View style={styles.historicalQuotasBox}>
                    <View style={styles.historicalHeader}>
                      <CustomIcon name="Clock" size={13} color="#818CF8" />
                      <Text style={styles.historicalTitle}>¿Has pagado cuotas de esta compra antes?</Text>
                    </View>
                    <Text style={styles.historicalSub}>
                      Selecciona si es una compra en curso que hiciste meses atrás:
                    </Text>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.historicalRow}>
                      {Array.from({ length: Math.min(parsedInstallments, 12) }, (_, i) => i).map((paidCount) => {
                        const isSelected = (parseInt(alreadyPaidQuotas, 10) || 0) === paidCount;
                        return (
                          <TouchableOpacity
                            key={paidCount}
                            style={[styles.paidChip, isSelected && styles.paidChipSelected]}
                            onPress={() => setAlreadyPaidQuotas(paidCount.toString())}
                          >
                            <Text style={[styles.paidChipText, isSelected && styles.paidChipTextSelected]}>
                              {paidCount === 0 ? '0 (Nueva compra)' : `${paidCount} pagada${paidCount > 1 ? 's' : ''}`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {(parseInt(alreadyPaidQuotas, 10) || 0) > 0 && (
                      <View style={styles.historicalFeedback}>
                        <CustomIcon name="CheckCircle2" size={13} color="#34D399" />
                        <Text style={styles.historicalFeedbackText}>
                          Se registrarán {alreadyPaidQuotas} cuota(s) como ya pagadas. Quedarán {parsedInstallments - (parseInt(alreadyPaidQuotas, 10) || 0)} cuotas pendientes.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Simulador de Cuota e Intereses en Tiempo Real */}
                {parsedAmount > 0 && (
                  <View style={styles.installmentCalculatorBox}>
                    <View style={styles.calcHeader}>
                      <CustomIcon name="Calculator" size={14} color="#F59E0B" />
                      <Text style={styles.calcTitle}>
                        {parsedInstallments === 1
                          ? 'Compra a 1 Cuota (Sin Interés)'
                          : isZeroInterestPromo
                          ? 'Simulación Promoción 0% Interés'
                          : 'Simulador con Interés Corriente'}
                      </Text>
                      <Text style={styles.calcRate}>{effectiveMonthlyRate}% E.M.</Text>
                    </View>

                    <View style={styles.calcRow}>
                      <Text style={styles.calcLabel}>Cuota Mensual:</Text>
                      <Text style={styles.calcValueHighlight}>
                        {formatCurrency(liveMonthlyQuota, currency)} {parsedInstallments > 1 ? '/ mes' : ''}
                      </Text>
                    </View>

                    {parsedInstallments > 1 && (
                      <>
                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Total a Pagar ({parsedInstallments} cuotas):</Text>
                          <Text style={styles.calcValue}>{formatCurrency(totalProjected, currency)}</Text>
                        </View>

                        <View style={styles.calcRow}>
                          <Text style={styles.calcLabel}>Intereses Totales:</Text>
                          <Text style={[styles.calcValue, { color: isZeroInterestPromo ? '#10B981' : '#F87171' }]}>
                            {isZeroInterestPromo ? '$ 0 (Sin interés)' : `+${formatCurrency(totalInterest, currency)}`}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Selector de Cuentas para Gasto / Ingreso / Transferencia */}
            {activeTab !== 'card_purchase' && (
              <View>
                <Text style={styles.fieldLabel}>
                  {activeTab === 'income' ? 'Depositar en Cuenta' : activeTab === 'transfer' ? 'Cuenta Origen (Sale dinero)' : 'Pagar con la Cuenta'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsRow}>
                  {accounts.map((acc) => {
                    const isSelected = acc.id === selectedAccountId;
                    return (
                      <TouchableOpacity
                        key={acc.id}
                        style={[styles.accountChip, isSelected && styles.accountChipSelected]}
                        onPress={() => setSelectedAccountId(acc.id)}
                      >
                        <CustomIcon
                          name={acc.icon || 'Landmark'}
                          size={13}
                          color={isSelected ? '#FFFFFF' : '#94A3B8'}
                        />
                        <Text style={[styles.accountChipText, isSelected && styles.accountChipTextSelected]}>
                          {acc.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {activeTab === 'transfer' && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.fieldLabel}>Cuenta Destino (Recibe dinero ej. Nu, Nequi, etc.)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsRow}>
                      {accounts.map((acc) => {
                        const isSelected = acc.id === selectedToAccountId;
                        return (
                          <TouchableOpacity
                            key={acc.id}
                            style={[styles.accountChip, isSelected && styles.accountChipSelected]}
                            onPress={() => setSelectedToAccountId(acc.id)}
                          >
                            <CustomIcon
                              name={acc.icon || 'Landmark'}
                              size={13}
                              color={isSelected ? '#FFFFFF' : '#94A3B8'}
                            />
                            <Text style={[styles.accountChipText, isSelected && styles.accountChipTextSelected]}>
                              {acc.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* Selector de Categorías (para gastos, compras y sueldos) */}
            {activeTab !== 'transfer' && (
              <View style={styles.categoriesSection}>
                <Text style={styles.fieldLabel}>Categoría</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesRow}>
                  {filteredCategories.map((cat) => {
                    const isSelected = cat.id === selectedCategoryId;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.catChip,
                          isSelected && { backgroundColor: cat.color, borderColor: cat.color },
                        ]}
                        onPress={() => setSelectedCategoryId(cat.id)}
                      >
                        <CustomIcon
                          name={cat.icon}
                          size={14}
                          color={isSelected ? '#FFFFFF' : cat.color}
                        />
                        <Text style={[styles.catChipText, isSelected && styles.catChipTextSelected]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Notas opcionales */}
            <Text style={styles.fieldLabel}>Notas adicionales (Opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Detalles, número de comprobante..."
              placeholderTextColor="#64748B"
              value={notes}
              onChangeText={setNotes}
            />

            {/* Botón Guardar */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Registrar Movimiento</Text>
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
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 45, // Evita que se filtre contenido bajo la barra de gestos
    maxHeight: '92%',
    marginBottom: 0,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 14,
    padding: 3,
    marginBottom: 16,
    gap: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: 10,
    gap: 2,
  },
  tabExpense: {
    backgroundColor: '#EF4444',
  },
  tabCard: {
    backgroundColor: '#6366F1',
  },
  tabIncome: {
    backgroundColor: '#10B981',
  },
  tabTransfer: {
    backgroundColor: '#3B82F6',
  },
  tabText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  currencySymbol: {
    color: '#94A3B8',
    fontSize: 20,
    fontWeight: '700',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
  },
  fieldLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 6,
  },
  cardSettingsBlock: {
    backgroundColor: Theme.colors.surfaceCard,
    padding: 12,
    borderRadius: 14,
    marginVertical: 8,
  },
  cardsRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  cardSelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardSelectChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: '#818CF8',
  },
  cardChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardChipTextActive: {
    color: '#FFFFFF',
  },
  cardChipSub: {
    color: '#CBD5E1',
    fontSize: 11,
  },
  quotaRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  quotaChip: {
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quotaChipSelected: {
    backgroundColor: Theme.colors.primary,
    borderColor: '#818CF8',
  },
  quotaChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  quotaChipTextSelected: {
    color: '#FFFFFF',
  },
  promoToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  promoTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  promoSub: {
    color: '#94A3B8',
    fontSize: 10,
  },
  historicalQuotasBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  historicalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  historicalTitle: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  historicalSub: {
    color: '#64748B',
    fontSize: 10,
    marginBottom: 8,
  },
  historicalRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  paidChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  paidChipSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#818CF8',
  },
  paidChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  paidChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  historicalFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    padding: 6,
    borderRadius: 8,
    marginTop: 6,
  },
  historicalFeedbackText: {
    color: '#6EE7B7',
    fontSize: 10,
    flex: 1,
  },
  installmentCalculatorBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  calcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  calcTitle: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
  },
  calcRate: {
    color: '#94A3B8',
    fontSize: 11,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  calcLabel: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  calcValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  calcValueHighlight: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: 'bold',
  },
  accountsRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginRight: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  accountChipSelected: {
    backgroundColor: Theme.colors.primary,
    borderColor: '#818CF8',
  },
  accountChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  accountChipTextSelected: {
    color: '#FFFFFF',
  },
  categoriesSection: {},
  categoriesRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  catChipText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '500',
  },
  catChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  saveBtn: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 16,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
