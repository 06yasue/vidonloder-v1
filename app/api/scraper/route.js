export async function POST(request) {
  try {
    const { urls } = await request.json();
    
    if (!urls || !Array.isArray(urls)) {
      return Response.json({ success: false, pesan: "Harus berupa array URL" }, { status: 400 });
    }

    // Eksekusi multi-download secara bersamaan (Parallel)
    const results = await Promise.all(urls.map(async (urlTarget) => {
      urlTarget = urlTarget.trim();
      if (!urlTarget) return null;

      try {
        const res = await fetch(urlTarget, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          }
        });

        const html = await res.text();
        let videoUrl = "";
        let platform = "Umum";

        // Fungsi pamungkas untuk mengubah unicode cacat (\u002F) menjadi URL waras (/)
        const decodeUrl = (str) => {
          if (!str) return "";
          try {
            return JSON.parse(`"${str.replace(/\\"/g, '"')}"`);
          } catch (e) {
            return str.replace(/\\u002F/g, '/').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
          }
        };

        // Deteksi Platform & Ekstrak URL
        if (urlTarget.includes('tiktok.com')) {
          platform = "TikTok";
          const match = html.match(/"playAddr":"([^"]+)"/) || html.match(/"downloadAddr":"([^"]+)"/);
          if (match) videoUrl = decodeUrl(match[1]);
          
        } else if (urlTarget.includes('facebook.com') || urlTarget.includes('fb.watch')) {
          platform = "Facebook";
          // Gabung semua kemungkinan nama key FB dalam satu regex
          const fbRegex = /"(?:browser_native_hd_url|browser_native_sd_url|playable_url_quality_hd|playable_url|hd_src|sd_src)":"([^"]+)"/i;
          const match = html.match(fbRegex);
          if (match) videoUrl = decodeUrl(match[1]);
          
        } else if (urlTarget.includes('instagram.com')) {
          platform = "Instagram";
          const match = html.match(/"video_url":"([^"]+)"/);
          if (match) videoUrl = decodeUrl(match[1]);
          
        } else if (urlTarget.includes('x.com') || urlTarget.includes('twitter.com')) {
           platform = "Twitter/X";
           const match = html.match(/"url":"([^"]+\.mp4[^"]*)"/);
           if (match) videoUrl = decodeUrl(match[1]);
        }

        // Jika semua gagal, cari tag og:video standar web
        if (!videoUrl) {
           const ogMatch = html.match(/<meta property="og:video(:url)?" content="([^"]+)"/i);
           if (ogMatch) videoUrl = decodeUrl(ogMatch[2]);
        }

        return {
          url_asli: urlTarget,
          platform: platform,
          status: videoUrl ? 'sukses' : 'gagal',
          video_url: videoUrl
        };
        
      } catch (e) {
        return { url_asli: urlTarget, status: 'error', pesan: e.message };
      }
    }));

    // Hapus hasil yang null (jika ada baris kosong) dan kembalikan response
    return Response.json({ success: true, data: results.filter(Boolean) });
    
  } catch (error) {
    return Response.json({ success: false, pesan: "Server Error: " + error.message }, { status: 500 });
  }
}
