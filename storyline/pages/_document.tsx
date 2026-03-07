import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en" className="dark">
      <Head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />
      </Head>
      <body className="min-h-screen bg-gray-950 text-white antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
