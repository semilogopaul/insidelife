import { BullModule } from '@nestjs/bullmq';
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
import { FlutterwaveWebhookController } from './flutterwave-webhook.controller.js';
import { FlutterwaveWebhookService } from './flutterwave-webhook.service.js';
import { FlutterwaveClient } from './gateways/flutterwave.client.js';
import { PAYMENT_GATEWAY, type PaymentGateway } from './gateways/payment-gateway.interface.js';
import { SandboxGateway } from './gateways/sandbox.gateway.js';
import { PaymentCheckLimiter } from './payment-check-limiter.service.js';
import { PaymentsEventsProcessor } from './payments-events.processor.js';
import { PAYMENTS_QUEUE } from './payments-queue.js';
import { PaymentsSandboxController } from './payments-sandbox.controller.js';
import { PaymentsController } from './payments.controller.js';
import { TopupCreditor } from './topup-creditor.service.js';
import { TopupsService } from './topups.service.js';

/**
 * Real-money payments: a generic Flutterwave checkout (`CHECKOUT_PORT`) with refunds, plus top-ups as its first
 * purpose. Webhooks are queued on BullMQ (`payments`) and processed by `PaymentsEventsProcessor`. Imports only core
 * modules (simulation, characters, users), so any domain can import this module to sell things for real money
 * without creating a cycle.
 */
@Module({
  imports: [SimulationModule, CharactersModule, UsersModule, TypeOrmModule.forFeature([PaymentEntity]), BullModule.registerQueue({ name: PAYMENTS_QUEUE })],
  controllers: [PaymentsController, PaymentsSandboxController, FlutterwaveWebhookController],
  providers: [
    FlutterwaveClient,
    SandboxGateway,
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService, FlutterwaveClient, SandboxGateway],
      useFactory: (config: ConfigService<AppConfig, true>, flutterwave: FlutterwaveClient, sandbox: SandboxGateway): PaymentGateway =>
        config.get('payments', { infer: true }).sandbox ? sandbox : flutterwave,
    },
    PaymentCheckLimiter,
    CheckoutService,
    { provide: CHECKOUT_PORT, useExisting: CheckoutService },
    CheckoutReconciler,
    FlutterwaveWebhookService,
    PaymentsEventsProcessor,
    TopupCreditor,
    TopupsService,
  ],
  exports: [CHECKOUT_PORT, CheckoutService],
})
export class PaymentsModule {}
