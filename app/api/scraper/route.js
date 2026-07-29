import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const urls = body.urls || [body.url];

    if (!urls || urls.length === 0 || !urls[0]) {
      return NextResponse.json({ success: false, pesan: "Harap masukkan URL video." }, { status: 400 });
    }

    const scrapePromises = urls.map(async (rawUrl) => {
      const targetUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
      if (!targetUrl) return null;

      let videoUrl = "";
      let platform = "Web Umum";
      let title = "Video Tanpa Judul";
      let thumbnail = "https://via.placeholder.com/500x500?text=No+Thumbnail";

      try {
        // ==========================================
        // 1. ENGINE TIKTOK (PAKAI JALUR BELAKANG / API TIKWM)
        // Ini kunci biar gak dapet URL 'v16-webapp-prime' yang error itu!
        // ==========================================
        if (targetUrl.includes('tiktok.com')) {
          platform = "TikTok";
          const res = await fetch(`https://www.tikwm.com/api/?url=${targetUrl}?hd=1`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          const json = await res.json();
          
          if (json.data) {
            videoUrl = json.data.play || json.data.wmplay; // Langsung dapet MP4 bersih
            title = json.data.title || "TikTok Video";
            thumbnail = json.data.cover || thumbnail;
          }
        } 
        // ==========================================
        // 2. ENGINE LAINNYA (FB, IG, X)
        // ==========================================
        else {
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
          });
          
          const html = await response.text();
          
          // Ambil Title & Thumbnail
          const tMatch = html.match(/<title>([^<]+)<\/title>/i);
          if (tMatch) title = tMatch[1].trim();
          const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
          if (thumbMatch) thumbnail = thumbMatch[1];

          // Facebook
          if (targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch')) {
            platform = "Facebook";
            const fbMatch = html.match(/"browser_native_hd_url":"([^"]+)"/i) || html.match(/"playable_url_quality_hd":"([^"]+)"/i) || html.match(/"browser_native_sd_url":"([^"]+)"/i);
            if (fbMatch) videoUrl = fbMatch[1].replace(/\\/g, '');
          } 
          // Instagram
          else if (targetUrl.includes('instagram.com')) {
            platform = "Instagram";
            const igMatch = html.match(/"video_url":"([^"]+)"/i);
            if (igMatch) videoUrl = igMatch[1].replace(/\\/g, '');
          } 
          // Twitter / X
          else if (targetUrl.includes('x.com') || targetUrl.includes('twitter.com')) {
            platform = "Twitter/X";
            const twMatch = html.match(/"url":"([^"]+\.mp4[^"]*)"/i);
            if (twMatch) videoUrl = twMatch[1].replace(/\\/g, '');
          }
        }

        // Kalau dapet URL, bersihkan karakter anehnya (jika ada)
        if (videoUrl) {
          videoUrl = videoUrl.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&');
        }

        return {
          url_input: targetUrl,
          platform: platform,
          title: title,
          thumbnail: thumbnail,
          status: videoUrl ? 'sukses' : 'gagal',
          video_url: videoUrl
        };

      } catch (err) {
        return { url_input: targetUrl, status: 'error', pesan: err.message };
      }
    });

    const hasil = (await Promise.all(scrapePromises)).filter(Boolean);
    return NextResponse.json({ success: true, data: hasil });

  } catch (error) {
    return NextResponse.json({ success: false, pesan: "Error Scraper: " + error.message }, { status: 500 });
  }
}
