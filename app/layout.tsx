import React from 'react';
import type { Metadata } from 'next';
import { baseUrl } from './sitemap';
import './styles/index.scss';
import '@teamimpact/veda-ui/lib/main.css';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl ?? 'http://localhost:3000'),
  title: {
    default: 'Disaster Calendar & Map Visualization',
    template: '%s | Disaster Viz',
  },
  description: 'Interactive D3.js calendar and choropleth map for disaster event visualization.',
  openGraph: {
    title: 'Disaster Calendar & Map Visualization',
    description: 'Explore disaster events through interactive visualizations.',
    url: baseUrl,
    siteName: 'Disaster Viz',
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
