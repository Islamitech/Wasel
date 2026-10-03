import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { vehicleTypes, serviceActions, valueTiers } from '../../database/schema/index.js';
import { eq, asc } from 'drizzle-orm';

@Injectable()
export class CatalogService {
  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  async getVehicleTypes(regionId?: string) {
    if (regionId) {
      return this.dbService.db
        .select()
        .from(vehicleTypes)
        .where(eq(vehicleTypes.regionId, regionId))
        .orderBy(asc(vehicleTypes.displayOrder));
    }
    return this.dbService.db.select().from(vehicleTypes).orderBy(asc(vehicleTypes.displayOrder));
  }

  async getServiceActions(regionId?: string) {
    if (regionId) {
      return this.dbService.db
        .select()
        .from(serviceActions)
        .where(eq(serviceActions.regionId, regionId));
    }
    return this.dbService.db.select().from(serviceActions);
  }

  async getValueTiers(regionId?: string) {
    if (regionId) {
      return this.dbService.db
        .select()
        .from(valueTiers)
        .where(eq(valueTiers.regionId, regionId));
    }
    return this.dbService.db.select().from(valueTiers);
  }
}
