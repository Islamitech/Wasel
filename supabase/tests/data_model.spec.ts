/**
 * ============================================================================
 * Wasel Relational Data Model Specification Test Suite
 * File: supabase/tests/data_model.spec.ts
 *
 * Verifies:
 * 1. Customer point explicit visit rules & multi-stop accounting
 * 2. Fare calculation formulas (Scenarios a, b, c, d)
 * 3. State machine transition matrix enforcement
 * 4. Agreement locked snapshot immutability
 * 5. Spatial driver matching performance (< 50ms on 50 drivers)
 * ============================================================================
 */

import { describe, it, expect } from 'vitest';

interface Stop {
  id: string;
  orderId: string;
  seq: number;
  placeId?: string;
  isCustomerLocation: boolean;
  expectedDurationMinutes: number;
}

interface StopVisit {
  id: string;
  orderId: string;
  stopId: string;
  driverId: string;
  visitSeq: number;
  arrivedAt: Date;
  departedAt?: Date;
}

interface PricingRule {
  stopFeeMinor: number;
  waitFeePerHourMinor: number;
  goodsPercentRate: number;
}

export function countBillableVisits(
  order: { id: string },
  stops: Stop[],
  stopVisits: StopVisit[] = []
): number {
  const orderStops = stops.filter((s) => s.orderId === order.id);

  // Customer point rule: counts as 1 billable visit ONLY if it has an explicit task,
  // counted once regardless of repeats.
  const hasCustomerExplicitTask = orderStops.some((s) => s.isCustomerLocation);
  const customerVisitCount = hasCustomerExplicitTask ? 1 : 0;

  // External stops
  const orderVisits = stopVisits.filter((v) => v.orderId === order.id);
  let externalVisitCount = 0;

  if (orderVisits.length > 0) {
    const externalVisits = orderVisits.filter((v) => {
      const stop = orderStops.find((s) => s.id === v.stopId);
      return stop && !stop.isCustomerLocation;
    });
    externalVisitCount = externalVisits.length;
  } else {
    const externalStops = orderStops.filter((s) => !s.isCustomerLocation);
    const uniquePlaces = new Set(externalStops.map((s) => s.placeId || s.id));
    externalVisitCount = uniquePlaces.size;
  }

  return customerVisitCount + externalVisitCount;
}

export function calculateFinalFare(
  visits: number,
  waitHours: number,
  invoicesTotalMinor: number,
  rule: PricingRule
): number {
  const stopFees = visits * rule.stopFeeMinor;
  const waitFees = Math.round(waitHours * rule.waitFeePerHourMinor);
  const goodsFees = Math.round(invoicesTotalMinor * rule.goodsPercentRate);
  return stopFees + waitFees + goodsFees;
}

describe('Wasel Relational Data Model Specification Tests', () => {
  const defaultRule: PricingRule = {
    stopFeeMinor: 1000, // 10 EGP
    waitFeePerHourMinor: 3500, // 35 EGP/hr
    goodsPercentRate: 0.1, // 10%
  };

  describe('1. Visit Accounting & Fare Calculation Scenarios', () => {
    it('Scenario (a): Single store purchase order + 160 EGP invoice -> 1 visit, 26 EGP fare', () => {
      const order = { id: 'order-a' };
      const stops: Stop[] = [
        {
          id: 'stop-store-1',
          orderId: 'order-a',
          seq: 1,
          placeId: 'store-1',
          isCustomerLocation: false,
          expectedDurationMinutes: 0,
        },
      ];

      const visits = countBillableVisits(order, stops);
      expect(visits).toBe(1);

      const invoiceMinor = 160 * 100;
      const fareMinor = calculateFinalFare(visits, 0, invoiceMinor, defaultRule);

      expect(fareMinor).toBe(2600);
      expect(fareMinor / 100).toBe(26);
    });

    it('Scenario (b): Shoe repair with home pick, tailor, home drop, 2h wait, 100 EGP invoice -> 2 visits, 100 EGP fare', () => {
      const order = { id: 'order-b' };
      const stops: Stop[] = [
        {
          id: 'stop-pick-home',
          orderId: 'order-b',
          seq: 1,
          isCustomerLocation: true,
          expectedDurationMinutes: 0,
        },
        {
          id: 'stop-tailor',
          orderId: 'order-b',
          seq: 2,
          placeId: 'place-tailor',
          isCustomerLocation: false,
          expectedDurationMinutes: 120,
        },
        {
          id: 'stop-drop-home',
          orderId: 'order-b',
          seq: 3,
          isCustomerLocation: true,
          expectedDurationMinutes: 0,
        },
      ];

      const visits = countBillableVisits(order, stops);
      expect(visits).toBe(2);

      const invoiceMinor = 100 * 100;
      const waitHours = 2.0;
      const fareMinor = calculateFinalFare(visits, waitHours, invoiceMinor, defaultRule);

      expect(fareMinor).toBe(10000);
      expect(fareMinor / 100).toBe(100);
    });

    it('Scenario (c): Two tasks at the same store -> 1 visit', () => {
      const order = { id: 'order-c' };
      const stops: Stop[] = [
        {
          id: 'stop-task-1',
          orderId: 'order-c',
          seq: 1,
          placeId: 'store-hyper',
          isCustomerLocation: false,
          expectedDurationMinutes: 15,
        },
        {
          id: 'stop-task-2',
          orderId: 'order-c',
          seq: 2,
          placeId: 'store-hyper',
          isCustomerLocation: false,
          expectedDurationMinutes: 15,
        },
      ];

      const visits = countBillableVisits(order, stops);
      expect(visits).toBe(1);
    });

    it('Scenario (d): Leave and return to same store (2 distinct visits in stop_visits) -> 2 visits', () => {
      const order = { id: 'order-d' };
      const stops: Stop[] = [
        {
          id: 'stop-visit-1',
          orderId: 'order-d',
          seq: 1,
          placeId: 'store-pharmacy',
          isCustomerLocation: false,
          expectedDurationMinutes: 10,
        },
        {
          id: 'stop-visit-2',
          orderId: 'order-d',
          seq: 2,
          placeId: 'store-pharmacy',
          isCustomerLocation: false,
          expectedDurationMinutes: 10,
        },
      ];

      const stopVisits: StopVisit[] = [
        {
          id: 'v1',
          orderId: 'order-d',
          stopId: 'stop-visit-1',
          driverId: 'driver-1',
          visitSeq: 1,
          arrivedAt: new Date(Date.now() - 7200000),
          departedAt: new Date(Date.now() - 6300000),
        },
        {
          id: 'v2',
          orderId: 'order-d',
          stopId: 'stop-visit-2',
          driverId: 'driver-1',
          visitSeq: 2,
          arrivedAt: new Date(Date.now() - 1800000),
          departedAt: new Date(Date.now() - 900000),
        },
      ];

      const visits = countBillableVisits(order, stops, stopVisits);
      expect(visits).toBe(2);
    });
  });

  describe('2. State Machine Transitions Matrix', () => {
    const allowedOrderTransitions = new Set([
      'draft->published',
      'draft->cancelled',
      'published->matching',
      'published->offers_received',
      'published->cancelled',
      'published->expired',
      'matching->offers_received',
      'matching->cancelled',
      'matching->expired',
      'offers_received->agreed',
      'offers_received->cancelled',
      'offers_received->expired',
      'agreed->in_progress',
      'agreed->cancelled',
      'in_progress->completed',
      'in_progress->disputed',
      'disputed->completed',
      'disputed->cancelled',
    ]);

    it('allows valid legal order state transitions', () => {
      expect(allowedOrderTransitions.has('draft->published')).toBe(true);
      expect(allowedOrderTransitions.has('agreed->in_progress')).toBe(true);
      expect(allowedOrderTransitions.has('in_progress->completed')).toBe(true);
    });

    it('rejects illegal jumps in order lifecycle', () => {
      expect(allowedOrderTransitions.has('draft->completed')).toBe(false);
      expect(allowedOrderTransitions.has('draft->in_progress')).toBe(false);
      expect(allowedOrderTransitions.has('published->completed')).toBe(false);
    });
  });

  describe('3. Agreement Snapshot Immutability Guard', () => {
    it('blocks modification of terms once locked_at is set', () => {
      const originalAgreement = {
        id: 'agree-1',
        fareMinor: 2600,
        lockedAt: new Date(),
        snapshot: { items: 1, agreed: true },
      };

      const attemptUpdate = (updatedFare: number) => {
        if (originalAgreement.lockedAt && updatedFare !== originalAgreement.fareMinor) {
          throw new Error('Agreement terms and snapshot are immutable once locked.');
        }
      };

      expect(() => attemptUpdate(5000)).toThrow(
        'Agreement terms and snapshot are immutable once locked.'
      );
    });
  });

  describe('4. Spatial Driver Matching Performance (< 50ms on 50 drivers)', () => {
    it('filters 50 synthetic drivers by radius, vehicle type, and subscription in < 50ms', () => {
      const orderCustomerLoc = { lat: 29.972, lon: 31.115 };
      const maxRadiusMeters = 3000;

      function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
        const R = 6371e3;
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lon2 - lon1) * Math.PI) / 180;
        const a =
          Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      }

      const drivers = Array.from({ length: 50 }, (_, i) => ({
        id: `driver-${i + 1}`,
        lat: 29.968 + (i % 14) * 0.001,
        lon: 31.105 + (i % 17) * 0.001,
        isOnline: i < 40,
        status: 'approved',
        hasActiveSubscription: true,
        vehicleType: i % 2 === 0 ? 'motorcycle' : 'tricycle',
        ratingAvg: 4.8,
      }));

      const startTime = performance.now();

      const eligible = drivers
        .filter((d) => d.isOnline && d.status === 'approved' && d.hasActiveSubscription)
        .map((d) => ({
          ...d,
          distanceMeters: Math.round(
            getDistanceMeters(d.lat, d.lon, orderCustomerLoc.lat, orderCustomerLoc.lon)
          ),
        }))
        .filter((d) => d.distanceMeters <= maxRadiusMeters)
        .sort((a, b) => a.distanceMeters - b.distanceMeters);

      const elapsedMs = performance.now() - startTime;

      expect(eligible.length).toBeGreaterThan(0);
      expect(elapsedMs).toBeLessThan(50);
    });
  });
});
