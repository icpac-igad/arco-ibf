import React from 'react';
import type { Metadata } from 'next';
import './styles/index.scss';
import '@teamimpact/veda-ui/lib/main.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'CMRA — Continuous Risk Monitoring & Assessment',
    template: '%s | CMRA',
  },
  description: 'Interactive early warning dashboard for flood and drought hazards across East Africa. Explore EM-DAT disaster events, Admin2 choropleth maps, and IBF forecast pipelines.',
  openGraph: {
    title: 'CMRA — Continuous Risk Monitoring & Assessment',
    description: 'Flood & drought early warning: D3 calendar heatmap, Admin2 choropleth, and IBF forecast pipelines for East Africa.',
    url: siteUrl,
    siteName: 'CMRA',
    locale: 'en_US',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='en'>
      <body>
        <div className='minh-viewport'>
          <main id='pagebody' tabIndex={-1}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
