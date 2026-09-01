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
import { Theme } from '../common/Theme.ts';
import { CustomIcon } from '../common/CustomIcon.tsx';

interface ReconcileCardModalProps {
  visible: boolean;
  card: CreditCard | null;
  statementSummary?: CardStatementSummary | null;
  onClose: () => void;
}

export const ReconcileCardModal: React.FC<ReconcileCardModalProps> = ({
  visible,
  card,
  statementSummary,
  onClose,
}) => {
  const { reconcileCard, currency } = useFinancial();
  const { showSuccess, showWarning, showError } = useAlert();

  const appCalculatedDebt = useMemo(() => {
    if (!card) return 0;
    return Math.max(0, +(card.creditLimit - card.availableLimit).toFixed(2));
  }, [card]);

  const [bankDebtInput, setBankDebtInput] = useState('');
  const [reconciliationDate, setReconciliationDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');

  const [differenceCategory, setDifferenceCategory] = useState<
    'capital' | 'interest' | 'fees' | 'taxes' | 'collection' | 'unclassified'
  >('capital');

  useEffect(() => {
    if (visible && card) {
      setBankDebtInput(formatInputNumber(appCalculatedDebt.toString()));
      setReconciliationDate(new Date().toISOString().split('T')[0]);
      setDifferenceCategory('capital');
      setNotes('');
    }
  }, [visible, card, appCalculatedDebt]);

  const bankDebt = parseInputNumber(bankDebtInput);
  const difference = +(bankDebt - appCalculatedDebt).toFixed(2);
  const isPerfectMatch = difference === 0;

  const handleSaveReconciliation = async () => {
    if (!card) return;

    try {
      await reconcileCard(
        card.id,
        undefined,
        reconciliationDate,
        appCalculatedDebt,
        bankDebt,
        differenceCategory,
        notes.trim() || undefined
      );

      if (isPerfectMatch) {
        showSuccess(
          '¡Conciliación Exitosa!',
          'Los saldos de la aplicación y del extracto bancario coinciden al 100%.'
        );
      } else {
        const categoryLabel = differenceCategory === 'capital' ? 'Capital' : differenceCategory === 'unclassified' ? 'Sin Clasificar (Pendiente)' : 'Cargos/Intereses';
        showSuccess(
          '¡Ajuste Registrado!',
          `Se registró una diferencia auditada de ${formatCurrency(Math.abs(difference), currency)} categorizada como ${categoryLabel}.`
        );
      }
      onClose();
    } catch (e: any) {
      showError('Error en Conciliación', e.message || 'No se pudo guardar la conciliación.');
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
              <Text style={styles.tag}>AUDITORÍA Y CONCILIACIÓN</Text>
              <Text style={styles.title}>Conciliar {card.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CustomIcon name="X" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Comparación Lado a Lado */}
            <View style={styles.comparisonGrid}>
              <View style={styles.compareBox}>
                <Text style={styles.compareLabel}>Saldo en la App</Text>
                <Text style={styles.compareValueApp}>
                  {formatCurrency(appCalculatedDebt, currency)}
                </Text>
                <Text style={styles.compareSub}>Cupo Usado Calculado</Text>
              </View>

              <View style={[styles.compareBox, styles.compareBoxBank]}>
                <Text style={styles.compareLabel}>Saldo en el Banco</Text>
                <Text style={styles.compareValueBank}>
                  {formatCurrency(bankDebt, currency)}
                </Text>
                <Text style={styles.compareSub}>Reportado en Extracto</Text>
              </View>
            </View>

            {/* Resultado de la Discrepancia */}
            <View
              style={[
                styles.resultCard,
                isPerfectMatch ? styles.resultCardMatch : styles.resultCardDiff,
              ]}
            >
              <View style={styles.resultHeader}>
                <CustomIcon
                  name={isPerfectMatch ? 'CheckCircle2' : 'AlertCircle'}
                  size={18}
                  color={isPerfectMatch ? '#10B981' : '#F59E0B'}
                />
                <Text
                  style={[
                    styles.resultTitle,
                    { color: isPerfectMatch ? '#10B981' : '#F59E0B' },
                  ]}
                >
                  {isPerfectMatch
                    ? 'Saldos Sincronizados'
                    : `Discrepancia detectada: ${difference > 0 ? '+' : ''}${formatCurrency(difference, currency)}`}
                </Text>
              </View>
              <Text style={styles.resultDescription}>
                {isPerfectMatch
                  ? 'No hay diferencias entre tus registros y los números del banco.'
                  : difference > 0
                  ? 'El banco reporta una deuda mayor (posibles comisiones, intereses no facturados o compras pendientes).'
                  : 'El banco reporta una deuda menor (posibles abonos aplicados o devoluciones pendientes).'}
              </Text>
            </View>

            {/* Entrada del Saldo Reportado por el Banco */}
            <Text style={styles.inputLabel}>Deuda Total Reportada por el Banco ($)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={bankDebtInput}
              onChangeText={(v) => setBankDebtInput(formatInputNumber(v))}
            />

            {/* Clasificación de la Discrepancia */}
            {!isPerfectMatch && (
              <View style={{ marginVertical: 10 }}>
                <Text style={styles.inputLabel}>Clasificación Contable de la Diferencia</Text>
                <View style={styles.categoryGrid}>
                  {[
                    { id: 'capital', label: 'Capital / Compras', desc: 'Ajusta cupo' },
                    { id: 'interest', label: 'Intereses', desc: 'Deuda no cupo' },
                    { id: 'fees', label: 'Comisiones / Manejo', desc: 'Deuda no cupo' },
                    { id: 'taxes', label: 'Impuestos', desc: 'Deuda no cupo' },
                    { id: 'collection', label: 'Cobranza', desc: 'Deuda no cupo' },
                    { id: 'unclassified', label: 'Sin Clasificar', desc: 'Pendiente de revisión' },
                  ].map((item) => {
                    const isSelected = differenceCategory === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                        onPress={() => setDifferenceCategory(item.id as any)}
                      >
                        <Text style={[styles.catChipTitle, isSelected && styles.catChipTitleSelected]}>
                          {item.label}
                        </Text>
                        <Text style={[styles.catChipSub, isSelected && styles.catChipSubSelected]}>
                          {item.desc}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Fecha de Conciliación */}
            <Text style={styles.inputLabel}>Fecha de Verificación (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={reconciliationDate}
              onChangeText={setReconciliationDate}
              placeholder="2026-08-31"
              placeholderTextColor="#64748B"
            />

            {/* Notas / Justificación del Ajuste */}
            <Text style={styles.inputLabel}>Notas / Motivo del Ajuste (Opcional)</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="ej. Cobro de seguro de vida no registrado, intereses del corte..."
              placeholderTextColor="#64748B"
              multiline
              value={notes}
              onChangeText={setNotes}
            />

            {/* Botón de Confirmación */}
            <TouchableOpacity
              style={[
                styles.actionBtn,
                isPerfectMatch ? styles.actionBtnMatch : styles.actionBtnAdjust,
              ]}
              onPress={handleSaveReconciliation}
              activeOpacity={0.8}
            >
              <CustomIcon
                name={isPerfectMatch ? 'Check' : 'ShieldCheck'}
                size={18}
                color="#FFFFFF"
              />
              <Text style={styles.actionBtnText}>
                {isPerfectMatch
                  ? 'Confirmar Conciliación'
                  : 'Registrar Ajuste Contable Auditado'}
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
  comparisonGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  compareBox: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  compareBoxBank: {
    borderColor: '#818CF8',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
  },
  compareLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  compareValueApp: {
    color: '#F87171',
    fontSize: 16,
    fontWeight: 'bold',
  },
  compareValueBank: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  compareSub: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 4,
  },
  resultCard: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  resultCardMatch: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  resultCardDiff: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  resultDescription: {
    color: '#CBD5E1',
    fontSize: 11,
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
    marginBottom: 14,
  },
  notesInput: {
    height: 70,
    textAlignVertical: 'top',
  },
  actionBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  actionBtnMatch: {
    backgroundColor: '#10B981',
  },
  actionBtnAdjust: {
    backgroundColor: Theme.colors.primary,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  categoryChip: {
    width: '48%',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  catChipTitle: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  catChipTitleSelected: {
    color: '#818CF8',
  },
  catChipSub: {
    color: '#94A3B8',
    fontSize: 10,
  },
  catChipSubSelected: {
    color: '#C7D2FE',
  },
});
