import { Injectable } from '@nestjs/common';
import { validateEnv, EnvConfig } from './env.validation.js';

@Injectable()
export class AppConfigService {
  private readonly config: EnvConfig;

  constructor() {
    this.config = validateEnv(process.env);
  }

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.config[key];
  }

  getAll(): EnvConfig {
    return this.config;
  }
}
