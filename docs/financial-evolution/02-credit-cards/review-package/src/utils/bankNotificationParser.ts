import { TransactionType } from '../types/finance';

export interface ParsedBankMessage {
  bankName: string;
  type: TransactionType;
  amount: number;
  description: string;
  lastFourDigits?: string;
  sourceAccountType?: string;
  date?: string;
  rawText: string;
}

/**
 * Analizador Inteligente de Notificaciones y SMS Bancarios de Colombia
 * Compatible con: Bancolombia, Nu Colombia, Nequi, Daviplata, BBVA, Falabella, etc.
 */
export function parseBankNotification(text: string): ParsedBankMessage | null {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();

  // 1. Detectar Entidad Bancaria
  let bankName = 'Banco';
  if (/bancolombia/i.test(clean)) bankName = 'Bancolombia';
  else if (/nequi/i.test(clean)) bankName = 'Nequi';
  else if (/\bnu\b|nubank/i.test(clean)) bankName = 'Nu';
  else if (/daviplata/i.test(clean)) bankName = 'Daviplata';
  else if (/davivienda/i.test(clean)) bankName = 'Davivienda';
  else if (/bbva/i.test(clean)) bankName = 'BBVA';
  else if (/falabella/i.test(clean)) bankName = 'Falabella';
  else if (/scotiabank|colpatria/i.test(clean)) bankName = 'Scotiabank';

  // 2. Extraer Monto en COP
  // Busca patrones como: $45.000, $ 120.500, por $35,000.00, COP 80.000
  const amountRegex = /(?:\$|COP\s*)\s*([\d.,]+)/i;
  const amountMatch = clean.match(amountRegex);

  let amount = 0;
  if (amountMatch && amountMatch[1]) {
    // Normalizar string de moneda colombiana: quitar puntos de miles y comas de decimales
    let rawNum = amountMatch[1].replace(/\./g, '').replace(/,/g, '.');
    // Si terminó con .00 se descartan decimales
    const parsed = parseFloat(rawNum);
    if (!isNaN(parsed) && parsed > 0) {
      amount = parsed;
    }
  }

  if (amount <= 0) {
    // Intentar buscar números solos precedidos por "por" o "de"
    const fallbackRegex = /(?:por|de|valor|monto)\s+([\d.]+)/i;
    const fallbackMatch = clean.match(fallbackRegex);
    if (fallbackMatch && fallbackMatch[1]) {
      const parsed = parseFloat(fallbackMatch[1].replace(/\./g, ''));
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
      }
    }
  }

  if (amount <= 0) return null;

  // 3. Determinar Tipo de Transacción
  let type: TransactionType = 'expense';
  if (/transferencia a|enviaste|traspaso|envio a/i.test(clean)) {
    type = 'transfer';
  } else if (/recibiste|te transfirieron|abono|consignacion|pago de nomina|rendimientos/i.test(clean)) {
    type = 'income';
  } else if (/tarjeta de credito|t\.cred|compra t\.c|credito/i.test(clean)) {
    type = 'card_purchase';
  } else if (/compra|pago|debito/i.test(clean)) {
    type = 'expense';
  }

  // 4. Extraer Comercio o Destinatario
  let description = 'Gasto Bancario';
  const merchantMatch = clean.match(/(?:en|a)\s+([A-Z0-9\s._\-&]+?)(?:\s+el|\s+con|\s+por|\s+desde|\.|$)/i);
  if (merchantMatch && merchantMatch[1]) {
    const rawDesc = merchantMatch[1].trim();
    if (rawDesc.length > 2 && !/^(la|el|tu|su|un|una)$/i.test(rawDesc)) {
      description = rawDesc.substring(0, 30);
    }
  } else if (type === 'transfer') {
    description = `Transferencia desde ${bankName}`;
  } else if (type === 'income') {
    description = `Ingreso en ${bankName}`;
  } else {
    description = `Compra ${bankName}`;
  }

  // 5. Extraer últimos 4 dígitos
  let lastFourDigits: string | undefined;
  const digitsMatch = clean.match(/(?:\*|t\.|cta|tarjeta)\s*(\d{4})/i);
  if (digitsMatch && digitsMatch[1]) {
    lastFourDigits = digitsMatch[1];
  }

  return {
    bankName,
    type,
    amount,
    description,
    lastFourDigits,
    rawText: clean,
  };
}
