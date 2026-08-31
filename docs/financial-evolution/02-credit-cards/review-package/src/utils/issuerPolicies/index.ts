import type { CardIssuerId } from '../../types/finance.ts';
import type { CreditCardIssuerPolicy } from './types.ts';
import { NuPolicy } from './NuPolicy.ts';
import { BancolombiaPolicy } from './BancolombiaPolicy.ts';
import { RappiCardPolicy } from './RappiCardPolicy.ts';
import { GenericPolicy } from './GenericPolicy.ts';

export * from './types.ts';
export { NuPolicy, BancolombiaPolicy, RappiCardPolicy, GenericPolicy };

const policies: Record<CardIssuerId, CreditCardIssuerPolicy> = {
  nu: new NuPolicy(),
  bancolombia: new BancolombiaPolicy(),
  rappicard: new RappiCardPolicy(),
  generic: new GenericPolicy(),
};

/**
 * Obtiene la política de emisor correspondiente o la genérica por defecto
 */
export function getIssuerPolicy(issuerId?: string | null): CreditCardIssuerPolicy {
  if (!issuerId) return policies.generic;
  const key = issuerId.toLowerCase() as CardIssuerId;
  return policies[key] || policies.generic;
}
