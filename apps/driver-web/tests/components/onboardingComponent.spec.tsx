import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingSheet } from '../../src/components/sheet/OnboardingSheet.js';
import { apiClient } from '../../src/api.js';
import { DriverAppState } from '../../src/types/driver.js';
import '../../src/i18n.js';

const mockState: DriverAppState = {
  sheetState: 'onboarding',
  theme: 'light',
  user: {
    id: 'd-test-1',
    phone: '01012345678',
    fullName: '',
    roles: ['driver'],
  } as any,
  driverLocation: { latitude: 29.98, longitude: 31.12 },
  verification: null,
  subscription: null,
  incomingOrder: null,
  bidding: null,
  activeAgreement: null,
  currentStopIndex: 0,
  currentStopPhase: 'to_stop',
  waitStartTime: null,
  currentStopInvoice: null,
  pendingAmendments: [],
  settlement: null,
  todayEarnings: { completedTripsCount: 0, totalEarningsMinor: 0, formattedTotalEarnings: '0 ج.م' },
  offlineQueueCount: 0,
  isMenuOpen: false,
  isChatOpen: false,
  isCancelModalOpen: false,
  isWakeLockActive: false,
  errorMessage: null,
  errorActionLabel: null,
  errorActionType: null,
  onlineHeartbeatInterval: 15,
};

describe('OnboardingSheet Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders driver profile inputs and loads vehicle types', async () => {
    vi.spyOn(apiClient.catalog, 'getUnified').mockResolvedValueOnce({
      vehicleTypes: [
        { id: 'v-moto', code: 'motorcycle', nameAr: 'موتوسيكل' },
        { id: 'v-tri', code: 'tricycle', nameAr: 'تروسيكل' },
      ],
    });

    render(
      <OnboardingSheet
        state={mockState}
        onProfileUpdated={vi.fn()}
      />,
    );

    // Verify fields exist by label / placeholder
    expect(screen.getByPlaceholderText(/مثال: محمد السيد محمود/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/مثال: ق ن ص ١٢٣٤/)).toBeInTheDocument();

    // Verify vehicle types dropdown loads options
    await waitFor(() => {
      expect(screen.getByText('موتوسيكل')).toBeInTheDocument();
      expect(screen.getByText('تروسيكل')).toBeInTheDocument();
    });
  });

  it('submits updated profile and vehicle data successfully', async () => {
    vi.spyOn(apiClient.catalog, 'getUnified').mockResolvedValueOnce({
      vehicleTypes: [{ id: 'v-moto', code: 'motorcycle', nameAr: 'موتوسيكل' }],
    });

    const updateMeSpy = vi.spyOn(apiClient.auth, 'updateMe').mockResolvedValueOnce({} as any);
    const createProfileSpy = vi.spyOn(apiClient.driver, 'createProfile').mockResolvedValueOnce({} as any);
    const registerVehicleSpy = vi.spyOn(apiClient.driver, 'registerVehicle').mockResolvedValueOnce({} as any);
    const onProfileUpdated = vi.fn();

    render(
      <OnboardingSheet
        state={mockState}
        onProfileUpdated={onProfileUpdated}
      />,
    );

    // Fill full name
    const nameInput = screen.getByPlaceholderText(/مثال: محمد السيد محمود/);
    fireEvent.change(nameInput, { target: { value: 'كابتن محمود حسن' } });

    // Select vehicle
    await waitFor(() => {
      expect(screen.getByText('موتوسيكل')).toBeInTheDocument();
    });
    const vehicleSelect = screen.getByRole('combobox');
    fireEvent.change(vehicleSelect, { target: { value: 'v-moto' } });

    // Fill plate
    const plateInput = screen.getByPlaceholderText(/مثال: ق ن ص ١٢٣٤/);
    fireEvent.change(plateInput, { target: { value: 'ق ص ط ٤٥٦' } });

    // Submit form
    const form = nameInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(updateMeSpy).toHaveBeenCalledWith({ fullName: 'كابتن محمود حسن' });
      expect(createProfileSpy).toHaveBeenCalled();
      expect(registerVehicleSpy).toHaveBeenCalledWith({
        vehicleTypeId: 'v-moto',
        plate: 'ق ص ط ٤٥٦',
      });
      expect(onProfileUpdated).toHaveBeenCalled();
    });
  });

  it('shows validation error if full name is empty', async () => {
    render(
      <OnboardingSheet
        state={mockState}
        onProfileUpdated={vi.fn()}
      />,
    );

    const nameInput = screen.getByPlaceholderText(/مثال: محمد السيد محمود/);
    const form = nameInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/يرجى إدخال الاسم الكامل/)).toBeInTheDocument();
    });
  });
});
