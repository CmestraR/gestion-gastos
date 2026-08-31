# Handoff Técnico para la Siguiente Revisión (Fase 1)

## 📌 Propósito de este Documento
Este archivo sirve como resumen técnico de entrega rápida para que otro asistente, desarrollador o IA pueda verificar el estado del proyecto sin tener que leer todo el código fuente.

---

## 🏛️ Arquitectura Actual
- **Núcleo de Efectos:** [financialCore.ts](file:///c:/Users/siste/Documents/+Cristian%20Mestra/+gestion_gatos/gestion-gastos/src/utils/financialCore.ts)  
  Contiene `evaluateTransactionEffects()`, `calculateMonthlyConsumption()`, `calculateMonthlyCashFlow()`, `calculateConsolidatedNetWorth()`.
- **Manejo Matemático:** [financialMath.ts](file:///c:/Users/siste/Documents/+Cristian%20Mestra/+gestion_gatos/gestion-gastos/src/utils/financialMath.ts)  
  Amortización Francesa con residuo exacto en cuota $N$, conversión E.A. a E.M., y ciclo de facturación de tarjetas activo.
- **Acceso a Base de Datos:** [transactionRepository.ts](file:///c:/Users/siste/Documents/+Cristian%20Mestra/+gestion_gatos/gestion-gastos/src/database/repositories/transactionRepository.ts) y [cardRepository.ts](file:///c:/Users/siste/Documents/+Cristian%20Mestra/+gestion_gatos/gestion-gastos/src/database/repositories/cardRepository.ts)  
  Todas las mutaciones multi-tabla protegidas con `db.withTransactionAsync`.
- **Versionado y Actualizaciones:** [updateService.ts](file:///c:/Users/siste/Documents/+Cristian%20Mestra/+gestion_gatos/gestion-gastos/src/utils/updateService.ts) y [SettingsScreen.tsx](file:///c:/Users/siste/Documents/+Cristian%20Mestra/+gestion_gatos/gestion-gastos/src/screens/SettingsScreen.tsx).

---

## 🧪 Pruebas Automatizadas
- Ejecutar con:
  ```powershell
  npm.cmd test
  ```
- Archivo: `tests/financialEngine.test.ts` (20 pruebas unitarias con 100% de éxito).

---

## ⚠️ Reglas Críticas de Integridad y Diseño
1. **Conservar el diseño glassmorphic actual:** Usar siempre tokens de `Theme.ts`, `CustomIcon.tsx` y `CustomAlertModal.tsx`.
2. **Nunca hacer `DROP TABLE`:** Todas las migraciones deben ser aditivas con `ALTER TABLE ... ADD COLUMN` envuelto en `try/catch`.
3. **Mantener transacciones atómicas:** Envolver cualquier nueva operación multi-tabla en `db.withTransactionAsync`.
4. **SemVer 1.0.1:** La versión del código ha sido incrementada a `1.0.1`.
