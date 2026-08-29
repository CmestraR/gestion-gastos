import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { parseBankNotification, ParsedBankMessage } from '../../utils/bankNotificationParser';
import { useFinancial } from '../../context/FinancialContext';
import { formatCurrency } from '../../utils/formatters';
import { Theme } from './Theme';
import { CustomIcon } from './CustomIcon';

interface QuickIslandBarProps {
  onOpenAddModal: (prefill?: Partial<ParsedBankMessage>) => void;
}

export const QuickIslandBar: React.FC<QuickIslandBarProps> = ({ onOpenAddModal }) => {
  const { currency } = useFinancial();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notificationText, setNotificationText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<ParsedBankMessage | null>(null);

  const handleTextChange = (text: string) => {
    setNotificationText(text);
    if (text.trim().length > 10) {
      const result = parseBankNotification(text);
      setParsedPreview(result);
    } else {
      setParsedPreview(null);
    }
  };

  const handleApplyParsed = () => {
    if (!parsedPreview) {
      Alert.alert('No se detectó información', 'Pega el texto completo del SMS o notificación bancaria.');
      return;
    }
    setIsModalOpen(false);
    onOpenAddModal(parsedPreview);
    setNotificationText('');
    setParsedPreview(null);
  };

  const sampleNotifications = [
    'Bancolombia le informa compra por $45.000 en EXITO con t.deb *4829',
    'Nu: Compra aprobada por $120.000 en MercadoLibre a 1 cuota',
    'Nequi: Enviaste $50.000 a Juan Perez',
  ];

  return (
    <>
      {/* Píldora de Acceso Rápido / Isla Dinámica */}
      <TouchableOpacity
        style={styles.islandPill}
        activeOpacity={0.85}
        onPress={() => setIsModalOpen(true)}
      >
        <View style={styles.islandPulseDot} />
        <View style={styles.islandContent}>
          <CustomIcon name="Sparkles" size={14} color="#818CF8" />
          <Text style={styles.islandText}>Captura Rápida de Notificaciones</Text>
        </View>
        <View style={styles.islandBadge}>
          <Text style={styles.islandBadgeText}>Auto</Text>
        </View>
      </TouchableOpacity>

      {/* Modal de Captura Inteligente */}
      <Modal visible={isModalOpen} animationType="fade" transparent onRequestClose={() => setIsModalOpen(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsModalOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.modalContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                <View style={styles.sparkleBox}>
                  <CustomIcon name="Zap" size={16} color="#F59E0B" />
                </View>
                <View>
                  <Text style={styles.tag}>DETECCIÓN INTELIGENTE</Text>
                  <Text style={styles.title}>Leer Notificación Bancaria</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsModalOpen(false)} style={styles.closeBtn}>
                <CustomIcon name="X" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.instruction}>
              Pega aquí el texto de una notificación o SMS de Bancolombia, Nu, Nequi, Daviplata o cualquier banco:
            </Text>

            {/* Input para pegar texto */}
            <TextInput
              style={styles.textArea}
              placeholder="Pega aquí: ej. 'Bancolombia le informa compra por $85.000 en...' o 'Transferencia a Nu...'"
              placeholderTextColor="#64748B"
              multiline
              numberOfLines={4}
              value={notificationText}
              onChangeText={handleTextChange}
            />

            {/* Ejemplos rápidos */}
            <Text style={styles.sampleLabel}>O prueba con un ejemplo:</Text>
            <View style={styles.samplesRow}>
              {sampleNotifications.map((sample, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.sampleChip}
                  onPress={() => handleTextChange(sample)}
                >
                  <Text style={styles.sampleChipText} numberOfLines={1}>
                    {sample.substring(0, 24)}...
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Vista Previa de Detección */}
            {parsedPreview ? (
              <View style={styles.previewCard}>
                <View style={styles.previewHeader}>
                  <CustomIcon name="CheckCircle" size={14} color="#10B981" />
                  <Text style={styles.previewTitle}>Datos Detectados con Éxito</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Banco / Origen:</Text>
                  <Text style={styles.previewVal}>{parsedPreview.bankName}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Monto Extraído:</Text>
                  <Text style={[styles.previewVal, { color: '#34D399', fontWeight: 'bold' }]}>
                    {formatCurrency(parsedPreview.amount, currency)}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Concepto:</Text>
                  <Text style={styles.previewVal}>{parsedPreview.description}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Tipo de Movimiento:</Text>
                  <Text style={[styles.previewVal, { textTransform: 'capitalize' }]}>
                    {parsedPreview.type === 'card_purchase' ? 'Compra Tarjeta' : parsedPreview.type}
                  </Text>
                </View>
              </View>
            ) : (
              notificationText.length > 5 && (
                <View style={styles.warningBox}>
                  <CustomIcon name="AlertCircle" size={14} color="#F59E0B" />
                  <Text style={styles.warningText}>
                    No se detectó un valor claro. Asegúrate de incluir el símbolo $ y el monto.
                  </Text>
                </View>
              )
            )}

            {/* Botón de Aplicar */}
            <TouchableOpacity
              style={[styles.applyBtn, !parsedPreview && styles.applyBtnDisabled]}
              disabled={!parsedPreview}
              onPress={handleApplyParsed}
            >
              <CustomIcon name="ArrowRight" size={16} color="#FFFFFF" />
              <Text style={styles.applyBtnText}>Cargar Gasto al Formulario</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  islandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B4B',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#4338CA',
    gap: 8,
    elevation: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  islandPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  islandContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  islandText: {
    color: '#E0E7FF',
    fontSize: 12,
    fontWeight: '700',
  },
  islandBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.4)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  islandBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: Theme.colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sparkleBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tag: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  closeBtn: {
    backgroundColor: Theme.colors.surfaceElevated,
    padding: 6,
    borderRadius: 16,
  },
  instruction: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 18,
  },
  textArea: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 12,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 13,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  sampleLabel: {
    color: '#64748B',
    fontSize: 11,
    marginBottom: 6,
  },
  samplesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  sampleChip: {
    backgroundColor: Theme.colors.surfaceCard,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sampleChipText: {
    color: '#818CF8',
    fontSize: 11,
  },
  previewCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  previewTitle: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: 'bold',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  previewLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  previewVal: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
    gap: 6,
  },
  warningText: {
    color: '#FBBF24',
    fontSize: 11,
    flex: 1,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  applyBtnDisabled: {
    opacity: 0.4,
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
