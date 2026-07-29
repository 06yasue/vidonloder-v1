import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url') || searchParams.get('video');

    if (!rawUrl) {
      return NextResponse.json({ status: 'error', message: 'URL Kosong' }, { status: 400 });
    }

    // 1. BERSIHKAN URL
    let targetUrl = decodeURIComponent(rawUrl);
    targetUrl = targetUrl.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/%5Cu002F/g, '/');

    // 2. RAKIT HEADER YANG AMAN DARI 403 FORBIDDEN
    const fetchHeaders = new Headers();
    
    // Wajib: User Agent statis (harus persis sama dengan yang dipakai saat nge-scrape)
    fetchHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    fetchHeaders.set('Accept', '*/*');

    // Teruskan Range untuk streaming biar gak putus-putus
    const clientRange = request.headers.get('range');
    if (clientRange) {
      fetchHeaders.set('Range', clientRange);
    }

    // KUNCI ANTI 403: JANGAN KASIH REFERER KE TIKTOK CDN!
    // Kita cuma kasih referer kalau targetnya FB atau IG.
    if (targetUrl.includes('fbcdn') || targetUrl.includes('facebook') || targetUrl.includes('akamai')) {
      fetchHeaders.set('Referer', 'https://www.facebook.com/');
    } else if (targetUrl.includes('instagram') || targetUrl.includes('cdninstagram')) {
      fetchHeaders.set('Referer', 'https://www.instagram.com/');
    }
    // TikTok dibiarkan TANPA Referer agar dianggap sebagai direct-hit biasa.

    // 3. TEMBAK TARGET
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: fetchHeaders,
      redirect: 'follow'
    });

    if (!response.ok) {
      return NextResponse.json(
        { status: 'error', message: `Ditolak server target: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // 4. SIAPKAN BALASAN UNTUK BROWSER USER
    const resHeaders = new Headers();
    resHeaders.set('Content-Type', response.headers.get('content-type') || 'video/mp4');
    resHeaders.set('Content-Disposition', 'inline'); // INLINE = Untuk diputar di Web, BUKAN auto-download
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Accept-Ranges', 'bytes');

    // Copy panjang file biar bisa di-skip menit videonya (seeking)
    if (response.headers.get('content-length')) {
      resHeaders.set('Content-Length', response.headers.get('content-length'));
    }
    if (response.headers.get('content-range')) {
      resHeaders.set('Content-Range', response.headers.get('content-range'));
    }

    // 5. KIRIM DATA VIDEO
    return new NextResponse(response.body, { 
      status: response.status, 
      headers: resHeaders 
    });

  } catch (error) {
    return NextResponse.json({ status: 'error', message: `Server error: ${error.message}` }, { status: 500 });
  }
}
