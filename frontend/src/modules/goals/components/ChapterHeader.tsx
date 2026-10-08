import type { LifeChapterDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';

/** The current chapter painted like a danfo side panel, with every chapter as a segment. */
export function ChapterHeader({ chapter, chapters, clout }: { readonly chapter: LifeChapterDto; readonly chapters: readonly LifeChapterDto[]; readonly clout: { readonly earned: number; readonly cap: number } }) {
  return (
    <section aria-label={`Chapter ${chapter.number}: ${chapter.title}`} className="relative overflow-hidden rounded-card bg-ink text-on-ink">
      <div className="px-4 pb-4 pt-3.5">
        <p className="text-xs font-bold text-danfo">
          Chapter {chapter.number} of {chapters.length}
        </p>
        <h3 className="type-slogan mt-1 text-[2.6rem] uppercase text-on-ink">{chapter.title}</h3>
        <p className="mt-1.5 text-sm text-on-ink-soft">{chapter.tagline}</p>
        <ol className="mt-3.5 flex gap-1.5" aria-label="Chapters">
          {chapters.map((item) => {
            const ratio = item.totalGoals > 0 ? item.completedGoals / item.totalGoals : 0;
            return (
              <li key={item.id} className="flex-1">
                <span className="sr-only">
                  Chapter {item.number}, {item.title}: {item.complete ? 'complete' : item.unlocked ? `${item.completedGoals} of ${item.totalGoals} goals` : 'locked'}
                </span>
                <span aria-hidden className={cn('block h-2 overflow-hidden rounded-full', item.unlocked ? 'bg-white/15' : 'bg-white/6')}>
                  <span className="block h-full rounded-full bg-danfo" style={{ width: `${item.complete ? 100 : ratio * 100}%` }} />
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 flex justify-between text-xs text-on-ink-soft">
          <span>
            {chapter.completedGoals} of {chapter.totalGoals} goals done
          </span>
          <span className="tabular">
            Clout from goals {clout.earned}/{clout.cap}
          </span>
        </p>
      </div>
      <span aria-hidden className="block h-[9px] danfo-stripes [--color-ink:var(--color-danfo)]" />
    </section>
  );
}
