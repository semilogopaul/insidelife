import type { Metadata } from 'next';
import { GameRoot } from './_components/GameRoot';

export const metadata: Metadata = { title: 'Play' };

export default function PlayPage() {
  return <GameRoot />;
}
