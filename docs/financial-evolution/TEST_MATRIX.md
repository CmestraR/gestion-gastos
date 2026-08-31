# Matriz de Pruebas Financieras (Fases 1 & 1.1)

**Ubicación del Archivo de Tests:** `tests/financialEngine.test.ts`  
**Comando de Ejecución:** `npm.cmd test`  
**Resultado Global:** `20 tests passed, 0 failed, 4 suites` (100% de éxito).

---

## 1. Pruebas Unitarias [UNIT] (Lógica y Matemática Pura)

| ID | Caso de Prueba | Entrada / Escenario | Resultado Esperado | Tipo | Estado |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **U01** | Ingreso Ordinario | `amount: 1.000.000` | Activos +1M, Caja +1M, Patrimonio +1M | UNIT | `PASS` |
| **U02** | Gasto Corriente | `amount: 1.000.000` | Consumo +1M, Activos -1M, Patrimonio -1M | UNIT | `PASS` |
| **U03** | Gasto con 4x1000 | `amount: 100.000, gmf: 400` | Consumo 100.400, Activos -100.400, Patrimonio -100.400 | UNIT | `PASS` |
| **U04** | Transferencia sin GMF | `amount: 500.000` | Consumo 0, Salida Caja 0, Patrimonio neutral | UNIT | `PASS` |
| **U05** | Transferencia con 4x1000 | `amount: 1.000.000, gmf: 4.000` | Consumo 4.000, Salida Caja 4.000, Patrimonio -4.000 | UNIT | `PASS` |
| **U06** | Compra con Tarjeta | `amount: 1.200.000` | Consumo 1.2M, Pasivo +1.2M, Caja inicial 0 | UNIT | `PASS` |
| **U07** | Pago a Tarjeta | `amount: 200.000` | Consumo 0, Activos -200k, Pasivos -200k, Patrimonio neutral | UNIT | `PASS` |
| **U08** | Amortización Francesa | $100.000 a 3 cuotas con interés | $\sum principal_i \equiv 100.000$ (cuadre exacto) | UNIT | `PASS` |
| **U09** | Compra 0% Interés | 100k a 3 cuotas | $\sum principal_i \equiv 100.000$, 0 intereses | UNIT | `PASS` |
| **U10** | Días de Corte Fin de Mes | Corte 28, Pago 10 al 31-Ago | Detecta corte cerrado, $daysToPayment = 10$ días | UNIT | `PASS` |
| **U11** | Conversión Tasa E.A. a E.M. | 28.5% E.A. | Tasa mensual $\approx 2.115\%$ E.M. | UNIT | `PASS` |
| **U12** | Valores Cero o Negativos | `amount <= 0` | Manejo seguro devolviendo 0 sin NaN ni caídas | UNIT | `PASS` |

---

## 2. Pruebas de Integración [INTEGRATION] (Flujos de Negocio y Dependencias)

| ID | Caso de Prueba | Entrada / Escenario | Resultado Esperado | Tipo | Estado |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **I01** | Flujo Completo Pago a Tarjeta | Abono de $200.000 sobre deuda de $1.000.000 | Cuenta -$200k, Cupo +$200k (Deuda $800k, Cupo $4.2M). Tras DELETE: Cuenta +$200k, Cupo -$200k (Deuda $1M) | INTEGRATION | `PASS` |
| **I02** | Bloqueo de Borrado con Pagos | Compra de $1.2M con 5 cuotas pagadas | Intento de `DELETE` lanza excepción bloqueando borrado | INTEGRATION | `PASS` |
| **I03** | Reversión de Compra sin Pagos | Compra de $1.2M con 0 cuotas pagadas | Borra cuotas y restaura 100% del cupo disponible | INTEGRATION | `PASS` |
| **I04** | Consolidación de Patrimonio Neto | Abono de $200k a tarjeta | Permuta de Activo por Pasivo; Patrimonio Neto consolidado intacto | INTEGRATION | `PASS` |

---

## 3. Pruebas de Base de Datos y Transaccionalidad [DATABASE / INTEGRITY]

| ID | Caso de Prueba | Entrada / Escenario | Resultado Esperado | Tipo | Estado |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **D01** | Atomicidad en Transferencia | Error simulado en inserción destino | Rollback total: cuentas origen y destino permanecen intactas | DATABASE | `PASS` |
| **D02** | Atomicidad en Compra a Cuotas | Error simulado en cuotas | Rollback total: cupo de tarjeta permanece intacto | DATABASE | `PASS` |
| **D03** | Reversión de Transferencia + GMF | Delete de transferencia | Restituye origen (+GMF) y debita de destino (-$300k) | DATABASE | `PASS` |
| **D04** | Reversión de Gasto con GMF | Delete de gasto con 4x1000 | Restituye tanto monto principal como GMF ($50.200) | DATABASE | `PASS` |
