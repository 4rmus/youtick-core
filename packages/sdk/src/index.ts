export * from './config';
export * from './types';
export * from './core/client';
export * from './auth/session';
export * from './encryption/lit';
export * from './storage/lighthouse';
export * from './contract/youtick';
export * from './utils/mpc'; // Export utilities if needed
export * from './utils/batch-transactions';

// Namespace Exports (Optional, keeping flat for now or use grouping)
import * as Lit from './encryption/lit';
import * as Near from './contract/youtick';

export { Lit, Near };
