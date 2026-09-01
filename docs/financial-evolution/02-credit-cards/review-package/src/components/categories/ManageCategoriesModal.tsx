import React, { useState } from 'react';
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
import { Category } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';

interface ManageCategoriesModalProps {
  visible: boolean;
  onClose: () => void;
}

const ICONS = [
  'Utensils',
  'Car',
  'Home',
  'ShoppingBag',
  'Film',
  'HeartPulse',
  'GraduationCap',
  'Tv',
  'CreditCard',
  'Briefcase',
  'Laptop',
  'TrendingUp',
  'Gift',
  'Coffee',
  'Plane',
  'Dumbbell',
  'Tag',
  'Sparkles',
];

const COLORS = [
  '#F97316', // Orange
  '#3B82F6', // Blue
  '#10B981', // Green
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#EF4444', // Red
  '#06B6D4', // Cyan
  '#F59E0B', // Amber
  '#6366F1', // Indigo
  '#64748B', // Slate
];

export const ManageCategoriesModal: React.FC<ManageCategoriesModalProps> = ({
  visible,
  onClose,
}) => {
  const { categories, addCategory, deleteCategory } = useFinancial();
  const { showSuccess, showWarning, showConfirm, showError } = useAlert();
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  const [isCreating, setIsCreating] = useState(false);

  // New Category Form State
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState(ICONS[0]);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [keywordsText, setKeywordsText] = useState('');

  const filteredCategories = categories.filter((c) => c.type === activeTab);

  const handleSaveCategory = async () => {
    if (!name.trim()) {
      showWarning('Campo Requerido', 'Por favor ingresa un nombre para la categoría.');
      return;
    }

    // Convertir palabras clave separadas por comas en array limpio
    const keywords = keywordsText
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0);

    const newCat: Category = {
      id: `cat-custom-${Date.now()}`,
      name: name.trim(),
      type: activeTab,
      icon: selectedIcon,
      color: selectedColor,
      keywords,
      isDefault: false,
    };

    try {
      await addCategory(newCat);
      showSuccess('¡Categoría Creada!', `La categoría "${name}" y sus palabras clave fueron guardadas.`);
      setName('');
      setKeywordsText('');
      setIsCreating(false);
    } catch (e) {
      showError('Error', 'No se pudo guardar la categoría.');
    }
  };

  const handleDelete = (cat: Category) => {
    if (cat.isDefault) {
      showWarning('Categoría Protegida', 'Las categorías predeterminadas del sistema no se pueden eliminar.');
      return;
    }

    showConfirm(
      'Eliminar Categoría',
      `¿Deseas eliminar la categoría personalizada "${cat.name}"?`,
      async () => {
        await deleteCategory(cat.id);
        showSuccess('Categoría Eliminada', `La categoría "${cat.name}" fue eliminada.`);
      },
      'Eliminar',
      'Cancelar',
      true
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
              <Text style={styles.tag}>INTELIGENCIA & REGLAS</Text>
              <Text style={styles.title}>Categorías & Palabras Clave</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <CustomIcon name="X" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Toggle Gastos vs Ingresos */}
          <View style={styles.typeToggleRow}>
            <TouchableOpacity
              style={[styles.typeToggleBtn, activeTab === 'expense' && styles.typeToggleBtnActive]}
              onPress={() => {
                setActiveTab('expense');
                setIsCreating(false);
              }}
            >
              <Text style={[styles.typeToggleText, activeTab === 'expense' && styles.typeToggleTextActive]}>
                Categorías de Gastos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeToggleBtn, activeTab === 'income' && styles.typeToggleBtnActive]}
              onPress={() => {
                setActiveTab('income');
                setIsCreating(false);
              }}
            >
              <Text style={[styles.typeToggleText, activeTab === 'income' && styles.typeToggleTextActive]}>
                Categorías de Ingresos
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            {/* Banner Informativo sobre IA */}
            <View style={styles.infoBanner}>
              <CustomIcon name="Sparkles" size={16} color="#818CF8" />
              <Text style={styles.infoBannerText}>
                La IA asigna automáticamente la categoría analizando el texto del gasto y las palabras clave que le configures.
              </Text>
            </View>

            {/* Formulario Crear Nueva Categoría */}
            {isCreating ? (
              <View style={styles.createCard}>
                <Text style={styles.createCardTitle}>Nueva Categoría ({activeTab === 'expense' ? 'Gasto' : 'Ingreso'})</Text>

                <Text style={styles.fieldLabel}>Nombre de la Categoría</Text>
                <TextInput
                  style={styles.input}
                  placeholder="ej. Mascotas, Gimnasio, Cursos..."
                  placeholderTextColor="#64748B"
                  value={name}
                  onChangeText={setName}
                />

                <Text style={styles.fieldLabel}>Palabras Clave para IA (separadas por comas)</Text>
                <TextInput
                  style={[styles.input, { height: 65, textAlignVertical: 'top' }]}
                  placeholder="ej. veterinaria, concentrado, purina, petshop, wappy"
                  placeholderTextColor="#64748B"
                  multiline
                  value={keywordsText}
                  onChangeText={setKeywordsText}
                />
                <Text style={styles.helperText}>
                  Si la compra contiene alguna de estas palabras, la categoría se autocompletará al instante.
                </Text>

                {/* Selector de Icono */}
                <Text style={styles.fieldLabel}>Icono</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconsRow}>
                  {ICONS.map((ico) => {
                    const isSelected = selectedIcon === ico;
                    return (
                      <TouchableOpacity
                        key={ico}
                        style={[styles.iconChoice, isSelected && styles.iconChoiceSelected]}
                        onPress={() => setSelectedIcon(ico)}
                      >
                        <CustomIcon name={ico} size={16} color={isSelected ? '#FFFFFF' : '#94A3B8'} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Selector de Color */}
                <Text style={styles.fieldLabel}>Color</Text>
                <View style={styles.colorsRow}>
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

                <View style={styles.formActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsCreating(false)}>
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCategory}>
                    <Text style={styles.saveBtnText}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addCategoryBtn}
                onPress={() => setIsCreating(true)}
              >
                <CustomIcon name="Plus" size={16} color="#FFFFFF" />
                <Text style={styles.addCategoryBtnText}>Crear Nueva Categoría</Text>
              </TouchableOpacity>
            )}

            {/* Lista de Categorías Existentes */}
            <Text style={styles.sectionHeading}>Categorías Activas ({filteredCategories.length})</Text>

            {filteredCategories.map((cat) => (
              <View key={cat.id} style={styles.catItem}>
                <View style={styles.catItemLeft}>
                  <View style={[styles.catIconBox, { backgroundColor: cat.color + '25' }]}>
                    <CustomIcon name={cat.icon} size={16} color={cat.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.catName}>{cat.name}</Text>
                    {cat.keywords && cat.keywords.length > 0 ? (
                      <Text style={styles.catKeywords} numberOfLines={2}>
                        🔑 {cat.keywords.slice(0, 5).join(', ')}{cat.keywords.length > 5 ? '...' : ''}
                      </Text>
                    ) : (
                      <Text style={styles.catNoKeywords}>Sin palabras clave asignadas</Text>
                    )}
                  </View>
                </View>

                {!cat.isDefault && (
                  <TouchableOpacity
                    style={styles.deleteCatBtn}
                    onPress={() => handleDelete(cat)}
                  >
                    <CustomIcon name="Trash2" size={14} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <View style={{ height: 60 }} />
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
    height: '90%',
    marginBottom: 0,
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
  },
  closeBtn: {
    backgroundColor: Theme.colors.surfaceElevated,
    padding: 6,
    borderRadius: 20,
  },
  typeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },
  typeToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeToggleBtnActive: {
    backgroundColor: '#6366F1',
  },
  typeToggleText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  typeToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: '#6366F1',
    borderRadius: 12,
    padding: 10,
    gap: 8,
    alignItems: 'center',
    marginBottom: 14,
  },
  infoBannerText: {
    color: '#C7D2FE',
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  addCategoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    marginBottom: 16,
  },
  addCategoryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  createCard: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  createCardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  fieldLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  helperText: {
    color: '#64748B',
    fontSize: 10,
    marginTop: -6,
    marginBottom: 12,
  },
  iconsRow: {
    marginBottom: 12,
  },
  iconChoice: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  iconChoiceSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#818CF8',
  },
  colorsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotSelected: {
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.15 }],
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#94A3B8',
    fontWeight: 'bold',
    fontSize: 13,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: '#6366F1',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  sectionHeading: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  catItem: {
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
  catItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  catIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  catKeywords: {
    color: '#818CF8',
    fontSize: 11,
    marginTop: 2,
  },
  catNoKeywords: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
  deleteCatBtn: {
    padding: 8,
  },
});
