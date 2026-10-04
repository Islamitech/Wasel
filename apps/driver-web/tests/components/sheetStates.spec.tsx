import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OffSheet } from '../../src/components/sheet/OffSheet.js';
import { WaitingSheet } from '../../src/components/sheet/WaitingSheet.js';
import { IncomingOrderSheet } from '../../src/components/sheet/IncomingOrderSheet.js';
import { BiddingSheet } from '../../src/components/sheet/BiddingSheet.js';
import { RunSheet } from '../../src/components/sheet/RunSheet.js';
import { DoneSheet } from '../../src/components/sheet/DoneSheet.js';
import { DriverAppState, IncomingOrderCard } from '../../src/types/driver.js';
import '../../src/i18n.js';

const baseDriverState: DriverAppState = {
  sheetState: 'off',
  theme: 'light',
  user: {
    id: 'd-1',
    phone: '01011112222',
    fullName: 'كابتن محمود',
    roles: ['driver'],
  } as any,
  driverLocation: { latitude: 29.98, longitude: 31.12 },
  verification: {
    level: 1,
    status: 'approved',
    missingRequirements: ['criminal_record'],
  },
  subscription: {
    isActive: true,
    planCode: 'trial_30',
    planNameAr: 'باقة تجريبية 30 يوم',
    expiresAt: '2026-11-04T00:00:00Z',
    remainingDays: 28,
    isTrial: true,
  },
  incomingOrder: null,
  bidding: null,
  activeAgreement: null,
  currentStopIndex: 0,
  currentStopPhase: 'to_stop',
  waitStartTime: null,
  currentStopInvoice: null,
  pendingAmendments: [],
  settlement: null,
  todayEarnings: {
    completedTripsCount: 4,
    totalEarningsMinor: 14000,
    formattedTotalEarnings: '140 ج.م',
  },
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

describe('Driver Sheet States Component Tests', () => {
  describe('OffSheet', () => {
    it('renders trial status, verification level, today earnings, and primary "ابدأ استقبال الطلبات" button', () => {
      const onGoOnline = vi.fn();
      const onOpenMenu = vi.fn();

      render(
        <OffSheet
          state={baseDriverState}
          onGoOnline={onGoOnline}
          onOpenMenu={onOpenMenu}
        />,
      );

      // Verify trial days badge
      expect(screen.getByText(/28 يوم/)).toBeInTheDocument();

      // Verify today earnings
      expect(screen.getByText('140 ج.م')).toBeInTheDocument();
      expect(screen.getByText(/4 مشاوير مكتملة/)).toBeInTheDocument();

      // Verify primary action button
      const startButton = screen.getByRole('button', { name: /ابدأ استقبال الطلبات/ });
      expect(startButton).toBeInTheDocument();
      fireEvent.click(startButton);
      expect(onGoOnline).toHaveBeenCalled();

      // Verify menu button
      const menuButton = screen.getByLabelText(/القائمة والملف الشخصي/);
      fireEvent.click(menuButton);
      expect(onOpenMenu).toHaveBeenCalled();
    });
  });

  describe('WaitingSheet', () => {
    it('renders radar listening status, keep app open indicator, and "أخذ استراحة" button', () => {
      const onGoOffline = vi.fn();

      render(
        <WaitingSheet
          state={{ ...baseDriverState, sheetState: 'waiting' }}
          onGoOffline={onGoOffline}
          onOpenMenu={vi.fn()}
        />,
      );

      expect(screen.getByText(/متصل ومستعد/)).toBeInTheDocument();
      expect(screen.getByText(/ابقِ التطبيق مفتوحاً/)).toBeInTheDocument();

      const pauseButton = screen.getByRole('button', { name: /أخذ استراحة/ });
      expect(pauseButton).toBeInTheDocument();
      fireEvent.click(pauseButton);
      expect(onGoOffline).toHaveBeenCalled();
    });

    it('shows pending offline actions counter when actions are queued', () => {
      render(
        <WaitingSheet
          state={{ ...baseDriverState, sheetState: 'waiting', offlineQueueCount: 3 }}
          onGoOffline={vi.fn()}
          onOpenMenu={vi.fn()}
        />,
      );

      expect(screen.getByText(/3 إجراءات/)).toBeInTheDocument();
    });
  });

  describe('IncomingOrderSheet', () => {
    const mockOrderCard: IncomingOrderCard = {
      orderId: 'ord-123',
      orderType: 'shopping',
      minFareMinor: 3500,
      distanceMeters: 1200,
      billableVisits: 2,
      valueTierNameAr: '٢٠٠ - ٥٠٠ ج',
      loadSizeNameAr: 'صغيرة (دراجة/موتوسيكل)',
      waitMode: 'wait',
      expiresAt: new Date(Date.now() + 45000).toISOString(),
      stops: [
        {
          id: 'stop-1',
          seq: 1,
          actionCode: 'buy',
          actionNameAr: 'شراء من هنا',
          placeNameAr: 'سوبرماركت الفرجاني',
          notes: 'علبة لبن وزبادي',
          invoiceRequired: true,
          latitude: 29.98,
          longitude: 31.12,
        },
        {
          id: 'stop-2',
          seq: 2,
          actionCode: 'drop',
          actionNameAr: 'توصيل هنا',
          addressLabel: 'البوابة الرابعة - حورس',
          invoiceRequired: false,
          latitude: 29.99,
          longitude: 31.13,
        },
      ],
      rawOrder: {} as any,
    };

    it('renders minimum fare prominently as largest element, stops, and accept/decline buttons', () => {
      const onAcceptShopping = vi.fn();
      const onOpenBidding = vi.fn();
      const onDecline = vi.fn();

      render(
        <IncomingOrderSheet
          orderCard={mockOrderCard}
          onAcceptShopping={onAcceptShopping}
          onOpenBidding={onOpenBidding}
          onDecline={onDecline}
        />,
      );

      // Verify minimum fare is displayed prominently
      expect(screen.getByTestId('incoming-min-fare')).toHaveTextContent('35 ج.م');
      expect(screen.getByText('الحد الأدنى للأجرة')).toBeInTheDocument();

      // Verify order metadata
      expect(screen.getByText(/1.2 كم/)).toBeInTheDocument();
      expect(screen.getByText('٢٠٠ - ٥٠٠ ج')).toBeInTheDocument();

      // Verify stops list
      expect(screen.getByText(/سوبرماركت الفرجاني/)).toBeInTheDocument();
      expect(screen.getByText(/علبة لبن وزبادي/)).toBeInTheDocument();

      // Accept shopping order
      const acceptButton = screen.getByRole('button', { name: /قبول المشوار فوراً/ });
      expect(acceptButton).toBeInTheDocument();
      fireEvent.click(acceptButton);
      expect(onAcceptShopping).toHaveBeenCalledWith('ord-123');

      // Decline button
      const declineButton = screen.getByRole('button', { name: /تجاهل/ });
      fireEvent.click(declineButton);
      expect(onDecline).toHaveBeenCalledWith('ord-123');
    });

    it('renders "تقديم عرض سعر" button for transport / moving orders', () => {
      const movingOrderCard: IncomingOrderCard = {
        ...mockOrderCard,
        orderType: 'moving',
        suggestedFareMinor: 8000,
      };

      const onOpenBidding = vi.fn();

      render(
        <IncomingOrderSheet
          orderCard={movingOrderCard}
          onAcceptShopping={vi.fn()}
          onOpenBidding={onOpenBidding}
          onDecline={vi.fn()}
        />,
      );

      const bidButton = screen.getByRole('button', { name: /تقديم عرض سعر/ });
      expect(bidButton).toBeInTheDocument();
      fireEvent.click(bidButton);
      expect(onOpenBidding).toHaveBeenCalled();
    });
  });

  describe('BiddingSheet', () => {
    it('allows adjusting offer price with stepper (+ / -) and submits bid', () => {
      const biddingState = {
        orderId: 'ord-moving-1',
        suggestedFareMinor: 8000,
        currentOfferMinor: 8000,
        round: 1,
        maxRounds: 3,
        status: 'editing' as const,
      };

      const onUpdatePrice = vi.fn();
      const onSubmitBid = vi.fn();

      render(
        <BiddingSheet
          bidding={biddingState}
          onUpdatePrice={onUpdatePrice}
          onSubmitOffer={onSubmitBid}
          onAcceptCounter={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText('80')).toBeInTheDocument();
      expect(screen.getByText(/الجولة 1 من 3/)).toBeInTheDocument();

      // Increase price by 10 EGP (1000 minor)
      const plusBtn = screen.getByRole('button', { name: '+' });
      fireEvent.click(plusBtn);
      expect(onUpdatePrice).toHaveBeenCalledWith(9000);

      // Submit bid
      const sendBtn = screen.getByRole('button', { name: /إرسال عرض السعر للعميل/ });
      fireEvent.click(sendBtn);
      expect(onSubmitBid).toHaveBeenCalled();
    });

    it('displays counter offer from customer and allows accepting it', () => {
      const counterState = {
        orderId: 'ord-moving-1',
        suggestedFareMinor: 8000,
        currentOfferMinor: 9000,
        customerCounterMinor: 8500,
        round: 2,
        maxRounds: 3,
        status: 'counter_received' as const,
      };

      const onAcceptCounter = vi.fn();

      render(
        <BiddingSheet
          bidding={counterState}
          onUpdatePrice={vi.fn()}
          onSubmitBid={vi.fn()}
          onAcceptCounter={onAcceptCounter}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByText(/85 ج.م/)).toBeInTheDocument();
      const acceptCounterBtn = screen.getByRole('button', { name: /قبول عرض العميل/ });
      fireEvent.click(acceptCounterBtn);
      expect(onAcceptCounter).toHaveBeenCalled();
    });
  });

  describe('RunSheet', () => {
    const mockRunState: DriverAppState = {
      ...baseDriverState,
      sheetState: 'run',
      activeAgreement: {
        id: 'agr-101',
        orderId: 'ord-101',
        customerId: 'cust-101',
        driverId: 'd-1',
        customerName: 'أحمد العميل',
        customerPhone: '01099887766',
        agreedFareMinor: 2600,
        formattedAgreedFareEgp: '26 ج.م',
        agreementSnapshot: {
          stops: [
            {
              id: 'st-1',
              seq: 1,
              actionCode: 'buy',
              actionNameAr: 'شراء من هنا',
              placeNameAr: 'صيدلية العزبي',
              notes: 'دواء ضغط',
              invoiceRequired: true,
              location: { latitude: 29.98, longitude: 31.12 },
            },
            {
              id: 'st-2',
              seq: 2,
              actionCode: 'drop',
              actionNameAr: 'توصيل هنا',
              invoiceRequired: false,
              location: { latitude: 29.99, longitude: 31.13 },
            },
          ],
          waitMode: 'wait',
        },
        status: 'active' as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      currentStopIndex: 0,
      currentStopPhase: 'to_stop',
      isWakeLockActive: true,
    };

    it('renders current stop, phone call link, in-app chat, and primary "وصلت للمحطة" action', () => {
      const onArrive = vi.fn();
      const onOpenChat = vi.fn();

      render(
        <RunSheet
          state={mockRunState}
          onArrive={onArrive}
          onStartWait={vi.fn()}
          onEndWait={vi.fn()}
          onIssueInvoice={vi.fn()}
          onPaymentConfirmed={vi.fn()}
          onCompleteStop={vi.fn()}
          onCompleteAgreement={vi.fn()}
          onOpenChat={onOpenChat}
          onOpenCancelModal={vi.fn()}
          onAddInFlightStop={vi.fn()}
        />,
      );

      // Verify customer phone call link exists
      const callLink = screen.getByRole('link', { name: /اتصال بالعميل/ });
      expect(callLink).toHaveAttribute('href', 'tel:01099887766');

      // Verify chat button
      const chatBtn = screen.getByRole('button', { name: /محادثة فورية/ });
      fireEvent.click(chatBtn);
      expect(onOpenChat).toHaveBeenCalled();

      // Verify stop details
      expect(screen.getByText(/صيدلية العزبي/)).toBeInTheDocument();
      expect(screen.getByText(/دواء ضغط/)).toBeInTheDocument();

      // Verify primary action button in 'to_stop' phase
      const arriveBtn = screen.getByRole('button', { name: /وصلت للمحطة/ });
      expect(arriveBtn).toBeInTheDocument();
      fireEvent.click(arriveBtn);
      expect(onArrive).toHaveBeenCalled();
    });

    it('transitions primary button to "إصدار وتصوير فاتورة المتجر" at stop when invoice is required', () => {
      const atStopState: DriverAppState = {
        ...mockRunState,
        currentStopPhase: 'at_stop',
      };

      render(
        <RunSheet
          state={atStopState}
          onArrive={vi.fn()}
          onStartWait={vi.fn()}
          onEndWait={vi.fn()}
          onIssueInvoice={vi.fn()}
          onPaymentConfirmed={vi.fn()}
          onCompleteStop={vi.fn()}
          onCompleteAgreement={vi.fn()}
          onOpenChat={vi.fn()}
          onOpenCancelModal={vi.fn()}
          onAddInFlightStop={vi.fn()}
        />,
      );

      const invoiceBtn = screen.getByRole('button', { name: /إصدار وتصوير فاتورة المتجر/ });
      expect(invoiceBtn).toBeInTheDocument();
      fireEvent.click(invoiceBtn);

      // Verify invoice modal opens
      expect(screen.getByRole('heading', { name: /تسجيل فاتورة المتجر/ })).toBeInTheDocument();
    });
  });

  describe('DoneSheet', () => {
    const doneState: DriverAppState = {
      ...baseDriverState,
      sheetState: 'done',
      settlement: {
        visitsFeeMinor: 2000,
        waitFeeMinor: 0,
        goodsCommissionMinor: 1600,
        invoicesTotalMinor: 16000,
        totalFareMinor: 3600,
        formattedTotalFare: '36 ج.م',
        currency: 'EGP',
      },
      todayEarnings: {
        completedTripsCount: 5,
        totalEarningsMinor: 17600,
        formattedTotalEarnings: '176 ج.م',
      },
    };

    it('renders settlement breakdown, today earnings, star rating, and new order actions', () => {
      const onRateCustomer = vi.fn();
      const onNewOrder = vi.fn();
      const onGoOffline = vi.fn();

      render(
        <DoneSheet
          state={doneState}
          onRateCustomer={onRateCustomer}
          onNewOrder={onNewOrder}
          onGoOffline={onGoOffline}
        />,
      );

      // Settlement breakdown
      const totalFare = screen.getByTestId('settlement-total-fare');
      expect(totalFare).toHaveTextContent('36');
      expect(screen.getByText(/أجر الزيارات والمحطات/)).toBeInTheDocument();
      expect(screen.getByText(/عمولة البضائع والمشتريات/)).toBeInTheDocument();
      expect(screen.getByText(/مشتريات المتجر المسددة/)).toBeInTheDocument();

      // Today earnings
      expect(screen.getByText('176 ج.م')).toBeInTheDocument();
      expect(screen.getByText(/5 مشاوير منجزة/)).toBeInTheDocument();

      // Submit Rating
      const starButtons = screen.getAllByText('★');
      expect(starButtons.length).toBe(5);
      fireEvent.click(starButtons[4]!); // 5th star
      const submitRatingBtn = screen.getByRole('button', { name: /إرسال التقييم/ });
      fireEvent.click(submitRatingBtn);
      expect(onRateCustomer).toHaveBeenCalledWith(5, undefined);

      // Primary button "مستعد لمشوار جديد"
      const newOrderBtn = screen.getByRole('button', { name: /مستعد لمشوار جديد/ });
      fireEvent.click(newOrderBtn);
      expect(onNewOrder).toHaveBeenCalled();

      // Secondary action "إنهاء الوردية وأخذ استراحة"
      const offlineBtn = screen.getByRole('button', { name: /إنهاء الوردية وأخذ استراحة/ });
      fireEvent.click(offlineBtn);
      expect(onGoOffline).toHaveBeenCalled();
    });
  });
});
