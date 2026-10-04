import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { sql } from 'drizzle-orm';

export interface EligibleDriver {
  driverId: string;
  fullName: string;
  phone: string;
  vehicleTypeCode: string;
  vehiclePlate: string;
  distanceMeters: number;
  ratingAvg: number | null;
  verificationRank: number;
}

@Injectable()
export class MatchingFacade {
  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  /**
   * High-performance PostGIS driver matching query using app.find_eligible_drivers
   * Filters by distance, active subscription, verification level, and vehicle class capacity.
   */
  async findEligibleDrivers(
    orderId: string,
    radiusMeters = 3000,
    allowEscalated = false,
  ): Promise<EligibleDriver[]> {
    const sanitizedOrderId = orderId.replace(/[^a-f0-9-]/gi, '');
    const radius = Number(radiusMeters) || 3000;
    const escalated = allowEscalated ? 'true' : 'false';

    const rows = await this.dbService.db.execute(
      sql.raw(`SELECT 
        driver_id,
        full_name,
        phone,
        vehicle_type_code,
        vehicle_plate,
        distance_meters,
        rating_avg,
        verification_rank
      FROM app.find_eligible_drivers('${sanitizedOrderId}'::uuid, ${radius}, ${escalated})`),
    );

    interface DbEligibleDriverRow {
      driver_id: string;
      full_name: string;
      phone: string;
      vehicle_type_code: string;
      vehicle_plate: string;
      distance_meters: number | string;
      rating_avg: number | string | null;
      verification_rank?: number | string | null;
    }

    const resultRows = (
      Array.isArray(rows)
        ? rows
        : rows && typeof rows === 'object' && 'rows' in rows && Array.isArray((rows as { rows: unknown[] }).rows)
          ? (rows as { rows: unknown[] }).rows
          : []
    ) as unknown as DbEligibleDriverRow[];

    return resultRows.map((r: DbEligibleDriverRow) => ({
      driverId: r.driver_id,
      fullName: r.full_name,
      phone: r.phone,
      vehicleTypeCode: r.vehicle_type_code,
      vehiclePlate: r.vehicle_plate,
      distanceMeters: Number(r.distance_meters),
      ratingAvg: r.rating_avg ? Number(r.rating_avg) : null,
      verificationRank: Number(r.verification_rank || 0),
    }));
  }

  async findCandidatesForOrder(orderId: string): Promise<EligibleDriver[]> {
    return this.findEligibleDrivers(orderId);
  }
}

