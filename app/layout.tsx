import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Huddle — The Virtual Calling Floor for Real Estate Teams',
  description: 'Join your team on a live video calling floor. Stay muted while you dial, unmute to talk to the group, and share wins in real time.',
  openGraph: {
    title: 'Huddle — Virtual Calling Floor',
    description: 'A live video sales floor for real estate agents, teams and brokerages.',
    type: 'website',
  },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b0c0f' };

const themeScript = `try{var t=localStorage.getItem('huddle-theme')||'dark';document.documentElement.dataset.theme=t;var s=localStorage.getItem('huddle-stage');if(s)document.documentElement.style.setProperty('--stage',s);}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
