import type { ReactNode } from 'react';

export const metadata = { title: 'focus-swarm', description: 'Synthetic focus groups on 0G + AXL + ENS' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', margin: 0, background: '#0e0e10', color: '#e8e8ea' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>{children}</div>
      </body>
    </html>
  );
}
