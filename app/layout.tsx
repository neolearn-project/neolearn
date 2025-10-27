export const metadata = { title: "NeoLearn â€” The Future of Learning", description: "AI-powered education for every child." };
import "../styles/globals.css";
export default function RootLayout({ children }:{children:React.ReactNode}) {
  return (<html lang="en"><body>{children}</body></html>);
}
