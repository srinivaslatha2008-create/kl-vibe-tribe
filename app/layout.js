import './globals.css'

export const metadata = {
  title: 'KL Vibe Tribe',
  description: 'Your campus. Your people. Your vibe.'
}

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>
}
