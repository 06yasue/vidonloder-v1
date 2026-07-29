import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url') || searchParams.get('video');

    if (!rawUrl) {
      return NextResponse.json({ status: 'error', message: 'URL Kosong' }, { status: 400 });
    }

    let targetUrl = decodeURIComponent(rawUrl);

    // Header simple, gak usah neko-neko karena link aslinya udah link bersih
    const fetchHeaders = new Headers({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
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
      return NextResponse.json({ status: 'error', message: `Gagal dari sumber: ${response.status}` }, { status: response.status });
    }

    const resHeaders = new Headers();
    resHeaders.set('Content-Type', response.headers.get('content-type') || 'video/mp4');
    resHeaders.set('Content-Disposition', 'inline'); // INLINE = Play di browser
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
