'use client';

import dynamic from 'next/dynamic';
import { BETTING_APP_NAME } from '@insidelife/shared';
import { Spinner } from '@/common/components';
import type { PhoneAppDefinition } from '@/common/game/phone-apps';

const loading = () => (
  <div className="grid place-items-center py-16 text-text-soft">
    <Spinner />
  </div>
);

// Each app is its own feature module and its own code-split chunk.
const MapApp = dynamic(() => import('@/modules/map').then((m) => m.MapApp), { loading });
const BankApp = dynamic(() => import('@/modules/bank').then((m) => m.BankApp), { loading });
const JobsApp = dynamic(() => import('@/modules/jobs').then((m) => m.JobsApp), { loading });
const SchoolApp = dynamic(() => import('@/modules/school').then((m) => m.SchoolApp), { loading });
const HomesApp = dynamic(() => import('@/modules/homes').then((m) => m.HomesApp), { loading });
const ShopApp = dynamic(() => import('@/modules/shop').then((m) => m.ShopApp), { loading });
const MotorsApp = dynamic(() => import('@/modules/motors').then((m) => m.MotorsApp), { loading });
const FlightsApp = dynamic(() => import('@/modules/flights').then((m) => m.FlightsApp), { loading });
const HealthApp = dynamic(() => import('@/modules/health').then((m) => m.HealthApp), { loading });
const FamilyApp = dynamic(() => import('@/modules/family').then((m) => m.FamilyApp), { loading });
const InvestApp = dynamic(() => import('@/modules/invest').then((m) => m.InvestApp), { loading });
const GistApp = dynamic(() => import('@/modules/gist').then((m) => m.GistApp), { loading });
const FobesApp = dynamic(() => import('@/modules/fobes').then((m) => m.FobesApp), { loading });
const BettingApp = dynamic(() => import('@/modules/betting').then((m) => m.BettingApp), { loading });
const MessagesApp = dynamic(() => import('@/modules/gist').then((m) => m.MessagesApp), { loading });
const PromoteApp = dynamic(() => import('@/modules/promote').then((m) => m.PromoteApp), { loading });
const GoalsApp = dynamic(() => import('@/modules/goals').then((m) => m.GoalsApp), { loading });
const MeApp = dynamic(() => import('@/modules/me').then((m) => m.MeApp), { loading });

/** The phone's home screen, in order (each app's icon is its illustrated tile in `common/brand/app-icons`). */
export const PHONE_APPS: readonly PhoneAppDefinition[] = [
  { id: 'map', name: 'Map', component: MapApp },
  { id: 'messages', name: 'Messages', component: MessagesApp },
  { id: 'bank', name: 'Bank', component: BankApp },
  { id: 'jobs', name: 'Jobs', component: JobsApp },
  { id: 'school', name: 'School', component: SchoolApp },
  { id: 'homes', name: 'Homes', component: HomesApp },
  { id: 'shop', name: 'Shop', component: ShopApp },
  { id: 'motors', name: 'Motors', component: MotorsApp },
  { id: 'flights', name: 'Flights', component: FlightsApp },
  { id: 'health', name: 'Health', component: HealthApp },
  { id: 'family', name: 'Family', component: FamilyApp },
  { id: 'invest', name: 'Invest', component: InvestApp },
  { id: 'gist', name: 'Gist', component: GistApp },
  { id: 'fobes', name: 'Fobes', component: FobesApp },
  { id: 'betting', name: BETTING_APP_NAME, component: BettingApp },
  { id: 'promote', name: 'Promote', component: PromoteApp },
  { id: 'goals', name: 'Goals', component: GoalsApp },
  { id: 'me', name: 'Me', component: MeApp },
];
