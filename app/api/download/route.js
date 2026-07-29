import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url') || searchParams.get('video');

    if (!rawUrl) {
      return NextResponse.json({ status: 'error', message: 'URL Kosong' }, { status: 400 });
    }

    // 1. Bersihkan URL tanpa merusak parameter bawaan TikTok
    let targetUrl = rawUrl.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/%5Cu002F/g, '/');

    // 2. Set Referer dinamis sesuai target
    let refererTarget = 'https://www.google.com/';
    if (targetUrl.includes('tiktok') || targetUrl.includes('byte') || targetUrl.includes('tiktokcdn')) {
      refererTarget = 'https://www.tiktok.com/';
    } else if (targetUrl.includes('fbcdn') || targetUrl.includes('facebook') || targetUrl.includes('akamai')) {
      refererTarget = 'https://www.facebook.com/';
    } else if (targetUrl.includes('instagram')) {
      refererTarget = 'https://www.instagram.com/';
    } else if (targetUrl.includes('twimg') || targetUrl.includes('twitter')) {
      refererTarget = 'https://twitter.com/';
    }

    // 3. TANGKAP HEADER RANGE DARI BROWSER (KUNCI UTAMA BIAR BISA DI-PLAY)
    const clientRange = request.headers.get('range');
    
    // Bikin header untuk dikirim ke server TikTok/FB
    const fetchHeaders = new Headers({
      'User-Agent': request.headers.get('user-agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': refererTarget,
      'Accept': '*/*'
    });

    // Kalau browser minta sepotong video (buffering), teruskan permintaan itu ke TikTok
    if (clientRange) {
      fetchHeaders.set('Range', clientRange);
    }

    // 4. TEMBAK KE SERVER TIKTOK/FB
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

    // 5. COPY SEMUA HEADER PENTING DARI TIKTOK KE BROWSER KITA
    const resHeaders = new Headers();
    resHeaders.set('Content-Type', response.headers.get('content-type') || 'video/mp4');
    resHeaders.set('Content-Disposition', 'inline'); // inline = putar di web
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Accept-Ranges', 'bytes'); // Kasih tau browser kalau kita support di-play maju-mundur

    // Teruskan ukuran file dan rentang data kalau ada
    if (response.headers.get('content-length')) {
      resHeaders.set('Content-Length', response.headers.get('content-length'));
    }
    if (response.headers.get('content-range')) {
      resHeaders.set('Content-Range', response.headers.get('content-range'));
    }

    // 6. ALIRKAN KE FRONTEND (status bisa 200 OK atau 206 Partial Content)
    return new NextResponse(response.body, { 
      status: response.status, 
      headers: resHeaders 
    });

  } catch (error) {
    return NextResponse.json({ status: 'error', message: `Server error: ${error.message}` }, { status: 500 });
  }
}
