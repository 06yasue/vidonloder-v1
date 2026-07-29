import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return NextResponse.json({ success: false, pesan: "URL video tidak ditemukan!" }, { status: 400 });
  }

  try {
    // Penanganan otomatis header Referer berdasarkan domain CDN tempat video disimpan
    let refererHeader = 'https://www.google.com/';
    
    if (videoUrl.includes('phncdn.com') || videoUrl.includes('pornhub')) {
      refererHeader = 'https://www.pornhub.com/';
    } else if (videoUrl.includes('tiktok') || videoUrl.includes('byteoversea') || videoUrl.includes('ibyteimg')) {
      refererHeader = 'https://www.tiktok.com/';
    } else if (videoUrl.includes('fbcdn') || videoUrl.includes('facebook')) {
      refererHeader = 'https://www.facebook.com/';
    } else if (videoUrl.includes('instagram') || videoUrl.includes('cdninstagram')) {
      refererHeader = 'https://www.instagram.com/';
    }

    // Tarik file video menggunakan fetch dengan header yang dipalsukan
    const res = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': refererHeader,
        'Accept': '*/*',
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, pesan: `Gagal mengambil video dari CDN. Status HTTP: ${res.status}` },
        { status: res.status }
      );
    }

    // Teruskan stream video langsung ke pengguna sebagai attachment file
    const headers = new Headers();
    headers.set('Content-Type', res.headers.get('content-type') || 'video/mp4');
    headers.set('Content-Disposition', 'attachment; filename="video.mp4"');

    const contentLength = res.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    return new NextResponse(res.body, {
      status: 200,
      headers,
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, pesan: "Terjadi kesalahan proxy download: " + error.message },
      { status: 500 }
    );
  }
}
