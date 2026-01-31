import type { Metadata } from "next";
import Script from "next/script";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "ResolutionAI - Outlook Add-in",
  description: "Sync your AI-scheduled tasks to your work calendar",
};

export default function AddinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="bg-white min-h-screen">{children}</body>
    </html>
  );
}
