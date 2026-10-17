const STEPS = [
  { title: 'Born', body: 'Fate deals your family: Sapa Pikin in Mushin or Nepo Baby in Lekki. No rerolls.' },
  { title: 'School', body: 'Write WAEC and JAMB. UNILAG on ₦190k a year, or Pan-Atlantic if Daddy can pay. Pray ASUU behaves.' },
  { title: 'Hustle', body: 'POS stand to partner at a law firm, or remote dev paid in dollars. Promotions are earned.' },
  { title: 'Build', body: 'Rent in Yaba, buy land in Epe with a real C of O, build, let it out. Watch for omonile.' },
  { title: 'Legacy', body: 'Marry, raise children, grow old. When you go, your heir inherits what you built.' },
] as const;

/** The arc of a life — a real sequence, so it's numbered. */
export function LifePath() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-card bg-white/10 sm:grid-cols-5">
      {STEPS.map((step, index) => (
        <li key={step.title} className="bg-ink p-5">
          <span className="type-figure text-3xl text-danfo">{index + 1}</span>
          <h3 className="type-title mt-2 text-xl text-on-ink">{step.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-on-ink-soft">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
