import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('video') || searchParams.get('url');
    const type = searchParams.get('type') || 'video';

    if (!rawUrl) {
      return NextResponse.json({ status: 'error', message: 'URL tidak ditemukan' }, { status: 400 });
    }

    // 1. BERSIHKAN URL MUTLAK
    // Mencegah error jika URL dari frontend masih bawa karakter aneh (%2F, \u002F)
    let targetUrl = decodeURIComponent(rawUrl);
    targetUrl = targetUrl.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/%5Cu002F/g, '/');

    if (!targetUrl.startsWith('http')) {
      return NextResponse.json({ status: 'error', message: 'Format URL rusak: ' + targetUrl }, { status: 400 });
    }

    // 2. REFERER DINAMIS (Anti-Blokir Server)
    // Otomatis ganti referer menyesuaikan sumber video biar gak ditolak (Failed to retrieve)
    let refererTarget = 'https://www.google.com/';
    if (targetUrl.includes('tiktok') || targetUrl.includes('byte')) {
      refererTarget = 'https://www.tiktok.com/';
    } else if (targetUrl.includes('fbcdn') || targetUrl.includes('facebook') || targetUrl.includes('akamai')) {
      refererTarget = 'https://www.facebook.com/';
    } else if (targetUrl.includes('instagram') || targetUrl.includes('cdninstagram')) {
      refererTarget = 'https://www.instagram.com/';
    } else if (targetUrl.includes('twimg') || targetUrl.includes('twitter')) {
      refererTarget = 'https://twitter.com/';
    }

    // 3. TARIK DATA DARI SERVER ASLI
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 
        'Referer': refererTarget, 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });

    if (!response.ok) {
      throw new Error(`Akses ditolak oleh CDN target (Status: ${response.status})`);
    }

    // 4. ATUR HEADER AGAR BISA DIPUTAR (BUKAN LANGSUNG DOWNLOAD)
    const headers = new Headers();
    
    // Ambil format asli video/audio dari server sumber
    const contentType = response.headers.get('content-type') || (type === 'audio' ? 'audio/mpeg' : 'video/mp4');
    headers.set('Content-Type', contentType);
    
    // Ambil ukuran file (Penting agar video bisa di-klik maju-mundur/seek)
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    // INLINE = Putar di browser (Preview). ATTACHMENT = Langsung download otomatis.
    // Sesuai permintaan lo, kita set inline.
    headers.set('Content-Disposition', 'inline');
    
    // Bypass aturan CORS
    headers.set('Access-Control-Allow-Origin', '*');

    // ALIRKAN VIDEO KE FRONTEND
    return new NextResponse(response.body, { status: 200, headers });

  } catch (error) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
