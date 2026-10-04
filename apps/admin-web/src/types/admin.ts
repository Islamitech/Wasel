export type AdminOrderState =
  | 'published'
  | 'negotiating'
  | 'agreed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';

export interface AdminOrder {
  id: string;
  customerName: string;
  driverName: string;
  taskType: string;
  state: AdminOrderState;
  tier: string;
  fare: number;
  stops: string[];
  visits: number;
  waitingHours: number;
  invoices: number[];
}

export interface DriverVerificationDoc {
  id: string;
  name: string;
  vehicle: string;
  level: number;
  documentName: string;
  status: 'pending' | 'ok';
}

export interface DriverSubscription {
  id: string;
  name: string;
  plan: string;
  daysRemaining: number;
  isActive: boolean;
}

export interface DisputeItem {
  id: string;
  orderId: string;
  openedBy: string;
  reason: string;
  status: 'open' | 'resolved';
  timeline: string[];
}

export interface PricingConfig {
  stopPrice: number;
  waitingHourPrice: number;
  invoicePercentage: number;
}

export interface WhatIfConfig {
  visits: number;
  waitingHours: number;
  invoiceTotal: number;
}

export interface CatalogItem {
  key: string;
  label: string;
  enabled: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName?: string;
  roles: string[];
}
