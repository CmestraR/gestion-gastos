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
  Platform,
} from 'react-native';
import { Account, AccountType } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';
import { ColorPickerModal } from '../common/ColorPickerModal';
import { formatInputNumber, parseInputNumber } from '../../utils/formatters';

interface AddAccountModalProps {
  visible: boolean;
  onClose: () => void;
  accountToEdit?: Account | null;
}

const ACCOUNT_TYPES: { type: AccountType; label: string; icon: string }[] = [
  { type: 'savings', label: 'Ahorros', icon: 'Landmark' },
  { type: 'checking', label: 'Corriente', icon: 'Briefcase' },
  { type: 'wallet', label: 'Billetera Digital', icon: 'Smartphone' },
  { type: 'cash', label: 'Efectivo', icon: 'Banknote' },
  { type: 'investment', label: 'Inversión / CDT', icon: 'TrendingUp' },
  { type: 'debt', label: 'Deuda / Fiado', icon: 'Receipt' },
];

const PRESET_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#820AD1', // Nu Purple
  '#D62886', // Nequi Pink
  '#F59E0B', // Amber
  '#FDDA24', // Bancolombia Yellow
  '#ED1C24', // Davivienda Red
  '#06B6D4', // Cyan
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F97316', // Orange
  '#14B8A6', // Teal
  '#6366F1', // Indigo
  '#64748B', // Slate Gray
  '#0F172A', // Navy Black
  '#E11D48', // Crimson
];

const isValidHex = (hex: string) => /^#[0-9A-Fa-f]{6}$/.test(hex.trim());

export const AddAccountModal: React.FC<AddAccountModalProps> = ({
  visible,
  onClose,
  accountToEdit,
}) => {
  const { addAccount, updateAccount, currency } = useFinancial();
  const { showSuccess, showWarning, showError } = useAlert();
  const isEditing = !!accountToEdit;

  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [type, setType] = useState<AccountType>('savings');
  const [initialBalance, setInitialBalance] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [includeInTotal, setIncludeInTotal] = useState(true);
  const [hasGmf4x1000, setHasGmf4x1000] = useState(false);
  const [interestRateMonthly, setInterestRateMonthly] = useState('');
  const [debtLimit, setDebtLimit] = useState('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    if (accountToEdit) {
      setName(accountToEdit.name);
      setBankName(accountToEdit.bankName);
      setType(accountToEdit.type);
      setInitialBalance(formatInputNumber(accountToEdit.balance.toString()));
      const accColor = accountToEdit.color || PRESET_COLORS[0];
      setSelectedColor(accColor);
      setIncludeInTotal(accountToEdit.includeInTotal !== false);
      setHasGmf4x1000(!!accountToEdit.hasGmf4x1000);
      setInterestRateMonthly(accountToEdit.interestRateMonthly ? accountToEdit.interestRateMonthly.toString() : '');
      setDebtLimit(accountToEdit.debtLimit ? formatInputNumber(accountToEdit.debtLimit.toString()) : '');
      setDueDate(accountToEdit.dueDate ? accountToEdit.dueDate.toString() : '');
    } else {
      setName('');
      setBankName('');
      setType('savings');
      setInitialBalance('');
      setSelectedColor(PRESET_COLORS[0]);
      setIncludeInTotal(true);
      setHasGmf4x1000(false);
      setInterestRateMonthly('');
      setDebtLimit('');
      setDueDate('');
    }
  }, [accountToEdit, visible]);

  const handleSave = async () => {
    if (!name.trim()) {
      showWarning('Campo Requerido', 'Por favor ingresa un nombre para la cuenta o deuda.');
      return;
    }

    const bal = parseInputNumber(initialBalance);
    const currentIcon = ACCOUNT_TYPES.find((t) => t.type === type)?.icon || 'Landmark';
    const parsedRate = parseFloat(interestRateMonthly) || 0;
    const parsedLimit = parseInputNumber(debtLimit);
    const parsedDue = parseInt(dueDate, 10) || undefined;

    try {
      if (isEditing && accountToEdit) {
        const updated: Account = {
          ...accountToEdit,
          name: name.trim(),
          bankName: bankName.trim() || name.trim(),
          type,
          balance: bal,
          color: selectedColor,
          icon: currentIcon,
          includeInTotal: type === 'debt' ? false : includeInTotal,
          hasGmf4x1000: type === 'debt' ? false : hasGmf4x1000,
          interestRateMonthly: parsedRate,
          debtLimit: parsedLimit > 0 ? parsedLimit : undefined,
          dueDate: parsedDue,
        };
        await updateAccount(updated);
        showSuccess('¡Cuenta Actualizada!', 'Los cambios han sido guardados exitosamente.');
      } else {
        const newAccount: Account = {
          id: `acc-${Date.now()}`,
          name: name.trim(),
          bankName: bankName.trim() || name.trim(),
          type,
          balance: type === 'debt' && bal > 0 ? -bal : bal, // Si es deuda y pone monto inicial, entra en negativo
          initialBalance: type === 'debt' && bal > 0 ? -bal : bal,
          currency,
          color: selectedColor,
          icon: currentIcon,
          includeInTotal: type === 'debt' ? false : includeInTotal,
          hasGmf4x1000: type === 'debt' ? false : hasGmf4x1000,
          interestRateMonthly: parsedRate,
          debtLimit: parsedLimit > 0 ? parsedLimit : undefined,
          dueDate: parsedDue,
          isArchived: false,
          createdAt: new Date().toISOString(),
        };
        await addAccount(newAccount);
        showSuccess(
          type === 'debt' ? '¡Deuda Registrada!' : '¡Cuenta Creada!',
          type === 'debt'
            ? 'La cuenta de deuda ha sido creada. Podrás registrar gastos y pagarla cuando quieras.'
            : 'La cuenta ha sido agregada a tus finanzas.'
        );
      }
      onClose();
    } catch (e) {
      showError('Error', 'No se pudo guardar la cuenta.');
    }
  };

  const isDebt = type === 'debt';

  return (
    <>
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
                <Text style={styles.tag}>
                  {isEditing ? 'EDITAR' : 'NUEVO'} • {isDebt ? 'DEUDA / FIADO' : 'CUENTA'}
                </Text>
                <Text style={styles.title}>
                  {isEditing
                    ? isDebt ? 'Actualizar Deuda' : 'Actualizar Cuenta'
                    : isDebt ? 'Registrar Cuenta de Deuda' : 'Registrar Cuenta o Billetera'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <CustomIcon name="X" size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
              {/* Selector de Tipo */}
              <Text style={styles.label}>Tipo de Cuenta</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typesRow}>
                {ACCOUNT_TYPES.map((t) => {
                  const isSelected = type === t.type;
                  const isDebtType = t.type === 'debt';
                  return (
                    <TouchableOpacity
                      key={t.type}
                      style={[
                        styles.typeChip,
                        isSelected && (isDebtType ? styles.typeChipDebtSelected : styles.typeChipSelected),
                      ]}
                      onPress={() => setType(t.type)}
                    >
                      <CustomIcon
                        name={t.icon}
                        size={14}
                        color={isSelected ? '#FFFFFF' : isDebtType ? '#F87171' : '#94A3B8'}
                      />
                      <Text
                        style={[
                          styles.typeChipText,
                          isSelected && styles.typeChipTextSelected,
                          isDebtType && !isSelected && { color: '#F87171' },
                        ]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Mensaje Informativo si es Deuda */}
              {isDebt && (
                <View style={styles.debtInfoBox}>
                  <CustomIcon name="Receipt" size={18} color="#EF4444" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.debtInfoTitle}>¿Cómo funciona una Cuenta de Deuda?</Text>
                    <Text style={styles.debtInfoDesc}>
                      Ideal para la cafetería, fiados o préstamos. Cada gasto que registres aumentará la deuda acumulada. Podrás pagarla o abonar con tus cuentas bancarias o con tarjeta de crédito en cuotas.
                    </Text>
                  </View>
                </View>
              )}

              {/* Nombre y Entidad / Acreedor */}
              <Text style={styles.label}>
                {isDebt ? 'Nombre de la Deuda / Establecimiento' : 'Nombre de la Cuenta / Billetera'}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={isDebt ? 'ej. Cafetería Oficina, Fiado Tienda, Préstamo Amigo' : 'ej. Nequi, Bancolombia, Billetera Efectivo'}
                placeholderTextColor="#64748B"
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>
                {isDebt ? 'Acreedor / Persona / Lugar (Opcional)' : 'Entidad Financiera (Opcional)'}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={isDebt ? 'ej. Doña Martha, Cafetería Piso 2' : 'ej. Bancolombia, Davivienda, Efectivo'}
                placeholderTextColor="#64748B"
                value={bankName}
                onChangeText={setBankName}
              />

              {/* Saldo Inicial / Deuda Actual */}
              <Text style={styles.label}>
                {isDebt ? `Deuda Inicial Acumulada (${currency})` : `Saldo Actual (${currency})`}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                value={initialBalance}
                onChangeText={(text) => setInitialBalance(formatInputNumber(text))}
              />

              {/* Campos Especiales de Deuda */}
              {isDebt && (
                <View style={styles.debtFieldsBox}>
                  <View style={styles.debtFieldCol}>
                    <Text style={styles.label}>Interés Mensual (% E.M.)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0% (Opcional)"
                      placeholderTextColor="#64748B"
                      keyboardType="numeric"
                      value={interestRateMonthly}
                      onChangeText={setInterestRateMonthly}
                    />
                  </View>
                  <View style={styles.debtFieldCol}>
                    <Text style={styles.label}>Día Límite de Pago (1-31)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="ej. 30"
                      placeholderTextColor="#64748B"
                      keyboardType="numeric"
                      maxLength={2}
                      value={dueDate}
                      onChangeText={setDueDate}
                    />
                  </View>
                </View>
              )}

              {/* Opciones bancarias si NO es deuda */}
              {!isDebt && (
                <>
                  {/* Switch de Incluir en Saldo Disponible */}
                  <TouchableOpacity
                    style={styles.toggleCard}
                    onPress={() => setIncludeInTotal(!includeInTotal)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.toggleTextCol}>
                      <Text style={styles.toggleTitle}>Incluir en Saldo Disponible</Text>
                      <Text style={styles.toggleSubtitle}>
                        {includeInTotal
                          ? 'Esta cuenta se sumará al saldo disponible general de la app.'
                          : 'Esta cuenta se mantendrá separada (ideal para fondos bloqueados).'}
                      </Text>
                    </View>
                    <Switch
                      value={includeInTotal}
                      onValueChange={setIncludeInTotal}
                      trackColor={{ false: '#334155', true: '#10B981' }}
                      thumbColor="#FFFFFF"
                    />
                  </TouchableOpacity>

                  {/* Switch de Impuesto 4x1000 */}
                  <TouchableOpacity
                    style={styles.toggleCard}
                    onPress={() => setHasGmf4x1000(!hasGmf4x1000)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.toggleTextCol}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.toggleTitle}>Aplica Impuesto 4x1000 (GMF)</Text>
                        {hasGmf4x1000 && (
                          <View style={styles.gmfPill}>
                            <Text style={styles.gmfPillText}>0.4%</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.toggleSubtitle}>
                        {hasGmf4x1000
                          ? 'En cada gasto o transferencia de esta cuenta se descontará el 0.4% ($4 por cada $1.000).'
                          : 'Cuenta exenta de 4x1000 (no se cobrará el gravamen).'}
                      </Text>
                    </View>
                    <Switch
                      value={hasGmf4x1000}
                      onValueChange={setHasGmf4x1000}
                      trackColor={{ false: '#334155', true: '#EF4444' }}
                      thumbColor="#FFFFFF"
                    />
                  </TouchableOpacity>
                </>
              )}

              {/* Sección de Color Distintivo & Paleta Gráfica */}
              <View style={styles.colorSection}>
                <View style={styles.colorHeaderRow}>
                  <Text style={styles.colorSectionLabel}>Color Distintivo</Text>
                  <TouchableOpacity
                    style={styles.openPaletteBtn}
                    onPress={() => setIsColorPickerOpen(true)}
                    activeOpacity={0.8}
                  >
                    <CustomIcon name="Palette" size={13} color="#818CF8" />
                    <Text style={styles.openPaletteBtnText}>Paleta Completa</Text>
                  </TouchableOpacity>
                </View>

                {/* Grid de Paleta Rápida */}
                <View style={styles.colorPickerGrid}>
                  {PRESET_COLORS.map((c) => {
                    const isSelected = selectedColor.toLowerCase() === c.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[
                          styles.colorDot,
                          { backgroundColor: c },
                          isSelected && styles.colorDotSelected,
                        ]}
                        onPress={() => setSelectedColor(c)}
                        activeOpacity={0.8}
                      />
                    );
                  })}

                  {/* Botón para Abrir Paleta Gráfica */}
                  <TouchableOpacity
                    style={styles.customColorBtn}
                    onPress={() => setIsColorPickerOpen(true)}
                    activeOpacity={0.8}
                  >
                    <CustomIcon name="Pipette" size={13} color="#CBD5E1" />
                    <Text style={styles.customColorBtnText}>Más...</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Guardar */}
              <TouchableOpacity style={[styles.saveBtn, isDebt && { backgroundColor: '#EF4444' }]} onPress={handleSave}>
                <Text style={styles.saveBtnText}>
                  {isEditing ? 'Actualizar Cambios' : isDebt ? 'Guardar Cuenta de Deuda' : 'Guardar Cuenta'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Gráfico de Paleta de Colores */}
      <ColorPickerModal
        visible={isColorPickerOpen}
        initialColor={selectedColor}
        onClose={() => setIsColorPickerOpen(false)}
        onSelectColor={(color) => setSelectedColor(color)}
      />
    </>
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
    paddingBottom: 45,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  tag: {
    color: '#818CF8',
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
  label: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 6,
  },
  typesRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  typeChipSelected: {
    backgroundColor: Theme.colors.primary,
    borderColor: '#818CF8',
  },
  typeChipDebtSelected: {
    backgroundColor: '#EF4444',
    borderColor: '#F87171',
  },
  typeChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  typeChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  debtInfoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: 10,
    gap: 10,
    alignItems: 'flex-start',
  },
  debtInfoTitle: {
    color: '#FCA5A5',
    fontSize: 12.5,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  debtInfoDesc: {
    color: '#E2E8F0',
    fontSize: 11,
    lineHeight: 15,
  },
  debtFieldsBox: {
    flexDirection: 'row',
    gap: 10,
  },
  debtFieldCol: {
    flex: 1,
  },
  colorSection: {
    marginTop: 14,
    marginBottom: 16,
  },
  colorHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  colorSectionLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },
  openPaletteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  openPaletteBtnText: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  colorPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  customColorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: Theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: '#334155',
  },
  customColorBtnText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Theme.colors.surfaceElevated,
    padding: 12,
    borderRadius: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  toggleTextCol: {
    flex: 1,
    marginRight: 10,
  },
  toggleTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  toggleSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  gmfPill: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  gmfPillText: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: 'bold',
  },
  saveBtn: {
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
