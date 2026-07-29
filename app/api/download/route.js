import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url') || searchParams.get('video');

    if (!rawUrl) {
      return NextResponse.json({ status: 'error', message: 'Parameter URL tidak ditemukan.' }, { status: 400 });
    }

    // 1. Bersihkan URL dari frontend
    let targetUrl = decodeURIComponent(rawUrl);
    targetUrl = targetUrl.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/%5Cu002F/g, '/');

    // 2. Siapkan Header Palsu (Spoofing)
    // Server Vercel yang akan mengambil video ini, jadi kita samarkan sebagai browser Chrome biasa.
    const fetchHeaders = new Headers({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Connection': 'keep-alive'
    });

    // Menangani video streaming (maju-mundur video)
    const clientRange = request.headers.get('range');
    if (clientRange) {
      fetchHeaders.set('Range', clientRange);
    }

    // Set referer hanya jika bukan dari TikTok (karena TikTok benci referer palsu ke file MP4 nya)
    if (targetUrl.includes('fbcdn') || targetUrl.includes('facebook')) {
      fetchHeaders.set('Referer', 'https://www.facebook.com/');
    } else if (targetUrl.includes('instagram')) {
      fetchHeaders.set('Referer', 'https://www.instagram.com/');
    }

    // 3. Tarik Video Melalui Server (Proxy)
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: fetchHeaders,
      // Jangan batasi ukuran di sini, biarkan mengalir
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: 'error', message: `Gagal mengambil media dari CDN: Status ${response.status}` },
        { status: response.status }
      );
    }

    // 4. Atur Header Balasan ke Browser User
    const resHeaders = new Headers();
    
    // Pertahankan tipe file asli (video/mp4, dll)
    const contentType = response.headers.get('content-type') || 'video/mp4';
    resHeaders.set('Content-Type', contentType);
    
    // Gunakan 'inline' agar bisa diputar langsung di web tanpa langsung terdownload
    resHeaders.set('Content-Disposition', 'inline');
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Accept-Ranges', 'bytes');

    // Teruskan ukuran file agar pemutar video tahu durasinya
    if (response.headers.get('content-length')) {
      resHeaders.set('Content-Length', response.headers.get('content-length'));
    }
    if (response.headers.get('content-range')) {
      resHeaders.set('Content-Range', response.headers.get('content-range'));
    }

    // 5. Alirkan Response Body langsung (Streaming)
    // Ini mencegah Vercel menahan file besar di RAM yang menyebabkan crash.
    return new NextResponse(response.body, { 
      status: response.status, 
      headers: resHeaders 
    });

  } catch (error) {
    return NextResponse.json({ 
      status: 'error', 
      message: `Terjadi kesalahan fatal pada server download: ${error.message}` 
    }, { status: 500 });
  }
}
