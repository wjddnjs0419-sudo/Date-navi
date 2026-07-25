import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
