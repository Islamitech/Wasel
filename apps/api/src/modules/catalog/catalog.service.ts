import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import {
  vehicleTypes,
  serviceActions,
  valueTiers,
  loadSizes,
  places,
  settings,
} from '../../database/schema/index.js';
import { asc, eq, ilike, and } from 'drizzle-orm';
import * as crypto from 'crypto';
import { SearchPlacesQueryDto, SuggestPlaceDto } from '@wasel/shared';
import { normalizePoint } from '../../common/geo/index.js';

@Injectable()
export class CatalogService {
  constructor(@Inject(DatabaseService) private readonly dbService: DatabaseService) {}

  async getCatalog(_regionId?: string) {
    const [vehiclesList, tiersList, actionsList, sizesList, allSettings] = await Promise.all([
      this.dbService.db.select().from(vehicleTypes).where(eq(vehicleTypes.active, true)).orderBy(asc(vehicleTypes.escalationRank)),
      this.dbService.db.select().from(valueTiers).orderBy(asc(valueTiers.rank)),
      this.dbService.db.select().from(serviceActions).orderBy(asc(serviceActions.sortOrder)),
      this.dbService.db.select().from(loadSizes).orderBy(asc(loadSizes.rank)),
      this.dbService.db.select().from(settings),
    ]);

    const maxTasksSetting = allSettings.find((s) => s.key === 'max_tasks_per_order');
    const searchRadiusSetting = allSettings.find((s) => s.key === 'search_radius_meters');

    const maxTasksPerOrder = Number((maxTasksSetting?.value as any)?.value || maxTasksSetting?.value || 8);
    const searchRadiusMeters = Number((searchRadiusSetting?.value as any)?.value || searchRadiusSetting?.value || 10000);

    const payload = {
      vehicleTypes: vehiclesList,
      valueTiers: tiersList,
      serviceActions: actionsList,
      loadSizes: sizesList,
      settings: {
        maxTasksPerOrder,
        searchRadiusMeters,
        currency: 'EGP',
      },
    };

    const etag = `"${crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex')}"`;
    return { data: payload, etag };
  }

  async searchPlaces(query: SearchPlacesQueryDto) {
    const conditions: any[] = [eq(places.status, 'active')];

    if (query.q) {
      conditions.push(ilike(places.name, `%${query.q.trim()}%`));
    }

    const limit = query.limit || 20;
    const results = await this.dbService.db
      .select()
      .from(places)
      .where(and(...conditions))
      .limit(limit);

    return results.map((p) => {
      const loc = normalizePoint(p.location);
      return {
        id: p.id,
        nameAr: p.name,
        category: p.category,
        latitude: loc.lat,
        longitude: loc.lng,
        lat: loc.lat,
        lng: loc.lng,
        isVerified: true,
        status: p.status,
      };
    });
  }

  async suggestPlace(dto: SuggestPlaceDto, userId?: string) {
    const point = normalizePoint({ lat: dto.latitude, lng: dto.longitude });
    const [created] = await this.dbService.db
      .insert(places)
      .values({
        name: dto.nameAr,
        category: dto.category || 'other',
        source: 'user_suggested',
        location: point,
        status: 'pending',
        createdBy: userId,
        regionId: dto.regionId,
      })
      .returning();

    return {
      id: created!.id,
      nameAr: created!.name,
      category: created!.category,
      latitude: dto.latitude,
      longitude: dto.longitude,
      status: created!.status,
      isVerified: false,
    };
  }

  async getVehicleTypes(_regionId?: string) {
    return this.dbService.db.select().from(vehicleTypes).where(eq(vehicleTypes.active, true)).orderBy(asc(vehicleTypes.escalationRank));
  }

  async getServiceActions() {
    return this.dbService.db.select().from(serviceActions).orderBy(asc(serviceActions.sortOrder));
  }

  async getValueTiers() {
    return this.dbService.db.select().from(valueTiers).orderBy(asc(valueTiers.rank));
  }
}
