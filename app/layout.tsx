import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "MemoryMirror",
  description: "See, trace, and correct the memories an assistant is using.",
};

const themeBoot = `(function(){try{var r=JSON.parse(localStorage.getItem("memorymirror")||"null");var t=r&&r.state&&r.state.theme;if(t==="dark"||t==="light")document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        <Script id="theme-boot" strategy="beforeInteractive">
          {themeBoot}
        </Script>
        {children}
      </body>
    </html>
  );
}
