import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>HireLoop – AI Resume Optimization for ATS Systems</title>
        <meta
          name="description"
          content="HireLoop is an AI-powered resume optimization platform that tailors your resume and cover letter for specific job descriptions."
        />
      </Head>
      <Component {...pageProps} />
    </>
  );
}

export default MyApp;

