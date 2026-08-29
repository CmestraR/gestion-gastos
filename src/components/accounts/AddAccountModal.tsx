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
import { Account, AccountType } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';
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
];

const COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#E11D48', // Red
  '#64748B', // Slate
];

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
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [includeInTotal, setIncludeInTotal] = useState(true);
  const [hasGmf4x1000, setHasGmf4x1000] = useState(false);

  useEffect(() => {
    if (accountToEdit) {
      setName(accountToEdit.name);
      setBankName(accountToEdit.bankName);
      setType(accountToEdit.type);
      setInitialBalance(formatInputNumber(accountToEdit.balance.toString()));
      setSelectedColor(accountToEdit.color || COLORS[0]);
      setIncludeInTotal(accountToEdit.includeInTotal !== false);
      setHasGmf4x1000(!!accountToEdit.hasGmf4x1000);
    } else {
      setName('');
      setBankName('');
      setType('savings');
      setInitialBalance('');
      setSelectedColor(COLORS[0]);
      setIncludeInTotal(true);
      setHasGmf4x1000(false);
    }
  }, [accountToEdit, visible]);

  const handleSave = async () => {
    if (!name.trim()) {
      showWarning('Campo Requerido', 'Por favor ingresa un nombre para la cuenta.');
      return;
    }

    const bal = parseInputNumber(initialBalance);
    const currentIcon = ACCOUNT_TYPES.find((t) => t.type === type)?.icon || 'Landmark';

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
          includeInTotal,
          hasGmf4x1000,
        };
        await updateAccount(updated);
        showSuccess('¡Cuenta Actualizada!', 'Los cambios han sido guardados exitosamente.');
      } else {
        const newAccount: Account = {
          id: `acc-${Date.now()}`,
          name: name.trim(),
          bankName: bankName.trim() || name.trim(),
          type,
          balance: bal,
          initialBalance: bal,
          currency,
          color: selectedColor,
          icon: currentIcon,
          includeInTotal,
          hasGmf4x1000,
          isArchived: false,
          createdAt: new Date().toISOString(),
        };
        await addAccount(newAccount);
        showSuccess('¡Cuenta Creada!', 'La cuenta ha sido agregada a tus finanzas.');
      }
      onClose();
    } catch (e) {
      showError('Error', 'No se pudo guardar la cuenta.');
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
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.tag}>{isEditing ? 'EDITAR CUENTA' : 'NUEVA CUENTA'}</Text>
              <Text style={styles.title}>
                {isEditing ? 'Actualizar Cuenta' : 'Registrar Cuenta o Billetera'}
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
                return (
                  <TouchableOpacity
                    key={t.type}
                    style={[styles.typeChip, isSelected && styles.typeChipSelected]}
                    onPress={() => setType(t.type)}
                  >
                    <CustomIcon
                      name={t.icon}
                      size={14}
                      color={isSelected ? '#FFFFFF' : '#94A3B8'}
                    />
                    <Text style={[styles.typeChipText, isSelected && styles.typeChipTextSelected]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Nombre y Banco */}
            <Text style={styles.label}>Nombre de la Cuenta / Billetera</Text>
            <TextInput
              style={styles.input}
              placeholder="ej. Nequi, Bancolombia Principal, Billetera Efectivo"
              placeholderTextColor="#64748B"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Entidad Financiera (Opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="ej. Bancolombia, Davivienda, Efectivo"
              placeholderTextColor="#64748B"
              value={bankName}
              onChangeText={setBankName}
            />

            {/* Saldo Inicial */}
            <Text style={styles.label}>Saldo Actual ({currency})</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={initialBalance}
              onChangeText={(text) => setInitialBalance(formatInputNumber(text))}
            />

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
                    : 'Esta cuenta se mantendrá separada (ideal para ahorros o fondos bloqueados).'}
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

            {/* Selector de Color */}
            <Text style={styles.label}>Color Distintivo</Text>
            <View style={styles.colorPickerRow}>
              {COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    selectedColor === c && styles.colorDotSelected,
                  ]}
                  onPress={() => setSelectedColor(c)}
                />
              ))}
            </View>

            {/* Guardar */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>
                {isEditing ? 'Actualizar Cambios' : 'Guardar Cuenta'}
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
    paddingBottom: 45,
    maxHeight: '92%',
    marginBottom: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  typeChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  typeChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  colorPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
    marginTop: 4,
  },
  colorDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.15 }],
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Theme.colors.surfaceElevated,
    padding: 12,
    borderRadius: 12,
    marginVertical: 10,
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
