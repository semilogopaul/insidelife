/**
 * Real-money payments shared by features: the "I've paid: check now" call, the game-wide recovery check that delivers
 * payments which landed while the player was away (`usePaymentRecovery`, mounted once by GameRoot) and the alerts both
 * show.
 */
export { checkPayment, paymentsApi } from './payments.api';
export {
  checkErrorAlert,
  deliveredAlert,
  isNewlyDelivered,
  isRecoverable,
  paymentChanged,
  paymentsToRecover,
  pruneChecks,
  purchaseSummary,
  RECOVERY,
  shouldScan,
  type PaymentAlert,
} from './recovery';
export { invalidateAfterPayment, usePaymentRecovery } from './use-payment-recovery';
