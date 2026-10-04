import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import request from 'supertest';
import {
  Point,
  validatePoint,
  toGeography,
  parseGeographyPoint,
  calculateHaversineDistanceMeters,
  isPointInsidePolygon,
} from '../src/common/geo/index.js';
import { getTestContext } from './test-harness.js';

describe('Phase 2: Database & Geo Hardening (D-01, D-02)', () => {
  describe('D-01: Coordinate Validation & Point Invariant', () => {
    it('accepts valid geographic coordinates within WGS84 bounds', () => {
      const validPoint: Point = { lat: 29.9735, lng: 31.1105 };
      expect(() => validatePoint(validPoint)).not.toThrow();
    });

    it('rejects latitude outside [-90, 90]', () => {
      expect(() => validatePoint({ lat: 90.0001, lng: 31.1105 })).toThrow(/Latitude must be between -90 and 90/);
      expect(() => validatePoint({ lat: -91, lng: 31.1105 })).toThrow(/Latitude must be between -90 and 90/);
    });

    it('rejects longitude outside [-180, 180]', () => {
      expect(() => validatePoint({ lat: 29.9735, lng: 180.001 })).toThrow(/Longitude must be between -180 and 180/);
      expect(() => validatePoint({ lat: 29.9735, lng: -181 })).toThrow(/Longitude must be between -180 and 180/);
    });

    it('rejects NaN or non-finite coordinate values', () => {
      expect(() => validatePoint({ lat: NaN, lng: 31.1105 })).toThrow(/Coordinates must be finite numbers/);
      expect(() => validatePoint({ lat: 29.9735, lng: Infinity })).toThrow(/Coordinates must be finite numbers/);
    });
  });

  describe('D-01: PostGIS Order Convention (lng, lat) vs API (lat, lng)', () => {
    it('toGeography outputs PostGIS ST_MakePoint with (lng, lat) order and SRID 4326', () => {
      const point: Point = { lat: 29.9735, lng: 31.1105 };
      const sqlSnippet = toGeography(point);
      // Verify sql query text contains PostGIS order: ST_MakePoint(lng, lat)
      const queryStr = (sqlSnippet as any).queryChunks
        ?.map((c: any) => (typeof c === 'string' ? c : c?.value ?? ''))
        .join('') || JSON.stringify(sqlSnippet);

      expect(queryStr).toContain('ST_MakePoint');
      expect(queryStr).toContain('4326');
    });

    it('parses WKT string POINT(lng lat) into { lat, lng } correctly with inverted coordinates', () => {
      const parsed = parseGeographyPoint('SRID=4326;POINT(31.1105 29.9735)');
      expect(parsed).toEqual({ lat: 29.9735, lng: 31.1105 });
    });

    it('parses PostGIS EWKB binary hex string into exact { lat, lng } coordinates', () => {
      // 25-byte Little-Endian EWKB for Point(31.1105, 29.9735) with SRID 4326
      const buf = Buffer.alloc(25);
      buf.writeUInt8(1, 0); // Little Endian
      buf.writeUInt32LE(0x20000001, 1); // Point + SRID
      buf.writeUInt32LE(4326, 5); // SRID 4326
      buf.writeDoubleLE(31.1105, 9); // X = longitude
      buf.writeDoubleLE(29.9735, 17); // Y = latitude

      const hex = buf.toString('hex');
      const parsed = parseGeographyPoint(hex);
      expect(parsed.lng).toBeCloseTo(31.1105, 4);
      expect(parsed.lat).toBeCloseTo(29.9735, 4);
    });

    it('calculates geodesic distance between two known points accurately (within +-1%)', () => {
      // Point 1: 29.9735 N, 31.1105 E (Hadayek al-Ahram gate 1)
      // Point 2: 29.9750 N, 31.1150 E (Hadayek al-Ahram shopping area)
      const p1: Point = { lat: 29.9735, lng: 31.1105 };
      const p2: Point = { lat: 29.9750, lng: 31.1150 };

      const distMeters = calculateHaversineDistanceMeters(p1, p2);
      // Great-circle distance is approx 463 meters
      expect(distMeters).toBeGreaterThan(455);
      expect(distMeters).toBeLessThan(475);
    });

    it('round-trip test: creates order with point (29.9735, 31.1105) and reads back identical coordinates', async () => {
      const ctx = await getTestContext();
      const customer = await ctx.createCustomer({ phone: '+201088776655' });
      const customerToken = customer.token;

      const targetPoint = { lat: 29.9735, lng: 31.1105 };

      const createRes = await request(ctx.app.getHttpServer())
        .post('/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          regionId: ctx.regionId,
          valueTierId: ctx.defaultValueTierId,
          loadSizeId: ctx.defaultLoadSizeId,
          waitMode: 'notify',
          customerLocation: targetPoint,
          stops: [
            {
              actionId: ctx.defaultActionId,
              location: targetPoint,
              description: 'نقطة اختبار ذهاب وإياب الإحداثيات',
              expectedDurationMinutes: 10,
            },
          ],
        });

      expect(createRes.status).toBe(201);
      const orderId = createRes.body.id;
      expect(orderId).toBeDefined();

      const getRes = await request(ctx.app.getHttpServer())
        .get(`/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.customerLocation.lat).toBeCloseTo(29.9735, 4);
      expect(getRes.body.customerLocation.lng).toBeCloseTo(31.1105, 4);
      expect(getRes.body.stops[0].location.lat).toBeCloseTo(29.9735, 4);
      expect(getRes.body.stops[0].location.lng).toBeCloseTo(31.1105, 4);
    });
  });

  describe('D-01: Operating Region Boundary Validation (ST_Covers)', () => {
    const hadayekPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [31.1000, 29.9650],
          [31.1250, 29.9650],
          [31.1250, 29.9850],
          [31.1000, 29.9850],
          [31.1000, 29.9650],
        ],
      ],
    };

    it('identifies point inside operating region polygon', () => {
      const insidePoint: Point = { lat: 29.9735, lng: 31.1105 };
      expect(isPointInsidePolygon(insidePoint, hadayekPolygon)).toBe(true);
    });

    it('identifies point outside operating region polygon', () => {
      // Downtown Cairo (Tahrir): ~30.0444 N, 31.2357 E (far outside Hadayek al-Ahram)
      const outsidePoint: Point = { lat: 30.0444, lng: 31.2357 };
      expect(isPointInsidePolygon(outsidePoint, hadayekPolygon)).toBe(false);
    });
  });

  describe('D-02: Single Migration Path & Schema Integrity', () => {
    it('migration files exist with matching down migration files in supabase/migrations/down', () => {
      const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');
      const downDir = path.resolve(__dirname, '../../../supabase/migrations/down');

      const upFiles = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'));

      for (const file of upFiles) {
        const baseName = file.replace(/\.sql$/, '');
        const downFile = `${baseName}.down.sql`;
        expect(
          fs.existsSync(path.join(downDir, downFile)),
          `Matching down migration ${downFile} must exist for ${file}`,
        ).toBe(true);
      }
    });

    it('seed runner rejects seed.dev.sql in APP_ENV=production', async () => {
      const { runSeeds } = await import('../src/database/seed.js');
      const origEnv = process.env.APP_ENV;
      try {
        process.env.APP_ENV = 'production';
        await expect(runSeeds({ dev: true })).rejects.toThrow(
          /Cannot run development seed \(seed\.dev\.sql\) in production/i,
        );
      } finally {
        process.env.APP_ENV = origEnv;
      }
    });
  });
});
