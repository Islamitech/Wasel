import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhoneAuthScreen } from '../../src/components/auth/PhoneAuthScreen.js';
import { apiClient } from '../../src/api.js';

describe('PhoneAuthScreen Component Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders phone input and requests OTP on valid submit', async () => {
    const onSuccess = vi.fn();
    const requestOtpSpy = vi.spyOn(apiClient.auth, 'requestOtp').mockResolvedValueOnce({
      success: true,
      message: 'تم إرسال رمز التحقق بنجاح',
      resendCooldownSeconds: 60,
    } as any);

    render(<PhoneAuthScreen onSuccess={onSuccess} />);

    expect(screen.getByText('واصل')).toBeInTheDocument();
    const phoneInput = screen.getByPlaceholderText('01012345678');
    expect(phoneInput).toBeInTheDocument();

    fireEvent.change(phoneInput, { target: { value: '01011223344' } });
    const submitBtn = screen.getByRole('button', { name: /إرسال رمز التحقق/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(requestOtpSpy).toHaveBeenCalledWith('01011223344', expect.anything());
    });

    // Should transition to OTP input step
    await waitFor(() => {
      expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
    });
  });

  it('validates OTP length and verifies code on submit', async () => {
    const onSuccess = vi.fn();
    vi.spyOn(apiClient.auth, 'requestOtp').mockResolvedValueOnce({
      success: true,
      message: 'تم إرسال رمز التحقق',
      resendCooldownSeconds: 60,
    } as any);

    const testUser = {
      id: 'usr-123',
      phone: '01011223344',
      fullName: 'عميل واصل',
      roles: ['customer'],
    };

    const verifyOtpSpy = vi.spyOn(apiClient.auth, 'verifyOtp').mockResolvedValueOnce({
      accessToken: 'test-access-token-jwt',
      refreshToken: 'test-refresh-token-jwt',
      user: testUser,
    } as any);

    render(<PhoneAuthScreen onSuccess={onSuccess} />);

    // Step 1: Submit phone
    const phoneInput = screen.getByPlaceholderText('01012345678');
    fireEvent.change(phoneInput, { target: { value: '01011223344' } });
    fireEvent.click(screen.getByRole('button', { name: /إرسال رمز التحقق/ }));

    // Step 2: In OTP step, submit incomplete code -> shows validation error
    const otpInput = await screen.findByPlaceholderText('123456');
    fireEvent.change(otpInput, { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /تأكيد ودخول/ }));
    expect(await screen.findByText('رمز التحقق يجب أن يتكون من 6 أرقام')).toBeInTheDocument();

    // Submit full 6-digit OTP
    fireEvent.change(otpInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /تأكيد ودخول/ }));

    await waitFor(() => {
      expect(verifyOtpSpy).toHaveBeenCalledWith('01011223344', '123456', expect.anything(), expect.anything());
      expect(localStorage.getItem('wasel_access_token')).toBe('test-access-token-jwt');
      expect(localStorage.getItem('wasel_refresh_token')).toBe('test-refresh-token-jwt');
      expect(onSuccess).toHaveBeenCalledWith(testUser);
    });
  });

  it('allows going back to change phone number', async () => {
    vi.spyOn(apiClient.auth, 'requestOtp').mockResolvedValueOnce({
      success: true,
      message: 'تم الإرسال',
    } as any);

    render(<PhoneAuthScreen onSuccess={vi.fn()} />);

    const phoneInput = screen.getByPlaceholderText('01012345678');
    fireEvent.change(phoneInput, { target: { value: '01011223344' } });
    fireEvent.click(screen.getByRole('button', { name: /إرسال رمز التحقق/ }));

    const changePhoneBtn = await screen.findByRole('button', { name: /تعديل رقم الهاتف/ });
    expect(changePhoneBtn).toBeInTheDocument();
    fireEvent.click(changePhoneBtn);

    // Returns to phone step
    expect(await screen.findByPlaceholderText('01012345678')).toBeInTheDocument();
  });
});
