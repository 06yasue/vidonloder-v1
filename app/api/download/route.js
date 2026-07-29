export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('URL video tidak ditemukan', { status: 400 });
  }

  try {
    // 1. Bersihkan semua kotoran URL dari frontend (%5Cu002F, dll)
    targetUrl = decodeURIComponent(targetUrl);
    targetUrl = targetUrl.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&');
    
    if (!targetUrl.startsWith('http')) {
      return new Response('Format URL rusak: ' + targetUrl, { status: 400 });
    }

    // 2. Set Referer yang cocok agar tidak diblokir server pusat
    let refererTarget = 'https://www.google.com/';
    if (targetUrl.includes('tiktok')) refererTarget = 'https://www.tiktok.com/';
    else if (targetUrl.includes('fbcdn') || targetUrl.includes('facebook')) refererTarget = 'https://www.facebook.com/';

    // 3. Ambil videonya
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Referer': refererTarget,
      }
    });

    if (!res.ok) {
      return new Response(`Akses Ditolak Server Target (Status: ${res.status})`, { status: res.status });
    }

    // 4. Salin tipe video dan atur supaya bisa dimainkan di browser
    const headers = new Headers();
    headers.set('Content-Type', res.headers.get('content-type') || 'video/mp4');
    headers.set('Content-Disposition', 'inline'); // 'inline' untuk preview, 'attachment' untuk auto-download
    
    if (res.headers.get('content-length')) {
      headers.set('Content-Length', res.headers.get('content-length'));
    }

    return new Response(res.body, { status: 200, headers });
    
  } catch (err) {
    return new Response('Kesalahan saat memuat video: ' + err.message, { status: 500 });
  }
}
