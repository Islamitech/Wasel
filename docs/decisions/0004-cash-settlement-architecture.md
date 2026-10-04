# ADR 0004: Cash Settlement Architecture & Subscription Platform Revenue Model

## Status
Accepted

## Context
Payment licensing, regulatory burdens, and escrow complexity can slow down early-stage marketplace operations. Furthermore, the local demographic in Hadayek al-Ahram operates overwhelmingly on cash-on-delivery.

## Decision
The platform processes **no payments, holds no customer wallets, and processes no customer-driver trip funds**:
1. All order trips and deliveries are settled in **cash between customer and driver** directly.
2. The platform's sole revenue mechanism is **driver recurring membership subscriptions**.
3. No payment gateways or escrow systems shall be built into the customer ordering or trip execution lifecycle.
4. **Subscription Fees Gateway Boundary**: Driver recurring membership plans (e.g. monthly standard, quarterly saver) are collected directly by the platform via an integrated electronic payment gateway (`PaymentProvider` with signed idempotent HMAC webhook, e.g. Paymob / Fawry / cards / Vodafone Cash) or manual administrative collection. This maintains strict operational separation between passenger/cargo trip cash settlements and platform software-as-a-service membership fee collection.

## Consequences
- **Positive**: Zero regulatory fintech overhead regarding marketplace escrow or trip payment intermediation, instantaneous driver adoption, simplicity of ride settlement transaction logic.
- **Negative**: Platform does not automatically withhold delivery percentages per ride; monetization strictly depends on driver subscription plan renewals and enforcement via automated radar gating and radar access expiration.
