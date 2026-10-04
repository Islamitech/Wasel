import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { vehicleTypes, serviceActions, valueTiers } from '../../database/schema/index.js';
import { asc } from 'drizzle-orm';

@Injectable()
export class CatalogService {
  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  async getVehicleTypes(_regionId?: string) {
    return this.dbService.db.select().from(vehicleTypes).orderBy(asc(vehicleTypes.escalationRank));
  }

  async getServiceActions(_regionId?: string) {
    return this.dbService.db.select().from(serviceActions).orderBy(asc(serviceActions.sortOrder));
  }

  async getValueTiers(_regionId?: string) {
    return this.dbService.db.select().from(valueTiers).orderBy(asc(valueTiers.rank));
  }
}
