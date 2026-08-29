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
} from 'react-native';
import { CreditCard, CardBrand } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { convertEAToEM } from '../../utils/financialMath';
import { formatInputNumber, parseInputNumber } from '../../utils/formatters';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';

interface AddCreditCardModalProps {
  visible: boolean;
  onClose: () => void;
  cardToEdit?: CreditCard | null;
}

const CARD_BRANDS: { brand: CardBrand; label: string }[] = [
  { brand: 'visa', label: 'Visa' },
  { brand: 'mastercard', label: 'Mastercard' },
  { brand: 'amex', label: 'American Express' },
  { brand: 'other', label: 'Otra' },
];

export const AddCreditCardModal: React.FC<AddCreditCardModalProps> = ({
  visible,
  onClose,
  cardToEdit,
}) => {
  const { addCreditCard, updateCreditCard, currency } = useFinancial();
  const { showSuccess, showWarning, showError } = useAlert();
  const isEditing = !!cardToEdit;

  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [cardBrand, setCardBrand] = useState<CardBrand>('visa');
  const [lastFour, setLastFour] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [cutOffDay, setCutOffDay] = useState('15');
  const [paymentDueDay, setPaymentDueDay] = useState('5');
  const [interestRateMonthly, setInterestRateMonthly] = useState('2.15');
  const [annualRate, setAnnualRate] = useState('');
  const [handlingFee, setHandlingFee] = useState('0');
  const [selectedGradientIndex, setSelectedGradientIndex] = useState(0);

  useEffect(() => {
    if (cardToEdit) {
      setName(cardToEdit.name);
      setBankName(cardToEdit.bankName);
      setCardBrand(cardToEdit.cardBrand);
      setLastFour(cardToEdit.lastFourDigits || '');
      setCreditLimit(formatInputNumber(cardToEdit.creditLimit.toString()));
      setCutOffDay(cardToEdit.cutOffDay.toString());
      setPaymentDueDay(cardToEdit.paymentDueDay.toString());
      setInterestRateMonthly(cardToEdit.interestRateMonthly.toString());
      setHandlingFee(formatInputNumber(cardToEdit.handlingFee.toString()));
    } else {
      setName('');
      setBankName('');
      setCardBrand('visa');
      setLastFour('');
      setCreditLimit('');
      setCutOffDay('15');
      setPaymentDueDay('5');
      setInterestRateMonthly('2.15');
      setAnnualRate('');
      setHandlingFee('0');
      setSelectedGradientIndex(0);
    }
  }, [cardToEdit, visible]);

  const handleAnnualRateChange = (val: string) => {
    setAnnualRate(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      const em = convertEAToEM(num);
      setInterestRateMonthly(em.toString());
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showWarning('Campo Requerido', 'Ingresa un nombre para la tarjeta.');
      return;
    }
    if (!bankName.trim()) {
      showWarning('Campo Requerido', 'Ingresa el nombre del banco.');
      return;
    }
    const limit = parseInputNumber(creditLimit);
    if (limit <= 0) {
      showWarning('Cupo Inválido', 'Ingresa el cupo total de la tarjeta.');
      return;
    }

    const cutOff = parseInt(cutOffDay, 10);
    const payment = parseInt(paymentDueDay, 10);
    if (isNaN(cutOff) || cutOff < 1 || cutOff > 31 || isNaN(payment) || payment < 1 || payment > 31) {
      showWarning('Días Inválidos', 'Los días de corte y pago deben ser entre 1 y 31.');
      return;
    }

    try {
      if (isEditing && cardToEdit) {
        const deltaLimit = limit - cardToEdit.creditLimit;
        const newAvailable = Math.max(0, Math.min(limit, cardToEdit.availableLimit + deltaLimit));

        const updated: CreditCard = {
          ...cardToEdit,
          name: name.trim(),
          bankName: bankName.trim(),
          cardBrand,
          lastFourDigits: lastFour.trim() || undefined,
          creditLimit: limit,
          availableLimit: newAvailable,
          cutOffDay: cutOff,
          paymentDueDay: payment,
          interestRateMonthly: parseFloat(interestRateMonthly) || 0,
          handlingFee: parseInputNumber(handlingFee),
          colorGradient:
            Theme.colors.cardGradients[selectedGradientIndex] ||
            cardToEdit.colorGradient ||
            Theme.colors.cardGradients[0],
        };
        await updateCreditCard(updated);
        showSuccess('¡Tarjeta Actualizada!', 'Los cambios han sido guardados exitosamente.');
      } else {
        const newCard: CreditCard = {
          id: `card-${Date.now()}`,
          name: name.trim(),
          bankName: bankName.trim(),
          cardBrand,
          lastFourDigits: lastFour.trim() || undefined,
          creditLimit: limit,
          availableLimit: limit,
          cutOffDay: cutOff,
          paymentDueDay: payment,
          interestRateMonthly: parseFloat(interestRateMonthly) || 0,
          handlingFee: parseInputNumber(handlingFee),
          colorGradient: Theme.colors.cardGradients[selectedGradientIndex] || Theme.colors.cardGradients[0],
          currency,
          isArchived: false,
          createdAt: new Date().toISOString(),
        };
        await addCreditCard(newCard);
        showSuccess('¡Tarjeta Agregada!', 'Tu nueva tarjeta de crédito ha sido registrada.');
      }
      onClose();
    } catch (e) {
      showError('Error', 'No se pudo guardar la tarjeta.');
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
              <Text style={styles.tag}>{isEditing ? 'EDITAR TARJETA' : 'NUEVA TARJETA'}</Text>
              <Text style={styles.title}>
                {isEditing ? 'Actualizar Tarjeta' : 'Registrar Tarjeta de Crédito'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CustomIcon name="X" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
            {/* Franquicia */}
            <Text style={styles.label}>Franquicia</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.brandsRow}>
              {CARD_BRANDS.map((b) => {
                const isSelected = cardBrand === b.brand;
                return (
                  <TouchableOpacity
                    key={b.brand}
                    style={[styles.brandChip, isSelected && styles.brandChipSelected]}
                    onPress={() => setCardBrand(b.brand)}
                  >
                    <Text style={[styles.brandChipText, isSelected && styles.brandChipTextSelected]}>
                      {b.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Nombre y Banco */}
            <Text style={styles.label}>Nombre de la Tarjeta</Text>
            <TextInput
              style={styles.input}
              placeholder="ej. Nu Crédito, Visa Black, RappiCard"
              placeholderTextColor="#64748B"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Banco Emisor</Text>
            <TextInput
              style={styles.input}
              placeholder="ej. Bancolombia, Nu, Davivienda, Falabella"
              placeholderTextColor="#64748B"
              value={bankName}
              onChangeText={setBankName}
            />

            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Text style={styles.label}>Cupo Total ({currency})</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ej. 5.000.000"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  value={creditLimit}
                  onChangeText={(text) => setCreditLimit(formatInputNumber(text))}
                />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.label}>Últimos 4 dígitos (opc.)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1234"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  maxLength={4}
                  value={lastFour}
                  onChangeText={setLastFour}
                />
              </View>
            </View>

            {/* Fechas de Corte y Pago */}
            <View style={styles.datesGrid}>
              <View style={styles.formCol}>
                <Text style={styles.label}>Día de Corte (1-31)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="15"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  maxLength={2}
                  value={cutOffDay}
                  onChangeText={setCutOffDay}
                />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.label}>Día Límite de Pago (1-31)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="5"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                  maxLength={2}
                  value={paymentDueDay}
                  onChangeText={setPaymentDueDay}
                />
              </View>
            </View>

            {/* Tasas de Interés y Cuota de Manejo */}
            <View style={styles.ratesSection}>
              <Text style={styles.subHeading}>Configuración de Intereses & Comisiones</Text>

              <View style={styles.formRow}>
                <View style={styles.formCol}>
                  <Text style={styles.label}>Tasa Mensual (% E.M.)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="2.15"
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                    value={interestRateMonthly}
                    onChangeText={setInterestRateMonthly}
                  />
                </View>
                <View style={styles.formCol}>
                  <Text style={styles.label}>O Tasa Anual (% E.A.)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="29.0"
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                    value={annualRate}
                    onChangeText={handleAnnualRateChange}
                  />
                </View>
              </View>

              <Text style={styles.label}>Cuota de Manejo Mensual ({currency})</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                value={handlingFee}
                onChangeText={(text) => setHandlingFee(formatInputNumber(text))}
              />
            </View>

            {/* Selector de Gradiente */}
            <Text style={styles.label}>Estilo Visual / Color</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gradientsRow}>
              {Theme.colors.cardGradients.map((g, idx) => {
                const isSelected = selectedGradientIndex === idx;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.gradientChoice,
                      { backgroundColor: g[0], borderColor: g[1] },
                      isSelected && styles.gradientChoiceSelected,
                    ]}
                    onPress={() => setSelectedGradientIndex(idx)}
                  />
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>
                {isEditing ? 'Actualizar Tarjeta' : 'Registrar Tarjeta'}
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
  brandsRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  brandChip: {
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  brandChipSelected: {
    backgroundColor: Theme.colors.primary,
    borderColor: '#818CF8',
  },
  brandChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  brandChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formCol: {
    flex: 1,
  },
  datesGrid: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 4,
  },
  ratesSection: {
    backgroundColor: Theme.colors.surfaceElevated,
    padding: 12,
    borderRadius: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  subHeading: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  gradientsRow: {
    flexDirection: 'row',
    marginVertical: 8,
  },
  gradientChoice: {
    width: 44,
    height: 28,
    borderRadius: 6,
    marginRight: 10,
    borderWidth: 2,
  },
  gradientChoiceSelected: {
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.15 }],
  },
  saveBtn: {
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
