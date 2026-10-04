/**
 * Wasel Platform - k6 Load Testing Script
 * Scenario: Driver high-frequency location updates & nearby orders matching
 * Target Thresholds: p95 latency < 200ms, error rate < 1%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 },  // Ramp-up to 20 captains
    { duration: '30s', target: 50 },  // Steady load of 50 concurrent captains
    { duration: '10s', target: 0 },   // Ramp-down
  ],
  thresholds: {
    // p95 latency must be under 200ms
    http_req_duration: ['p(95)<200'],
    // Error rate must be under 1%
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3000/v1';
const DRIVER_TOKEN = __ENV.DRIVER_TOKEN || 'test_driver_jwt_token_here';

export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DRIVER_TOKEN}`,
    },
  };

  // 1. High-frequency driver GPS location ping
  const lat = 29.975 + (Math.random() - 0.5) * 0.02;
  const lng = 31.115 + (Math.random() - 0.5) * 0.02;

  const locationPayload = JSON.stringify({
    points: [
      {
        latitude: lat,
        longitude: lng,
        accuracy: 10,
        speed: 8.5,
        heading: 180,
        timestamp: new Date().toISOString(),
      },
    ],
  });

  const locationRes = http.post(`${BASE_URL}/driver/location`, locationPayload, params);
  check(locationRes, {
    'location ping status is 200 or 201': (r) => r.status === 200 || r.status === 201,
  });

  // 2. Fetch nearby dispatch candidates
  const nearbyRes = http.get(`${BASE_URL}/driver/orders/nearby`, params);
  check(nearbyRes, {
    'nearby orders status is 200': (r) => r.status === 200,
    'nearby orders response is valid list': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body) || (body && Array.isArray(body.items));
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
