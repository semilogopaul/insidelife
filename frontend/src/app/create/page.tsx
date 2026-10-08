import type { Metadata } from 'next';
import { CreatorRoute } from './CreatorRoute';

export const metadata: Metadata = { title: 'Create your character' };

export default function CreatePage() {
  return <CreatorRoute />;
}
