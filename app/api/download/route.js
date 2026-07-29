export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('URL video tidak ditemukan', { status: 400 });
  }

  try {
    // Ambil video dari server asli (menyamar)
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': targetUrl
      }
    });

    if (!response.ok) {
      return new Response('Gagal memuat video dari server asal', { status: response.status });
    }

    // Set header agar video diputar di browser (inline), bukan langsung di-download
    const headers = new Headers(response.headers);
    headers.set('Content-Disposition', 'inline'); 
    headers.set('Content-Type', 'video/mp4');

    // Meneruskan stream video ke frontend
    return new Response(response.body, {
      status: 200,
      headers: headers
    });
    
  } catch (error) {
    return new Response('Terjadi kesalahan server internal', { status: 500 });
  }
}
