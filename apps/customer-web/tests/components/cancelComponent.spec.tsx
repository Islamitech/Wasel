import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CancelOrderModal } from '../../src/components/sheet/CancelOrderModal.js';

describe('CancelOrderModal Component Tests', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <CancelOrderModal
        isOpen={false}
        onClose={vi.fn()}
        onConfirmCancel={vi.fn()}
        isProcessing={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders reasons, selects reason, and confirms cancellation', () => {
    const onConfirmCancel = vi.fn();
    const onClose = vi.fn();

    render(
      <CancelOrderModal
        isOpen={true}
        onClose={onClose}
        onConfirmCancel={onConfirmCancel}
        isProcessing={false}
      />,
    );

    expect(screen.getByText('تأكيد إلغاء الطلب')).toBeInTheDocument();
    expect(screen.getByText('قمت بالطلب عن طريق الخطأ')).toBeInTheDocument();

    // Select a different reason
    const radioBtn = screen.getByLabelText('قمت بالطلب عن طريق الخطأ');
    fireEvent.click(radioBtn);

    // Confirm cancellation
    const confirmBtn = screen.getByRole('button', { name: 'تأكيد الإلغاء' });
    fireEvent.click(confirmBtn);

    expect(onConfirmCancel).toHaveBeenCalledWith('قمت بالطلب عن طريق الخطأ');
  });

  it('allows custom reason when selecting "سبب آخر"', () => {
    const onConfirmCancel = vi.fn();

    render(
      <CancelOrderModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirmCancel={onConfirmCancel}
        isProcessing={false}
      />,
    );

    // Select "سبب آخر"
    const otherRadio = screen.getByLabelText('سبب آخر');
    fireEvent.click(otherRadio);

    const customInput = screen.getByPlaceholderText('يرجى كتابة سبب الإلغاء...');
    fireEvent.change(customInput, { target: { value: 'غيرت رأيي وسأذهب بنفسي' } });

    const confirmBtn = screen.getByRole('button', { name: 'تأكيد الإلغاء' });
    fireEvent.click(confirmBtn);

    expect(onConfirmCancel).toHaveBeenCalledWith('غيرت رأيي وسأذهب بنفسي');
  });

  it('triggers onClose when clicking close or cancel button', () => {
    const onClose = vi.fn();

    render(
      <CancelOrderModal
        isOpen={true}
        onClose={onClose}
        onConfirmCancel={vi.fn()}
        isProcessing={false}
      />,
    );

    const cancelBtn = screen.getByRole('button', { name: 'تراجع' });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
