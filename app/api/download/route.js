import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    let targetUrl = searchParams.get('url');

    // Cek apakah URL ada
    if (!targetUrl) {
      return new NextResponse('Error: Parameter URL tidak ada', { status: 400 });
    }

    // BERSIHKAN URL DARI FRONTEND (Lapis Akhir)
    // Front-end kadang ngirim URL dalam bentuk ke-encode seperti %252F
    targetUrl = decodeURIComponent(targetUrl);
    targetUrl = targetUrl.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/%5Cu002F/g, '/');

    // Validasi apakah ini link HTTP beneran
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return new NextResponse(`Error: URL cacat atau bukan HTTP -> ${targetUrl}`, { status: 400 });
    }

    // SIASAT ANTI-BLOKIR (DYNAMIC REFERER)
    // Server nolak kalau ketahuan di-download dari web lain. Kita palsukan identitasnya.
    let fakeReferer = 'https://www.google.com/';
    if (targetUrl.includes('tiktok') || targetUrl.includes('tiktokcdn') || targetUrl.includes('byte')) {
      fakeReferer = 'https://www.tiktok.com/';
    } else if (targetUrl.includes('fbcdn') || targetUrl.includes('facebook') || targetUrl.includes('akamai')) {
      fakeReferer = 'https://www.facebook.com/';
    } else if (targetUrl.includes('instagram') || targetUrl.includes('cdninstagram')) {
      fakeReferer = 'https://www.instagram.com/';
    } else if (targetUrl.includes('twimg') || targetUrl.includes('twitter')) {
      fakeReferer = 'https://twitter.com/';
    }

    // TEMBAK VIDEO ASLI
    const videoResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': fakeReferer,
        'Accept': '*/*', // Terima semua format video
        'Connection': 'keep-alive'
      },
      // Penting: Jangan biarkan node.js buffer semua data kalau videonya gede
      // di Next.js App router, response body bisa langsung di pipe
    });

    if (!videoResponse.ok) {
      return new NextResponse(`Akses Ditolak oleh Server Pusat. Kode Status: ${videoResponse.status}`, { status: videoResponse.status });
    }

    // PERSIAPKAN HEADER UNTUK DIKIRIM BALIK KE BROWSER LU
    const headers = new Headers();
    
    // Copy tipe file aslinya (misal: video/mp4)
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
    headers.set('Content-Type', contentType);
    
    // Copy ukuran file biar video bisa di-seek (digeser maju mundur) dan tau kapan download selesai
    const contentLength = videoResponse.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    // Atur supaya video langsung diputar (inline). 
    // Kalau lu mau otomatis ke-download pas diklik, ganti 'inline' jadi 'attachment; filename="video.mp4"'
    headers.set('Content-Disposition', 'inline');

    // Bypass CORS
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    // ALIRKAN VIDEO KE FRONTEND
    return new NextResponse(videoResponse.body, {
      status: 200,
      headers: headers
    });

  } catch (error) {
    return new NextResponse(`Kesalahan Server Internal pada API Download: ${error.message}`, { status: 500 });
  }
}
