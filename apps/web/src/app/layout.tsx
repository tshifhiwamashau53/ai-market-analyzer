import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"AI Market Analyzer PRO",description:"Read-only quantitative market research dashboard."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}