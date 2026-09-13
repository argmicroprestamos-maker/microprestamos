import './globals.css';
export const metadata = { title: 'MicroPréstamos', description: 'Soluciones financieras simples y transparentes', robots: { index: true, follow: true } };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="es"><body>{children}</body></html>; }
