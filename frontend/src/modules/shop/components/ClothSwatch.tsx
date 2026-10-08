import type { CSSProperties } from 'react';
import type { ClothingDefinition, FabricPattern } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';

/** A fabric sample drawn with CSS gradients: ankara dots, aso-oke stripes, adire rings, check, denim… */
function fabricStyle(pattern: FabricPattern, primary: string, secondary: string): CSSProperties {
  switch (pattern) {
    case 'ankara':
      return {
        backgroundColor: primary,
        backgroundImage: `radial-gradient(circle at 50% 50%, ${secondary} 0 28%, transparent 30%), radial-gradient(circle at 0 0, ${secondary} 0 14%, transparent 16%)`,
        backgroundSize: '12px 12px',
      };
    case 'aso-oke':
      return { backgroundImage: `repeating-linear-gradient(90deg, ${primary} 0 4px, ${secondary} 4px 6px)` };
    case 'lace':
      return {
        backgroundColor: primary,
        backgroundImage: `radial-gradient(circle, ${secondary} 0 1.2px, transparent 1.6px)`,
        backgroundSize: '6px 6px',
      };
    case 'stripes':
      return { backgroundImage: `repeating-linear-gradient(0deg, ${primary} 0 5px, ${secondary} 5px 8px)` };
    case 'denim':
      return {
        backgroundColor: primary,
        backgroundImage: `repeating-linear-gradient(45deg, ${secondary}55 0 1px, transparent 1px 4px)`,
      };
    case 'adire':
      return {
        backgroundImage: `repeating-radial-gradient(circle at 30% 30%, ${primary} 0 4px, ${secondary} 4px 6px)`,
      };
    case 'check':
      return {
        backgroundColor: primary,
        backgroundImage: `linear-gradient(90deg, ${secondary}88 50%, transparent 50%), linear-gradient(0deg, ${secondary}88 50%, transparent 50%)`,
        backgroundSize: '10px 10px',
      };
    default:
      return {
        backgroundColor: primary,
        backgroundImage: `linear-gradient(135deg, transparent 72%, ${secondary} 72%)`,
      };
  }
}

/** Decorative fabric tile for a clothing item (the name always sits beside it). */
export function ClothSwatch({
  clothing,
  className,
}: {
  readonly clothing: Pick<ClothingDefinition, 'pattern' | 'primary' | 'secondary'>;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('block rounded-card ring-1 ring-ink/15', className)}
      style={fabricStyle(clothing.pattern, clothing.primary, clothing.secondary)}
    />
  );
}
