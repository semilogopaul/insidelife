'use client';

export default function GlobalError({ reset }: { readonly error: Error; readonly reset: () => void }) {
  return (
    <html lang="en-NG">
      <body style={{ margin: 0, background: '#0e2733', color: '#f4f7f5', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
          <div>
            <h1 style={{ fontSize: 28, margin: 0 }}>Inside Life hit a snag</h1>
            <p style={{ opacity: 0.8 }}>Your progress is saved on the server.</p>
            <button
              type="button"
              onClick={reset}
              style={{ marginTop: 16, height: 44, padding: '0 20px', borderRadius: 14, border: 0, background: '#f6b90b', color: '#0e2733', fontWeight: 700 }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
