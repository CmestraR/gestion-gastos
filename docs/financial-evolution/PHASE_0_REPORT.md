# INFORME DE FASE 0: VERSIONADO Y ACTUALIZACIONES (CORREGIDO FASE 1.1)
**Proyecto:** Control de Gastos (`gestion-gastos`)  
**Versión Nativa Instalada:** `1.0.0`  
**Build Number / Version Code:** `1`  
**Runtime Version Objetivo:** `1.0.0`  
**Canales EAS:** `preview` / `production`  
**Estado:** `COMPLETED`  

---

## 1. Configuración Real del Entorno
- **`app.json`:**
  - `expo.version`: `"1.0.0"` (Versión nativa del binario instalado)
  - `expo.android.versionCode`: `1` (Número de compilación nativa)
  - `expo.android.package`: `"com.cristianmestra.gestiongastos"`
  - `expo.runtimeVersion`: `{ "policy": "appVersion" }` (Evalúa estrictamente a `"1.0.0"`)
  - `expo.updates.url`: `"https://u.expo.dev/5ca294c3-faa2-49ff-ae11-94ac19ca6703"`
  - `expo.extra.eas.projectId`: `"5ca294c3-faa2-49ff-ae11-94ac19ca6703"`
- **`eas.json`:**
  - `cli.appVersionSource`: `"remote"`
  - Perfil `preview`: Canal `preview`, distribución interna, `buildType: "apk"`.
  - Perfil `production`: Canal `production`, `buildType: "apk"`.
- **`package.json`:**
  - Dependencia `"expo-updates": "~29.0.20"` integrada de forma no bloqueante.

---

## 2. Definición Clara de los Niveles de Versión

Para evitar cualquier ambigüedad en el ciclo de vida de la aplicación:

1. **NATIVE APP VERSION (`1.0.0`):** Versión comercial del binario compilado instalada en los dispositivos móviles físicos.
2. **BUILD NUMBER / VERSION CODE (`1`):** Entero incremental del compilador de Android (`versionCode: 1`) e iOS (`buildNumber: 1`).
3. **RUNTIME VERSION (`1.0.0`):** Identificador de compatibilidad nativa. Con `policy: "appVersion"`, debe mantenerse en `"1.0.0"` para que los 3 teléfonos instalados reciban los parches OTA.
4. **OTA UPDATE / REVISION:** Identificador único (UUID) y marca temporal generados por EAS al publicar un parche (`Update 3b421a...`).

---

## 3. Criterio Real: OTA Update vs. Nuevo Build Nativo

La decisión técnica de distribuir un cambio vía **OTA (EAS Update)** o mediante un **Nuevo Build Nativo (`eas build`)** depende estrictamente de la **COMPATIBILIDAD DEL RUNTIME NATIVO**, no de la convención SemVer:

- **Se distribuye vía OTA (`eas update --channel preview`):**
  - Cualquier cambio en lógica TypeScript/JavaScript, pantallas, componentes React, consultas SQLite, correcciones matemáticas y estilos que NO altere dependencias nativas ni permisos en el manifiesto.
  - *Nota:* Tanto parches (`PATCH`) como nuevas pantallas (`MINOR`) pueden viajar por OTA si el runtime nativo no ha cambiado.
- **Requiere Nuevo Build Nativo (`eas build --profile preview`):**
  - Cambios en librerías nativas (agregar nuevos módulos con código Java/Kotlin/Swift), cambios de versión mayor de Expo SDK, modificación de permisos de Android (`AndroidManifest.xml`) o cambios en `runtimeVersion`.

---

## 4. Procedimiento Oficial de Publicación con EAS CLI

Para publicar actualizaciones a los dispositivos instalados, el mecanismo estándar y oficial basado en canales es:

### Publicar en Canal Preview (Dispositivos de Prueba):
```powershell
npx.cmd eas-cli update --channel preview --message "Descripcion del parche financiero"
```

### Publicar en Canal Production:
```powershell
npx.cmd eas-cli update --channel production --message "Descripcion del parche para produccion"
```

*(No se utiliza `--branch` directamente como procedimiento principal para respetar el mapeo de canales en EAS).*

---

## 5. Análisis de Riesgos y Procedimiento de Rollback

**Ninguna actualización posee "0% riesgo".** Una actualización OTA puede introducir bugs lógicos, regresiones de interfaz o errores en migraciones de base de datos.

### Riesgos Identificados:
1. **Migraciones SQLite incompatibles:** Si una migración destruye columnas o asume estructuras incorrectas, la base de datos local puede quedar inaccesible.
   - *Mitigación:* Se prohíbe terminantemente `DROP TABLE`. Toda migración se realiza con `ALTER TABLE ... ADD COLUMN` envuelta en `try/catch` y `CREATE INDEX IF NOT EXISTS`.
2. **Excepciones en tiempo de ejecución:** Un bug en el bundle JS puede provocar cierres forzados.
   - *Mitigación:* Batería de pruebas automatizadas obligatorias antes de cualquier publicación (`npm.cmd test`).
3. **Estrategia de Rollback Inmediato:**
   - Si una actualización OTA introduce un error en producción, EAS permite republicar de forma instantánea el update anterior o republishing del commit estable:
     ```powershell
     npx.cmd eas-cli update:republish --channel preview
     ```

---

## 6. Comportamiento en la Interfaz (Pantalla de Ajustes y Arranque)

- **Pantalla de Ajustes (`SettingsScreen.tsx`):**
  - **Versión de Aplicación:** `v1.0.0`
  - **Compilación (Build):** `Build 1`
  - **Runtime Version:** `1.0.0`
  - **Canal EAS:** `PREVIEW` / `PRODUCTION`
  - **Revisión OTA:** Muestra `Bundle Base (v1.0.0)` si es el binario original, o `Update <id_corto>` con su fecha si es un parche descargado.
  - **Botón Manual:** Consulta el servidor bajo demanda del usuario con retroalimentación clara.

- **Comprobación en Arranque (`App.tsx`):**
  - Verificación no bloqueante con intervalo de enfriamiento (15 min) para evitar saturación de red.
  - Si hay actualización disponible, muestra modal amigable dando control al usuario (*"Actualizar Ahora"* o *"Más Tarde"*).
  - Nunca recarga la app durante operaciones de guardado ni en medio de formularios.

---

## 7. Estado Final de la Fase 0
**ESTADO:** `COMPLETED` ✅
