import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { CustomIcon } from './CustomIcon';
import { Theme } from './Theme';

interface ColorPickerModalProps {
  visible: boolean;
  initialColor?: string;
  onClose: () => void;
  onSelectColor: (color: string) => void;
}

// Matriz de espectro cromático: 14 familias de colores con 6 niveles de luminosidad/saturación cada una
const SPECTRUM_MATRIX: { name: string; shades: string[] }[] = [
  {
    name: 'Rojos',
    shades: ['#FECDD3', '#FDA4AF', '#FB7185', '#F43F5E', '#E11D48', '#BE123C'],
  },
  {
    name: 'Coral / Fresa',
    shades: ['#FFEDD5', '#FDBA74', '#FB923C', '#F97316', '#EA580C', '#C2410C'],
  },
  {
    name: 'Ámbar / Oro',
    shades: ['#FEF3C7', '#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B', '#D97706'],
  },
  {
    name: 'Amarillos',
    shades: ['#FEF08A', '#FDE047', '#FDDA24', '#EAB308', '#CA8A04', '#A16207'],
  },
  {
    name: 'Limas / Neón',
    shades: ['#D9F99D', '#BEF264', '#A3E635', '#84CC16', '#65A30D', '#4D7C0F'],
  },
  {
    name: 'Esmeraldas / Verdes',
    shades: ['#A7F3D0', '#6EE7B7', '#34D399', '#10B981', '#059669', '#047857'],
  },
  {
    name: 'Teal / Menta',
    shades: ['#99F6E4', '#5EEAD4', '#2DD4BF', '#14B8A6', '#0D9488', '#0F766E'],
  },
  {
    name: 'Cian / Daviplata',
    shades: ['#A5F3FC', '#67E8F9', '#22D3EE', '#06B6D4', '#0891B2', '#0E7490'],
  },
  {
    name: 'Azul Cielo',
    shades: ['#BAE6FD', '#7DD3FC', '#38BDF8', '#0EA5E9', '#0284C7', '#0369A1'],
  },
  {
    name: 'Azul Real',
    shades: ['#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8'],
  },
  {
    name: 'Índigo',
    shades: ['#C7D2FE', '#A5B4FC', '#818CF8', '#6366F1', '#4F46E5', '#4338CA'],
  },
  {
    name: 'Morado / Nu',
    shades: ['#DDD6FE', '#C4B5FD', '#A78BFA', '#8B5CF6', '#820AD1', '#6D28D9'],
  },
  {
    name: 'Magenta / Nequi',
    shades: ['#F5D0FE', '#F0ABFC', '#E879F9', '#D62886', '#C026D3', '#A21CAF'],
  },
  {
    name: 'Rosados',
    shades: ['#FBCFE8', '#F9A8D4', '#F472B6', '#EC4899', '#DB2777', '#BE185D'],
  },
  {
    name: 'Neutros / Slates',
    shades: ['#E2E8F0', '#CBD5E1', '#94A3B8', '#64748B', '#334155', '#0F172A'],
  },
];

// Presets de Bancos & Billeteras Populares
const POPULAR_FINTECH_PRESETS = [
  { name: 'Nu', color: '#820AD1' },
  { name: 'Nequi', color: '#D62886' },
  { name: 'Bancolombia', color: '#FDDA24' },
  { name: 'Lulo', color: '#10B981' },
  { name: 'Davivienda', color: '#ED1C24' },
  { name: 'Daviplata', color: '#06B6D4' },
  { name: 'RappiPay', color: '#F97316' },
  { name: 'Black', color: '#0F172A' },
];

export const ColorPickerModal: React.FC<ColorPickerModalProps> = ({
  visible,
  initialColor = '#3B82F6',
  onClose,
  onSelectColor,
}) => {
  const [currentColor, setCurrentColor] = useState(initialColor);
  const [hexInput, setHexInput] = useState(initialColor);

  useEffect(() => {
    if (visible) {
      setCurrentColor(initialColor);
      setHexInput(initialColor);
    }
  }, [visible, initialColor]);

  const isValidHex = (hex: string) => /^#[0-9A-Fa-f]{6}$/.test(hex.trim());

  const handleHexChange = (val: string) => {
    let formatted = val.trim();
    if (formatted.length > 0 && !formatted.startsWith('#')) {
      formatted = '#' + formatted;
    }
    setHexInput(formatted);
    if (isValidHex(formatted)) {
      setCurrentColor(formatted);
    }
  };

  const handleSelectAndConfirm = (color: string) => {
    setCurrentColor(color);
    setHexInput(color);
  };

  const handleApply = () => {
    const finalColor = isValidHex(hexInput) ? hexInput : currentColor;
    onSelectColor(finalColor);
    onClose();
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
              <Text style={styles.tag}>PALETA DE COLORES</Text>
              <Text style={styles.title}>Seleccionar Color</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CustomIcon name="X" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 25 }}>
            {/* Visualizador Principal de Color Seleccionado */}
            <View style={styles.previewCard}>
              <View style={[styles.largeColorCircle, { backgroundColor: currentColor }]}>
                <CustomIcon name="Check" size={22} color="#FFFFFF" />
              </View>
              <View style={styles.previewDetails}>
                <Text style={styles.previewLabel}>Color Activo</Text>
                <Text style={styles.previewHex}>{currentColor.toUpperCase()}</Text>
                <Text style={styles.previewSub}>Toca cualquier tono del espectro o escribe el código</Text>
              </View>
            </View>

            {/* Presets Rápidos de Bancos */}
            <Text style={styles.sectionTitle}>Bancos & Billeteras Populares</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsRow}>
              {POPULAR_FINTECH_PRESETS.map((p) => {
                const isSelected = currentColor.toLowerCase() === p.color.toLowerCase();
                return (
                  <TouchableOpacity
                    key={p.name}
                    style={[
                      styles.presetChip,
                      isSelected && styles.presetChipSelected,
                    ]}
                    onPress={() => handleSelectAndConfirm(p.color)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.presetDot, { backgroundColor: p.color }]} />
                    <Text style={[styles.presetText, isSelected && styles.presetTextSelected]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Espectro Cromático Interactivo (Matriz 2D) */}
            <Text style={styles.sectionTitle}>Espectro de Tonos & Saturación</Text>
            <View style={styles.spectrumContainer}>
              {SPECTRUM_MATRIX.map((row) => (
                <View key={row.name} style={styles.spectrumRow}>
                  {row.shades.map((shade) => {
                    const isSelected = currentColor.toLowerCase() === shade.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={shade}
                        style={[
                          styles.spectrumCell,
                          { backgroundColor: shade },
                          isSelected && styles.spectrumCellSelected,
                        ]}
                        onPress={() => handleSelectAndConfirm(shade)}
                        activeOpacity={0.7}
                      />
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Entrada Manual de Código Hexadecimal */}
            <Text style={styles.sectionTitle}>Código Hexadecimal (#HEX)</Text>
            <View style={styles.hexInputWrapper}>
              <View style={[styles.hexMiniPreview, { backgroundColor: isValidHex(hexInput) ? hexInput : currentColor }]} />
              <TextInput
                style={styles.hexInput}
                placeholder="#3B82F6"
                placeholderTextColor="#64748B"
                value={hexInput}
                onChangeText={handleHexChange}
                maxLength={7}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>

            {/* Botón de Confirmación */}
            <TouchableOpacity style={styles.confirmBtn} onPress={handleApply} activeOpacity={0.85}>
              <CustomIcon name="Check" size={18} color="#FFFFFF" />
              <Text style={styles.confirmBtnText}>Confirmar Color</Text>
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
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 35,
    maxHeight: '90%',
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
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 14,
  },
  largeColorCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  previewDetails: {
    flex: 1,
  },
  previewLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  previewHex: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 1,
  },
  previewSub: {
    color: '#64748B',
    fontSize: 10.5,
    marginTop: 2,
  },
  sectionTitle: {
    color: '#CBD5E1',
    fontSize: 12.5,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 4,
  },
  presetsRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetChipSelected: {
    borderColor: '#FFFFFF',
    backgroundColor: '#1E293B',
  },
  presetDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  presetText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  presetTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  spectrumContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  spectrumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  spectrumCell: {
    flex: 1,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  spectrumCellSelected: {
    borderColor: '#FFFFFF',
    borderWidth: 2.5,
    transform: [{ scale: 1.1 }],
    zIndex: 10,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 6,
  },
  hexInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 6,
    paddingLeft: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
    gap: 10,
  },
  hexMiniPreview: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#475569',
  },
  hexInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    paddingVertical: 6,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
