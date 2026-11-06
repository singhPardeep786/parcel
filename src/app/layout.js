import "@/styles/globals.scss";
import { LanguageProvider } from "@/components/i18n/LanguageProvider";

export const metadata = {
  title: "Parcel",
  description: "Meetings aur tasks, Kratos frames ke saath.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="hi">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
