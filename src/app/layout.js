import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sansFont = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "zedarchive — Quiet Media Archive",
  description: "A fast, distraction-free archive for your anime, TV series, novels, and books.",
  icons: {
    icon: "/zedarchivelogo.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sansFont.variable} ${monoFont.variable}`}>
      <body>
        <a href="#main-content" className="za-skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}


