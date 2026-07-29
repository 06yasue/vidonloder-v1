import { NextResponse } from 'next/server';
import axios from 'axios';

function cleanUrl(rawUrl) {
  if (!rawUrl) return "";
  let clean = rawUrl;
  try { clean = JSON.parse(`"${clean.replace(/\\"/g, '"')}"`); } catch (e) {}
  return clean.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
}

export async function POST(request) {
  try {
    const { urls } = await request.json();

    if (!urls || !Array.isArray(urls)) {
      return NextResponse.json({ success: false, pesan: "Kirim array 'urls'" }, { status: 400 });
    }

    // Scraping barengan (Multi)
    const scrapeTasks = urls.map(async (url) => {
      const target = url.trim();
      if (!target) return null;

      try {
        const response = await axios.get(target, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const html = response.data;
        let vidUrl = "";

        // Cari URL Video langsung pakai Regex brutal
        const matches = html.match(/"(downloadAddr|playAddr|browser_native_hd_url|video_url)":"([^"]+)"/i);
        if (matches && matches[2]) vidUrl = matches[2];

        // Fallback nyari meta tag
        if (!vidUrl) {
          const og = html.match(/<meta property="og:video" content="([^"]+)"/i);
          if (og && og[1]) vidUrl = og[1];
        }

        const urlBersih = cleanUrl(vidUrl);

        return {
          url_asli: target,
          status: urlBersih ? 'sukses' : 'gagal',
          video_url: urlBersih
        };
      } catch (err) {
        return { url_asli: target, status: 'error', pesan: err.message };
      }
    });

    const hasil = (await Promise.all(scrapeTasks)).filter(Boolean);
    return NextResponse.json({ success: true, data: hasil });

  } catch (error) {
    return NextResponse.json({ success: false, pesan: error.message }, { status: 500 });
  }
}
