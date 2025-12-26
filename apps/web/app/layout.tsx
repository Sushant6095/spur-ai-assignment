import './globals.css';
import { ReactNode } from 'react';

export const metadata = {
  title: 'Spur Support',
  description: 'Customer support chat powered by Spur',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

