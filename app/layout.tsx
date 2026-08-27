import "./globals.css";
export const metadata = { title: "HireLens", description: "Secure recruitment visibility for hiring teams" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
