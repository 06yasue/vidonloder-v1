import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url') || searchParams.get('video');

    if (!rawUrl) {
      return NextResponse.json({ status: 'error', message: 'URL Kosong' }, { status: 400 });
    }

    // 1. Bersihkan URL kotor dari Frontend
    let targetUrl = decodeURIComponent(rawUrl);
    targetUrl = targetUrl.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/%5Cu002F/g, '/');

    // 2. SOLUSI BARBAR: REDIRECT LANGSUNG KE URL ASLI!
    // Ini mengelabui TikTok karena yang mengakses CDN sekarang adalah browser HP/PC User lu sendiri, 
    // bukan server Datacenter Vercel. Dijamin lolos dari 403 Forbidden!
    return NextResponse.redirect(targetUrl);

  } catch (error) {
    return NextResponse.json({ status: 'error', message: `Server error: ${error.message}` }, { status: 500 });
  }
}
