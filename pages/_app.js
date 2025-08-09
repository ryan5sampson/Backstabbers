import '../styles/app.css';  // <-- note: app.css (we'll create this)

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
