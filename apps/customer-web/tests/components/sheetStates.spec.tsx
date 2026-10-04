import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IdleSheet } from '../../src/components/sheet/IdleSheet.js';
import { ActionMenuSheet } from '../../src/components/sheet/ActionMenuSheet.js';
import { TaskDetailSheet } from '../../src/components/sheet/TaskDetailSheet.js';
import { CartBar } from '../../src/components/sheet/CartBar.js';
import { CartSheet } from '../../src/components/sheet/CartSheet.js';
import { SearchingSheet } from '../../src/components/sheet/SearchingSheet.js';
import { OffersSheet } from '../../src/components/sheet/OffersSheet.js';
import { TrackingSheet } from '../../src/components/sheet/TrackingSheet.js';
import { InvoiceSheet } from '../../src/components/sheet/InvoiceSheet.js';
import { DoneSheet } from '../../src/components/sheet/DoneSheet.js';
import { OrderStatus, AgreementStatus } from '@wasel/api-client';

describe('Customer Sheet States Component Tests', () => {
  describe('IdleSheet', () => {
    it('renders primary button "ماذا تحتاج؟" and search box', () => {
      const onOpenActionMenu = vi.fn();
      const onSelectPlace = vi.fn();
      const places: any[] = [
        { id: '1', nameAr: 'سوبرماركت الفرجاني', latitude: 29.98, longitude: 31.12 },
      ];

      render(
        <IdleSheet
          onOpenActionMenu={onOpenActionMenu}
          onSelectPlace={onSelectPlace}
          places={places}
        />,
      );

      const mainButton = screen.getByRole('button', { name: 'ماذا تحتاج؟' });
      expect(mainButton).toBeInTheDocument();
      fireEvent.click(mainButton);
      expect(onOpenActionMenu).toHaveBeenCalled();

      // Search
      const searchInput = screen.getByPlaceholderText(/ابحث عن متجر/);
      fireEvent.change(searchInput, { target: { value: 'الفرجاني' } });
      const placeItem = screen.getByText('سوبرماركت الفرجاني');
      expect(placeItem).toBeInTheDocument();
      fireEvent.click(placeItem);
      expect(onSelectPlace).toHaveBeenCalledWith(places[0]);
    });
  });

  describe('ActionMenuSheet', () => {
    it('displays dynamic actions ordered by point type', () => {
      const selectedPoint = {
        coordinates: { latitude: 29.98, longitude: 31.12 },
        pointType: 'shop' as const,
        addressLabel: 'سوبرماركت الفرجاني',
      };

      const serviceActions: any[] = [
        { id: 'a-drop', code: 'drop', nameAr: 'توصيل هنا', sortOrder: 3 },
        { id: 'a-buy', code: 'buy', nameAr: 'شراء من هنا', sortOrder: 1 },
        { id: 'a-pick', code: 'pick', nameAr: 'استلام من هنا', sortOrder: 2 },
      ];

      const onSelectAction = vi.fn();
      const onCancel = vi.fn();

      render(
        <ActionMenuSheet
          selectedPoint={selectedPoint}
          serviceActions={serviceActions}
          onSelectAction={onSelectAction}
          onCancel={onCancel}
        />,
      );

      expect(screen.getByText('سوبرماركت الفرجاني')).toBeInTheDocument();
      // For shop pointType, buy is ordered first
      const buttons = screen.getAllByRole('button');
      expect(buttons[1]).toHaveTextContent('شراء من هنا');
      fireEvent.click(buttons[1]);
      expect(onSelectAction).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'buy' }),
      );
    });
  });

  describe('TaskDetailSheet', () => {
    it('allows text description, photo selection, and button triggers', () => {
      const draftStop: any = {
        seq: 1,
        actionCode: 'buy',
        actionNameAr: 'شراء من هنا',
        placeNameAr: 'سوبرماركت الفرجاني',
        description: '',
      };

      const onUpdateDraft = vi.fn();
      const onAddAndContinue = vi.fn();
      const onAddAndFinish = vi.fn();
      const onCancel = vi.fn();

      render(
        <TaskDetailSheet
          draftStop={draftStop}
          onUpdateDraft={onUpdateDraft}
          onAddAndContinue={onAddAndContinue}
          onAddAndFinish={onAddAndFinish}
          onCancel={onCancel}
        />,
      );

      const textarea = screen.getByPlaceholderText(/اكتب ما تحتاجه بدقة/);
      fireEvent.change(textarea, { target: { value: 'علبة لبن' } });
      expect(onUpdateDraft).toHaveBeenCalledWith({ description: 'علبة لبن' });

      // Click "أكمل الطلب"
      const finishBtn = screen.getByRole('button', { name: 'أكمل الطلب' });
      fireEvent.click(finishBtn);
      expect(onAddAndFinish).toHaveBeenCalled();

      // Click "أضف مكاناً آخر"
      const continueBtn = screen.getByRole('button', { name: 'أضف مكاناً آخر' });
      fireEvent.click(continueBtn);
      expect(onAddAndContinue).toHaveBeenCalled();
    });
  });

  describe('CartBar', () => {
    it('renders persistent bar with task count, minimum fare, and "طلب بلا مكان"', () => {
      const onOpenCart = vi.fn();
      const onAddNoLocationStop = vi.fn();

      render(
        <CartBar
          stopsCount={2}
          maxTasks={8}
          quote={{
            minFareMinor: 3500,
            formattedFareEgp: '35 ج.م',
            billableVisits: 2,
            expectedWaitHours: 0,
            suggestedVehicleClasses: ['motorcycle'],
          }}
          onOpenCart={onOpenCart}
          onAddNoLocationStop={onAddNoLocationStop}
        />,
      );

      expect(screen.getByText('2 مهام')).toBeInTheDocument();
      expect(screen.getByText('35 ج.م')).toBeInTheDocument();

      const openCartBtn = screen.getByRole('button', { name: /راجع الطلب/ });
      fireEvent.click(openCartBtn);
      expect(onOpenCart).toHaveBeenCalled();

      const noLocationBtn = screen.getByRole('button', { name: /طلب بلا مكان/ });
      fireEvent.click(noLocationBtn);
      expect(onAddNoLocationStop).toHaveBeenCalled();
    });
  });

  describe('CartSheet', () => {
    it('renders stops list, value tiers, wait option when relevant, and primary button "اطلب"', () => {
      const stops: any[] = [
        {
          id: 's1',
          seq: 1,
          actionCode: 'pick',
          actionNameAr: 'استلام',
          placeNameAr: 'المحل',
          location: { latitude: 29.98, longitude: 31.12 },
        },
      ];

      const valueTiers: any[] = [
        { id: 't1', code: 'tier1', nameAr: 'أقل من ٢٠٠ ج', minMinor: 0, rank: 1 },
        { id: 't2', code: 'tier2', nameAr: '٢٠٠ - ٥٠٠ ج', minMinor: 20000, rank: 2 },
      ];

      const onReorder = vi.fn();
      const onDeleteStop = vi.fn();
      const onSelectValueTier = vi.fn();
      const onToggleWaitMode = vi.fn();
      const onAddMoreStops = vi.fn();
      const onPublish = vi.fn();
      const onClose = vi.fn();

      render(
        <CartSheet
          stops={stops}
          valueTiers={valueTiers}
          vehicleTypes={[]}
          selectedValueTierId="t1"
          waitMode="wait"
          quote={{
            minFareMinor: 2600,
            formattedFareEgp: '26 ج.م',
            billableVisits: 1,
            expectedWaitHours: 0,
            suggestedVehicleClasses: ['motorcycle'],
          }}
          isPublishing={false}
          onReorder={onReorder}
          onDeleteStop={onDeleteStop}
          onSelectValueTier={onSelectValueTier}
          onToggleWaitMode={onToggleWaitMode}
          onAddMoreStops={onAddMoreStops}
          onPublish={onPublish}
          onClose={onClose}
        />,
      );

      expect(screen.getByText('مراجعة وتأكيد الطلب')).toBeInTheDocument();
      expect(screen.getByText('26 ج.م')).toBeInTheDocument();

      // Check wait mode toggle (relevant because pick task exists)
      expect(screen.getByText('انتظر حتى الانتهاء')).toBeInTheDocument();

      // Click Publish
      const publishBtn = screen.getByRole('button', { name: 'اطلب' });
      fireEvent.click(publishBtn);
      expect(onPublish).toHaveBeenCalled();
    });
  });

  describe('OffersSheet', () => {
    it('renders offer card with captain details, fare, and accept/counter/reject actions', () => {
      const offers: any[] = [
        {
          id: 'off-1',
          driverId: 'd-1',
          driverName: 'محمد أحمد',
          driverRatingAvg: 4.9,
          driverVehicleType: 'موتوسيكل',
          offeredFareMinor: 3000,
          formattedFareEgp: '30 ج.م',
          status: 'pending',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      ];

      const onAccept = vi.fn();
      const onReject = vi.fn();
      const onCounter = vi.fn();

      render(
        <OffersSheet
          offers={offers}
          onAccept={onAccept}
          onReject={onReject}
          onCounter={onCounter}
          isProcessing={false}
        />,
      );

      expect(screen.getByText(/الكابتن محمد أحمد/)).toBeInTheDocument();
      expect(screen.getByText('30 ج.م')).toBeInTheDocument();

      // Accept
      const acceptBtn = screen.getByRole('button', { name: /اقبل/ });
      fireEvent.click(acceptBtn);
      expect(onAccept).toHaveBeenCalledWith('off-1');

      // Reject
      const rejectBtn = screen.getByRole('button', { name: /رفض/ });
      fireEvent.click(rejectBtn);
      expect(onReject).toHaveBeenCalledWith('off-1');
    });
  });

  describe('TrackingSheet', () => {
    it('renders timeline of stops, captain phone call link, and in-app chat button', () => {
      const order: any = {
        id: 'ord-1',
        status: OrderStatus.IN_PROGRESS,
        stops: [
          { id: 'st1', seq: 1, actionNameAr: 'شراء', status: 'completed' },
          { id: 'st2', seq: 2, actionNameAr: 'توصيل', status: 'in_progress' },
        ],
      };

      const agreement: any = {
        id: 'agr-1',
        driverName: 'كابتن محمود',
        driverPhone: '01099887766',
        agreedFareMinor: 2600,
        formattedAgreedFareEgp: '26 ج.م',
        status: AgreementStatus.ACTIVE,
      };

      const onOpenChat = vi.fn();

      render(
        <TrackingSheet
          order={order}
          agreement={agreement}
          onApproveAmendment={vi.fn()}
          onRejectAmendment={vi.fn()}
          onApproveInFlightStop={vi.fn()}
          onRejectInFlightStop={vi.fn()}
          onOpenChat={onOpenChat}
        />,
      );

      expect(screen.getByText(/الكابتن كابتن محمود/)).toBeInTheDocument();
      expect(screen.getByText(/الأجرة المتفق عليها: 26 ج.م/)).toBeInTheDocument();

      // Check phone call link
      const phoneLink = screen.getByRole('link', { name: 'اتصال هاتفي بالكابتن' });
      expect(phoneLink).toHaveAttribute('href', 'tel:01099887766');

      // Check chat button
      const chatBtn = screen.getByRole('button', { name: 'محادثة داخل التطبيق مع الكابتن' });
      fireEvent.click(chatBtn);
      expect(onOpenChat).toHaveBeenCalled();
    });
  });

  describe('InvoiceSheet', () => {
    it('renders invoices list and confirms customer payment without wallet/gateway', () => {
      const invoices: any[] = [
        {
          id: 'inv-101',
          amountMinor: 16000,
          formattedAmountEgp: '160 ج.م',
          verifiedByCustomer: false,
          customerNote: 'مشتريات بقالة',
        },
      ];

      const onConfirmPayment = vi.fn();
      const onDispute = vi.fn();

      render(
        <InvoiceSheet
          invoices={invoices}
          onConfirmPayment={onConfirmPayment}
          onDispute={onDispute}
          isProcessing={false}
        />,
      );

      expect(screen.getByText(/فواتير المشتريات المسجلة/)).toBeInTheDocument();
      expect(screen.getByText('160 ج.م')).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: /تأكيد السداد/ });
      fireEvent.click(confirmBtn);
      expect(onConfirmPayment).toHaveBeenCalledWith('inv-101', 16000);
    });
  });

  describe('DoneSheet', () => {
    it('renders two-line settlement without pricing formula and enables 1-5 star rating and "طلب جديد"', () => {
      const agreement: any = {
        id: 'agr-1',
        agreedFareMinor: 2600,
      };

      const invoices: any[] = [
        { id: 'inv-1', amountMinor: 16000, verifiedByCustomer: true },
      ];

      const onSubmitRating = vi.fn();
      const onNewOrder = vi.fn();

      render(
        <DoneSheet
          agreement={agreement}
          invoices={invoices}
          onSubmitRating={onSubmitRating}
          onNewOrder={onNewOrder}
          isSubmittingRating={false}
        />,
      );

      expect(screen.getByText('تم اكتمال المشوار بنجاح')).toBeInTheDocument();

      // Check two-line settlement
      expect(screen.getByText('قيمة المشتريات (مسددة للمتجر):')).toBeInTheDocument();
      expect(screen.getByText('أجرة الكابتن:')).toBeInTheDocument();

      // Submit Rating
      const rateBtn = screen.getByRole('button', { name: 'إرسال التقييم' });
      fireEvent.click(rateBtn);
      expect(onSubmitRating).toHaveBeenCalledWith(5, '');

      // New order
      const newOrderBtn = screen.getByRole('button', { name: /طلب جديد/ });
      fireEvent.click(newOrderBtn);
      expect(onNewOrder).toHaveBeenCalled();
    });
  });
});
