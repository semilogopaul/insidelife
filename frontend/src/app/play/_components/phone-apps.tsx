'use client';

import { Banknote, BookOpen, Briefcase, Car, HeartPulse, House, Map as MapIcon, Megaphone, MessagesSquare, ShoppingBag, Target, TrendingUp, User, Users } from 'lucide-react';
import dynamic from 'next/dynamic';
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
const HealthApp = dynamic(() => import('@/modules/health').then((m) => m.HealthApp), { loading });
const FamilyApp = dynamic(() => import('@/modules/family').then((m) => m.FamilyApp), { loading });
const InvestApp = dynamic(() => import('@/modules/invest').then((m) => m.InvestApp), { loading });
const GistApp = dynamic(() => import('@/modules/gist').then((m) => m.GistApp), { loading });
const PromoteApp = dynamic(() => import('@/modules/promote').then((m) => m.PromoteApp), { loading });
const GoalsApp = dynamic(() => import('@/modules/goals').then((m) => m.GoalsApp), { loading });
const MeApp = dynamic(() => import('@/modules/me').then((m) => m.MeApp), { loading });

/** The phone's home screen, in order. */
export const PHONE_APPS: readonly PhoneAppDefinition[] = [
  { id: 'map', name: 'Map', icon: MapIcon, tint: '#13606b', component: MapApp },
  { id: 'bank', name: 'Bank', icon: Banknote, tint: '#0f8a4f', component: BankApp },
  { id: 'jobs', name: 'Jobs', icon: Briefcase, tint: '#2457d6', component: JobsApp },
  { id: 'school', name: 'School', icon: BookOpen, tint: '#7a3fbf', component: SchoolApp },
  { id: 'homes', name: 'Homes', icon: House, tint: '#d9692b', component: HomesApp },
  { id: 'shop', name: 'Shop', icon: ShoppingBag, tint: '#c8287a', component: ShopApp },
  { id: 'motors', name: 'Motors', icon: Car, tint: '#0e2733', component: MotorsApp },
  { id: 'health', name: 'Health', icon: HeartPulse, tint: '#e2412e', component: HealthApp },
  { id: 'family', name: 'Family', icon: Users, tint: '#b8823d', component: FamilyApp },
  { id: 'invest', name: 'Invest', icon: TrendingUp, tint: '#1e7a62', component: InvestApp },
  { id: 'gist', name: 'Gist', icon: MessagesSquare, tint: '#25a366', component: GistApp },
  { id: 'promote', name: 'Promote', icon: Megaphone, tint: '#f6b90b', component: PromoteApp },
  { id: 'goals', name: 'Goals', icon: Target, tint: '#3d4d6e', component: GoalsApp },
  { id: 'me', name: 'Me', icon: User, tint: '#4b6470', component: MeApp },
];
