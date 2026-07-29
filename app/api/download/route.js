export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('URL video tidak ditemukan', { status: 400 });
  }

  // Cerdaskan Referer sesuai platform
  let refererDinamis = 'https://www.google.com/';
  if (targetUrl.includes('tiktok') || targetUrl.includes('tiktokcdn')) refererDinamis = 'https://www.tiktok.com/';
  else if (targetUrl.includes('fbcdn') || targetUrl.includes('facebook')) refererDinamis = 'https://www.facebook.com/';
  else if (targetUrl.includes('instagram')) refererDinamis = 'https://www.instagram.com/';
  else if (targetUrl.includes('twimg') || targetUrl.includes('twitter')) refererDinamis = 'https://twitter.com/';

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Referer': refererDinamis,
        'Accept': '*/*'
      }
    });

    if (!response.ok) {
      return new Response(`Gagal memuat video dari server asal. Status server target: ${response.status}`, { status: response.status });
    }

    const headers = new Headers();
    // Copy tipe file dari server asli (biasanya video/mp4)
    if (response.headers.get('content-type')) {
      headers.set('Content-Type', response.headers.get('content-type'));
    } else {
      headers.set('Content-Type', 'video/mp4');
    }
    
    // Copy ukuran file agar pemutar video tahu durasinya
    if (response.headers.get('content-length')) {
      headers.set('Content-Length', response.headers.get('content-length'));
    }

    // Set agar diputar di browser (inline)
    headers.set('Content-Disposition', 'inline'); 

    return new Response(response.body, {
      status: 200,
      headers: headers
    });
    
  } catch (error) {
    return new Response(`Error Internal: ${error.message}`, { status: 500 });
  }
}
