import type { AppProps } from "next/app";
import Head from "next/head";
import "../styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>East Africa Flood Disasters | icpacViz</title>
        <meta name="description" content="Devastating flood events across East African nations, 2019-2024." />
        <meta property="og:title" content="East Africa Flood Disasters | icpacViz" />
        <meta property="og:description" content="11 countries. 5.5M+ people affected. Interactive storyline with satellite maps." />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
