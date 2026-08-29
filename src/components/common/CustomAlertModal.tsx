import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { CustomIcon } from './CustomIcon';
import { Theme } from './Theme';

export type AlertType = 'success' | 'info' | 'warning' | 'error' | 'confirm';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface CustomAlertOptions {
  title: string;
  message: string;
  type?: AlertType;
  buttons?: AlertButton[];
  icon?: string;
}

interface CustomAlertModalProps {
  visible: boolean;
  options: CustomAlertOptions | null;
  onClose: () => void;
}

const { width } = Dimensions.get('window');

export const CustomAlertModal: React.FC<CustomAlertModalProps> = ({
  visible,
  options,
  onClose,
}) => {
  if (!options) return null;

  const {
    title,
    message,
    type = 'info',
    buttons = [{ text: 'Entendido', style: 'default' }],
  } = options;

  const getIconAndColor = () => {
    switch (type) {
      case 'success':
        return { icon: 'CheckCircle2', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', border: '#059669' };
      case 'warning':
        return { icon: 'AlertTriangle', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', border: '#D97706' };
      case 'error':
        return { icon: 'AlertCircle', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', border: '#DC2626' };
      case 'confirm':
        return { icon: 'HelpCircle', color: '#818CF8', bg: 'rgba(99, 102, 241, 0.15)', border: '#6366F1' };
      case 'info':
      default:
        return { icon: 'Sparkles', color: '#6366F1', bg: 'rgba(99, 102, 241, 0.15)', border: '#4F46E5' };
    }
  };

  const { icon, color, bg, border } = getIconAndColor();

  const handleButtonPress = (btn: AlertButton) => {
    onClose();
    if (btn.onPress) {
      setTimeout(() => {
        btn.onPress!();
      }, 100);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.dialogContainer, { borderColor: border + '40' }]}>
          {/* Icon Badge */}
          <View style={[styles.iconWrapper, { backgroundColor: bg, borderColor: border + '60' }]}>
            <CustomIcon name={options.icon || icon} size={28} color={color} />
          </View>

          {/* Title & Message */}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {/* Action Buttons */}
          <View style={[styles.buttonsRow, buttons.length > 2 && styles.buttonsCol]}>
            {buttons.map((btn, index) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';

              return (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.8}
                  style={[
                    styles.button,
                    isCancel && styles.cancelButton,
                    isDestructive && styles.destructiveButton,
                    !isCancel && !isDestructive && styles.primaryButton,
                    buttons.length === 2 && { flex: 1 },
                  ]}
                  onPress={() => handleButtonPress(btn)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isCancel && styles.cancelButtonText,
                      isDestructive && styles.destructiveButtonText,
                      !isCancel && !isDestructive && styles.primaryButtonText,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dialogContainer: {
    width: '100%',
    maxWidth: width - 48,
    backgroundColor: '#0F172A',
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 25,
  },
  iconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  message: {
    color: '#94A3B8',
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 6,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  buttonsCol: {
    flexDirection: 'column',
  },
  button: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#6366F1',
    flex: 1,
  },
  cancelButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  destructiveButton: {
    backgroundColor: '#EF4444',
    flex: 1,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  cancelButtonText: {
    color: '#94A3B8',
  },
  destructiveButtonText: {
    color: '#FFFFFF',
  },
});
