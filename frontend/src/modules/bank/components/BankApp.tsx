'use client';

import { useState } from 'react';
import { useUi } from '@/common/game/ui-store';
import { useLiveWallet } from '../hooks/use-wallet';
import { isBankScreen, type BankScreen } from '../types/bank';
import { BankHome } from './BankHome';
import { SavingsScreen } from './savings/SavingsScreen';
import { SendFlow } from './send/SendFlow';
import { StatementScreen } from './statement/StatementScreen';
import { TopUpScreen } from './topup/TopUpScreen';

/**
 * Bank phone app: balances, statement, send to @handle, savings and real-money top-ups. Deep links:
 * `openPhone('bank', 'send' | 'topup' | 'savings' | 'statement')`.
 */
export function BankApp() {
  const param = useUi((state) => state.phoneParam);
  const [screen, setScreen] = useState<BankScreen>(() => (isBankScreen(param) ? param : 'home'));
  useLiveWallet();
  const home = (): void => setScreen('home');

  switch (screen) {
    case 'send':
      return <SendFlow onExit={home} onTopUp={() => setScreen('topup')} onSavings={() => setScreen('savings')} />;
    case 'topup':
      return <TopUpScreen onBack={home} />;
    case 'savings':
      return <SavingsScreen onBack={home} />;
    case 'statement':
      return <StatementScreen onBack={home} />;
    default:
      return <BankHome onOpen={setScreen} />;
  }
}
