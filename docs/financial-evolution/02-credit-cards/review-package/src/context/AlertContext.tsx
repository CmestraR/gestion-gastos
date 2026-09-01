import React, { createContext, useContext, useState, useCallback } from 'react';
import { CustomAlertModal, CustomAlertOptions, AlertType, AlertButton } from '../components/common/CustomAlertModal';

interface AlertContextType {
  showAlert: (options: CustomAlertOptions) => void;
  showSuccess: (title: string, message: string, onOk?: () => void) => void;
  showError: (title: string, message: string) => void;
  showWarning: (title: string, message: string) => void;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText?: string,
    cancelText?: string,
    isDestructive?: boolean
  ) => void;
  hideAlert: () => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alertOptions, setAlertOptions] = useState<CustomAlertOptions | null>(null);
  const [visible, setVisible] = useState(false);

  const showAlert = useCallback((options: CustomAlertOptions) => {
    setAlertOptions(options);
    setVisible(true);
  }, []);

  const hideAlert = useCallback(() => {
    setVisible(false);
  }, []);

  const showSuccess = useCallback((title: string, message: string, onOk?: () => void) => {
    showAlert({
      title,
      message,
      type: 'success',
      buttons: [
        {
          text: 'Continuar',
          style: 'default',
          onPress: onOk,
        },
      ],
    });
  }, [showAlert]);

  const showError = useCallback((title: string, message: string) => {
    showAlert({
      title,
      message,
      type: 'error',
      buttons: [{ text: 'Entendido', style: 'default' }],
    });
  }, [showAlert]);

  const showWarning = useCallback((title: string, message: string) => {
    showAlert({
      title,
      message,
      type: 'warning',
      buttons: [{ text: 'Entendido', style: 'default' }],
    });
  }, [showAlert]);

  const showConfirm = useCallback((
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText: string = 'Confirmar',
    cancelText: string = 'Cancelar',
    isDestructive: boolean = false
  ) => {
    showAlert({
      title,
      message,
      type: isDestructive ? 'warning' : 'confirm',
      buttons: [
        {
          text: cancelText,
          style: 'cancel',
        },
        {
          text: confirmText,
          style: isDestructive ? 'destructive' : 'default',
          onPress: onConfirm,
        },
      ],
    });
  }, [showAlert]);

  return (
    <AlertContext.Provider
      value={{
        showAlert,
        showSuccess,
        showError,
        showWarning,
        showConfirm,
        hideAlert,
      }}
    >
      {children}
      <CustomAlertModal
        visible={visible}
        options={alertOptions}
        onClose={hideAlert}
      />
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};
