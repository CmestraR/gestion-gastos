import React, { useState, useEffect } from 'react';
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
import { CycleRepository } from '../../database/repositories/cycleRepository.ts';
import { Theme } from '../common/Theme.ts';
import { CustomIcon } from '../common/CustomIcon.tsx';

interface ManualStatementModalProps {
  visible: boolean;
  card: CreditCard | null;
  statementSummary?: CardStatementSummary | null;
  onClose: () => void;
}

export const ManualStatementModal: React.FC<ManualStatementModalProps> = ({
  visible,
  card,
  statementSummary,
  onClose,
}) => {
  const { saveStatementSnapshot, createOpeningBalance, currency } = useFinancial();
  const { showSuccess, showWarning, showError } = useAlert();

  const [statementDate, setStatementDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [totalBalance, setTotalBalance] = useState('');
  const [minimumPayment, setMinimumPayment] = useState('');
  const [currentInterest, setCurrentInterest] = useState('0');
  const [handlingFee, setHandlingFee] = useState('0');
  const [collectionFee, setCollectionFee] = useState('0');
  const [isOpeningBalanceMode, setIsOpeningBalanceMode] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (visible && card) {
      const today = new Date();
      const cutOffYMD = statementSummary?.cutOffDate || today.toISOString().split('T')[0];
      const dueYMD = statementSummary?.paymentDueDate || today.toISOString().split('T')[0];

      setStatementDate(cutOffYMD);
      setDueDate(dueYMD);
      const usedCredit = card.creditLimit - card.availableLimit;
      setTotalBalance(formatInputNumber(usedCredit > 0 ? usedCredit.toString() : '0'));
      setMinimumPayment(formatInputNumber(usedCredit > 0 ? Math.min(usedCredit, 50000).toString() : '0'));
      setCurrentInterest('0');
      setHandlingFee(formatInputNumber(card.handlingFee ? card.handlingFee.toString() : '0'));
      setCollectionFee('0');
      setIsOpeningBalanceMode(!statementSummary?.hasStatementSnapshot);
      setNotes('Extracto registrado manualmente / Saldo de apertura');
    }
  }, [visible, card, statementSummary]);

  const handleSave = async () => {
    if (!card) return;

    const parsedTotal = parseInputNumber(totalBalance);
    const parsedMin = parseInputNumber(minimumPayment);
    const parsedInterest = parseInputNumber(currentInterest);
    const parsedHandling = parseInputNumber(handlingFee);
    const parsedCollection = parseInputNumber(collectionFee);

    if (parsedTotal <= 0) {
      showWarning('Saldo Requerido', 'El saldo total del extracto debe ser mayor a cero.');
      return;
    }

    if (!statementDate.trim() || !dueDate.trim()) {
      showWarning('Fechas Requeridas', 'Ingresa la fecha de corte y la fecha límite de pago.');
      return;
    }

    try {
      // Obtener o crear ciclo de facturación activo
      const cycle = await CycleRepository.getOrCreateCurrentCycle(
        card.id,
        new Date(statementDate)
      );

      const nonPrincipal = parsedInterest + parsedHandling + parsedCollection;
      const principal = Math.max(0, parsedTotal - nonPrincipal);

      if (isOpeningBalanceMode) {
        await createOpeningBalance({
          cardId: card.id,
          billingCycleId: cycle.id,
          statementDate,
          dueDate,
          principalTotal: principal,
          interestAndFeesTotal: nonPrincipal,
          minimumPayment: parsedMin,
          notes: notes.trim() || undefined,
        });
      } else {
        await saveStatementSnapshot({
          cardId: card.id,
          billingCycleId: cycle.id,
          statementDate,
          dueDate,
          openingBalance: 0,
          purchasesTotal: parsedTotal,
          advancesTotal: 0,
          principalTotal: principal,
          currentInterest: parsedInterest,
          lateInterest: 0,
          handlingFee: parsedHandling,
          taxesAndFees: 0,
          collectionFee: parsedCollection,
          totalStatementBalance: parsedTotal,
          minimumPaymentOriginal: parsedMin,
          statementBalancePaid: 0,
          minimumPaymentPaid: 0,
          status: 'open',
          isManualSnapshot: true,
          isOpeningBalance: false,
          notes: notes.trim() || undefined,
        });
      }

      showSuccess(
        '¡Extracto Guardado!',
        `Se registró el extracto oficial de ${card.name} con un saldo total de ${formatCurrency(parsedTotal, currency)}.`
      );
      onClose();
    } catch (e: any) {
      showError('Error al Guardar Extracto', e.message || 'No se pudo registrar el extracto.');
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
              <Text style={styles.tag}>EXTRACTO OFICIAL / APERTURA</Text>
              <Text style={styles.title}>Registrar Extracto</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CustomIcon name="X" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Info Banner */}
            <View style={styles.infoBanner}>
              <CustomIcon name="Info" size={16} color="#818CF8" />
              <Text style={styles.infoText}>
                Ingresa las cifras oficiales de tu extracto bancario para congelar el saldo del corte y habilitar el control de pagos exactos.
              </Text>
            </View>

            {/* Saldo Total del Extracto */}
            <Text style={styles.inputLabel}>Saldo Total a Pagar del Extracto ($)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={totalBalance}
              onChangeText={(v) => setTotalBalance(formatInputNumber(v))}
            />

            {/* Pago Mínimo */}
            <Text style={styles.inputLabel}>Pago Mínimo del Extracto ($)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={minimumPayment}
              onChangeText={(v) => setMinimumPayment(formatInputNumber(v))}
            />

            {/* Fechas de Corte y Vencimiento */}
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.inputLabel}>Fecha de Corte</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#64748B"
                  value={statementDate}
                  onChangeText={setStatementDate}
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.inputLabel}>Fecha Límite Pago</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#64748B"
                  value={dueDate}
                  onChangeText={setDueDate}
                />
              </View>
            </View>

            {/* Intereses y Cuota de Manejo */}
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.inputLabel}>Intereses ($)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  value={currentInterest}
                  onChangeText={(v) => setCurrentInterest(formatInputNumber(v))}
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.inputLabel}>Cuota de Manejo ($)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  value={handlingFee}
                  onChangeText={(v) => setHandlingFee(formatInputNumber(v))}
                />
              </View>
            </View>

            {/* Notas */}
            <Text style={styles.inputLabel}>Notas / Descripción</Text>
            <TextInput
              style={[styles.input, { height: 60 }]}
              placeholder="ej. Extracto del mes actual de Nu / Saldo traído"
              placeholderTextColor="#64748B"
              value={notes}
              onChangeText={setNotes}
            />

            {/* Botón Guardar */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <CustomIcon name="CheckCircle2" size={18} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Guardar Extracto Oficial</Text>
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
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  infoText: {
    color: '#CBD5E1',
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  inputLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: Theme.colors.surfaceElevated,
    color: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
  },
  saveBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
