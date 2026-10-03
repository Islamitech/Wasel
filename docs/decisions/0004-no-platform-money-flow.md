# ADR 0004: No Platform Direct Money Flow (Zero In-App Wallet)

## Status
Accepted

## Context
Payment licensing, regulatory burdens, and escrow complexity can slow down early-stage marketplace operations. Furthermore, the local demographic in Hadayek al-Ahram operates overwhelmingly on cash-on-delivery.

## Decision
The platform processes **no payments, holds no customer wallets, and processes no customer-driver funds**:
1. All order trips and deliveries are settled in **cash between customer and driver** directly.
2. The platform's sole revenue mechanism is **driver recurring subscriptions**.
3. No payment gateways or escrow systems shall be built into the ordering lifecycle.

## Consequences
- **Positive**: Zero regulatory fintech overhead, instantaneous driver adoption, simplicity of transaction logic.
- **Negative**: Platform does not automatically withhold delivery percentages per ride; monetization strictly depends on driver subscription plan renewals and enforcement.
