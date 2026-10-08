/** Friendly empty state for phone apps that are still being built. */
export function ComingSoon({ app }: { readonly app: string }) {
  return (
    <div className="py-10 text-center">
      <p className="type-title text-2xl">{app} is coming</p>
      <p className="mt-2 text-text-soft">This app is being built right now. Check back soon.</p>
    </div>
  );
}
