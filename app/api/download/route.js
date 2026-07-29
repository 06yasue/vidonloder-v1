import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('video') || searchParams.get('url');
  const type = searchParams.get('type') || 'video';

  if (!videoUrl) {
    return new NextResponse(JSON.stringify({ status: 'error', message: 'Missing URL' }), { status: 400 });
  }

  try {
    const response = await fetch(videoUrl, {
      headers: { 
        'Referer': 'https://www.tiktok.com/', 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' 
      }
    });

    if (!response.ok) throw new Error('Failed to retrieve media file');

    const headers = new Headers(response.headers);
    const ext = type === 'audio' ? 'mp3' : 'mp4';
    const contentType = type === 'audio' ? 'audio/mpeg' : 'video/mp4';
    const filename = `TikTok_${type}_${Date.now()}.${ext}`;

    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);

    return new NextResponse(response.body, { status: 200, headers });
  } catch (error) {
    return new NextResponse(JSON.stringify({ status: 'error', message: error.message }), { status: 500 });
  }
}
