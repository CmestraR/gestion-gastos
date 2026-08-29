import { Category } from '../types/finance';

/**
 * Normaliza un texto removiendo acentos, puntuación y convirtiendo a minúsculas
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quita tildes
    .replace(/[^a-z0-9\s]/g, ' ') // Quita símbolos
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Modelo de IA / Clasificador Semántico Local
 * Determina la categoría más probable a partir del texto o descripción de la compra
 */
export function predictCategory(
  description: string,
  categories: Category[],
  type: 'expense' | 'income' = 'expense'
): Category | null {
  if (!description || !categories || categories.length === 0) return null;

  const normalizedDesc = normalizeText(description);
  const words = normalizedDesc.split(' ').filter((w) => w.length > 1);

  let bestMatch: Category | null = null;
  let highestScore = 0;

  // Filtrar categorías que coincidan con el tipo de transacción
  const candidateCategories = categories.filter((c) => c.type === type);

  for (const cat of candidateCategories) {
    let score = 0;
    const catNameNorm = normalizeText(cat.name);

    // 1. Coincidencia directa con el nombre de la categoría
    if (normalizedDesc.includes(catNameNorm)) {
      score += 10;
    }

    // 2. Coincidencia con palabras clave (Keywords) configuradas por el usuario
    if (cat.keywords && cat.keywords.length > 0) {
      for (const kw of cat.keywords) {
        const kwNorm = normalizeText(kw);
        if (!kwNorm) continue;

        if (normalizedDesc.includes(kwNorm)) {
          // Coincidencia exacta de frase o palabra
          score += 15;
        } else {
          // Coincidencia por palabras individuales
          const kwWords = kwNorm.split(' ');
          for (const kww of kwWords) {
            if (words.includes(kww)) {
              score += 5;
            }
          }
        }
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = cat;
    }
  }

  // Retornar coincidencia si el puntaje mínimo es significativo
  return highestScore >= 5 ? bestMatch : null;
}
