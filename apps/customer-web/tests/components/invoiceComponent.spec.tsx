import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InvoiceSheet } from '../../src/components/sheet/InvoiceSheet.js';
import { InvoiceResponseDto } from '@wasel/api-client';

describe('InvoiceSheet Component Tests', () => {
  const mockInvoices: InvoiceResponseDto[] = [
    {
      id: 'inv-1',
      agreementId: 'agr-1',
      stopId: 'stop-1',
      amountMinor: 16000,
      formattedAmountEgp: '160 ج.م',
      invoiceNumber: 'INV-001',
      customerNote: 'شراء لحوم وبقالة',
      photoKey: 'https://example.com/invoice.jpg',
      verifiedByCustomer: false,
      createdAt: new Date().toISOString(),
    },
  ];

  it('renders invoice details, direct cash notice, and confirms payment', () => {
    const onConfirmPayment = vi.fn();
    const onDispute = vi.fn();

    render(
      <InvoiceSheet
        invoices={mockInvoices}
        onConfirmPayment={onConfirmPayment}
        onDispute={onDispute}
        isProcessing={false}
      />,
    );

    // Verify header and non-negotiable cash notice
    expect(screen.getByText('فواتير المشتريات المسجلة')).toBeInTheDocument();
    expect(
      screen.getByText(/تنبيه هام: المحاسبة نقدية مباشرة مع المتجر أو الكابتن/),
    ).toBeInTheDocument();

    // Verify invoice amount
    expect(screen.getByText('160 ج.م')).toBeInTheDocument();
    expect(screen.getByText('شراء لحوم وبقالة')).toBeInTheDocument();

    // Click confirm payment
    const confirmBtn = screen.getByRole('button', { name: /تأكيد السداد/ });
    fireEvent.click(confirmBtn);
    expect(onConfirmPayment).toHaveBeenCalledWith('inv-1', 16000);
  });

  it('allows customer to dispute invoice with reason', () => {
    const onConfirmPayment = vi.fn();
    const onDispute = vi.fn();

    render(
      <InvoiceSheet
        invoices={mockInvoices}
        onConfirmPayment={onConfirmPayment}
        onDispute={onDispute}
        isProcessing={false}
      />,
    );

    // Click dispute button to open input
    const disputeBtn = screen.getByRole('button', { name: /اعتراض/ });
    fireEvent.click(disputeBtn);

    // Input dispute reason
    const input = screen.getByPlaceholderText(/اكتب سبب الاعتراض بالتفصيل/);
    fireEvent.change(input, { target: { value: 'المبلغ المسجل أكبر من الفاتورة الحقيقية' } });

    // Submit dispute
    const submitDisputeBtn = screen.getByRole('button', { name: 'تأكيد الاعتراض' });
    fireEvent.click(submitDisputeBtn);

    expect(onDispute).toHaveBeenCalledWith('inv-1', 'المبلغ المسجل أكبر من الفاتورة الحقيقية');
  });

  it('renders verified badge when invoice is already verified', () => {
    const verifiedInvoices: InvoiceResponseDto[] = [
      {
        ...mockInvoices[0]!,
        verifiedByCustomer: true,
      },
    ];

    render(
      <InvoiceSheet
        invoices={verifiedInvoices}
        onConfirmPayment={vi.fn()}
        onDispute={vi.fn()}
        isProcessing={false}
      />,
    );

    expect(screen.getByText(/تم تأكيد الفاتورة وتسجيل السداد/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تأكيد السداد/ })).not.toBeInTheDocument();
  });
});
