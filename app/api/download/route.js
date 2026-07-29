import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url') || searchParams.get('video');

    if (!rawUrl) {
      return NextResponse.json({ status: 'error', message: 'URL Kosong' }, { status: 400 });
    }

    let targetUrl = decodeURIComponent(rawUrl);

    // KUNCI BYPASS 403 FORBIDDEN: Sesuaikan Referer berdasarkan domain CDN
    let refererHeader = 'https://www.google.com/';
    
    // Tambahkan XNXX & XVIDEOS
    if (targetUrl.includes('xvideos.com') || targetUrl.includes('xv-phcdn') || targetUrl.includes('xnxx')) {
      refererHeader = targetUrl.includes('xnxx') ? 'https://www.xnxx.com/' : 'https://www.xvideos.com/';
    } else if (targetUrl.includes('phncdn.com') || targetUrl.includes('pornhub')) {
      refererHeader = 'https://www.pornhub.com/';
    } else if (targetUrl.includes('fbcdn') || targetUrl.includes('facebook')) {
      refererHeader = 'https://www.facebook.com/';
    } else if (targetUrl.includes('tiktok') || targetUrl.includes('byteoversea') || targetUrl.includes('ibyteimg')) {
      refererHeader = 'https://www.tiktok.com/';
    } else if (targetUrl.includes('instagram') || targetUrl.includes('cdninstagram')) {
      refererHeader = 'https://www.instagram.com/';
    }

    const fetchHeaders = new Headers({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': refererHeader,
      'Accept': '*/*'
    });

    // Teruskan Range biar video bisa diputar di web tanpa auto-download
    const clientRange = request.headers.get('range');
    if (clientRange) {
      fetchHeaders.set('Range', clientRange);
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: fetchHeaders
    });

    if (!response.ok) {
      return NextResponse.json({ status: 'error', message: `Gagal dari sumber CDN: ${response.status}` }, { status: response.status });
    }

    const resHeaders = new Headers();
    // Jika URL m3u8 (HLS Format) sesuaikan Content-Type
    const isM3u8 = targetUrl.includes('.m3u8');
    resHeaders.set('Content-Type', response.headers.get('content-type') || (isM3u8 ? 'application/x-mpegURL' : 'video/mp4'));
    resHeaders.set('Content-Disposition', 'inline'); // INLINE = Play di browser / New Tab
    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Accept-Ranges', 'bytes');

    if (response.headers.get('content-length')) {
      resHeaders.set('Content-Length', response.headers.get('content-length'));
    }
    if (response.headers.get('content-range')) {
      resHeaders.set('Content-Range', response.headers.get('content-range'));
    }

    return new NextResponse(response.body, { 
      status: response.status, 
      headers: resHeaders 
    });

  } catch (error) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
