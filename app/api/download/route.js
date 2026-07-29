export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('URL video tidak ditemukan di parameter', { status: 400 });
  }

  // Cek apakah URL valid
  if (!targetUrl.startsWith('http')) {
    return new Response(`Format URL rusak/tidak valid: ${targetUrl}`, { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0',
        'Referer': 'https://www.tiktok.com/'
      }
    });

    if (!response.ok) {
      return new Response(`Gagal memuat video dari server asal. Status server target: ${response.status}`, { status: response.status });
    }

    const headers = new Headers(response.headers);
    headers.set('Content-Disposition', 'inline'); 
    headers.set('Content-Type', 'video/mp4');

    return new Response(response.body, {
      status: 200,
      headers: headers
    });
    
  } catch (error) {
    return new Response(`Terjadi kesalahan server internal saat fetch video: ${error.message}`, { status: 500 });
  }
}
