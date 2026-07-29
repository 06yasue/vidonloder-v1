export const metadata = {
  title: 'Multi Video Downloader',
  description: 'Scraper murni Next.js',
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link 
          rel="stylesheet" 
          href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css" 
        />
      </head>
      <body style={{ backgroundColor: '#ffffff', color: '#333333', margin: '20px' }}>
        <div className="container">
          {children}
        </div>
      </body>
    </html>
  )
}

