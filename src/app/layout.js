import "./globals.css";

export const metadata = {
  title: "zedarchive — Quiet Media Archive",
  description: "A fast, distraction-free archive for your anime, TV series, novels, and books.",
  icons: {
    icon: "/zedarchivelogo.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="za-skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
