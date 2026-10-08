import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CHECKOUT_PORT } from '../../common/ports/checkout.port.js';
import type { AppConfig } from '../../config/configuration.js';
import { CharactersModule } from '../characters/characters.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { UsersModule } from '../users/users.module.js';
import { CheckoutReconciler } from './checkout-reconciler.service.js';
import { CheckoutService } from './checkout.service.js';
import { PaymentEntity } from './entities/payment.entity.js';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateways/payment-gateway.interface.js';
import { PaystackClient } from './gateways/paystack.client.js';
import { SandboxGateway } from './gateways/sandbox.gateway.js';
import { PaymentsSandboxController } from './payments-sandbox.controller.js';
import { PaymentsController } from './payments.controller.js';
import { PaystackWebhookController } from './paystack-webhook.controller.js';
import { PaystackWebhookService } from './paystack-webhook.service.js';
import { TopupCreditor } from './topup-creditor.service.js';
import { TopupsService } from './topups.service.js';

/**
 * Real-money payments: a generic Paystack checkout (`CHECKOUT_PORT`) plus top-ups as its first purpose.
 * Imports only core modules (simulation, characters, users), so any domain can import this module to sell things
 * for real money without creating a cycle.
 */
@Module({
  imports: [SimulationModule, CharactersModule, UsersModule, TypeOrmModule.forFeature([PaymentEntity])],
  controllers: [PaymentsController, PaymentsSandboxController, PaystackWebhookController],
  providers: [
    PaystackClient,
    SandboxGateway,
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService, PaystackClient, SandboxGateway],
      useFactory: (config: ConfigService<AppConfig, true>, paystack: PaystackClient, sandbox: SandboxGateway): PaymentGateway =>
        config.get('paystack', { infer: true }).sandbox ? sandbox : paystack,
    },
    CheckoutService,
    { provide: CHECKOUT_PORT, useExisting: CheckoutService },
    CheckoutReconciler,
    PaystackWebhookService,
    TopupCreditor,
    TopupsService,
  ],
  exports: [CHECKOUT_PORT, CheckoutService],
})
export class PaymentsModule {}
