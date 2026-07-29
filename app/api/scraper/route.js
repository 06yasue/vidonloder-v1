function cleanUrl(rawUrl) {
  if (!rawUrl) return '';
  return rawUrl
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\u0025/g, '%')
    .replace(/\\\//g, '/');
}

export async function POST(request) {
  try {
    const { urls } = await request.json();
    
    if (!urls || !Array.isArray(urls)) {
      return Response.json({ success: false, pesan: "Format URL tidak valid" }, { status: 400 });
    }

    const scrapePromises = urls.map(async (url) => {
      try {
        const urlTarget = url.trim();
        if (!urlTarget) return null;

        const response = await fetch(urlTarget, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          }
        });
        
        const html = await response.text();
        let videoLink = null;
        let title = "Tanpa Judul";
        let image = "";
        let platformDitemukan = "Web Umum";

        const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) title = titleMatch[1].replace(/&amp;/g, '&');

        const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
        if (imageMatch && imageMatch[1]) image = imageMatch[1];

        // ==========================================
        // 1. FACEBOOK (Multi-Key Regex)
        // ==========================================
        if (urlTarget.includes('facebook.com') || urlTarget.includes('fb.watch')) {
          platformDitemukan = "Facebook";
          // Jaring yang lebih luas untuk menangkap berbagai jenis video FB
          const fbPatterns = [
            /"browser_native_hd_url":"([^"]+)"/i,
            /"browser_native_sd_url":"([^"]+)"/i,
            /"playable_url_quality_hd":"([^"]+)"/i,
            /"playable_url":"([^"]+)"/i,
            /"hd_src":"([^"]+)"/i,
            /"sd_src":"([^"]+)"/i
          ];
          
          for (let pola of fbPatterns) {
            let match = html.match(pola);
            if (match && match[1]) {
              videoLink = cleanUrl(match[1]);
              break; // Kalau ketemu satu, langsung hentikan pencarian
            }
          }
        } 
        
        // ==========================================
        // 2. TIKTOK (Utamakan DownloadAddr)
        // ==========================================
        else if (urlTarget.includes('tiktok.com')) {
          platformDitemukan = "TikTok";
          // Prioritas 1: URL Download Asli, Prioritas 2: URL Streaming
          const regexDownload = /"downloadAddr":"([^"]+)"/i;
          const regexPlay = /"playAddr":"([^"]+)"/i;
          
          let match = html.match(regexDownload) || html.match(regexPlay);
          if (match && match[1]) {
            videoLink = cleanUrl(match[1]);
          }
        }
        
        // ==========================================
        // 3. INSTAGRAM & TWITTER
        // ==========================================
        else if (urlTarget.includes('instagram.com')) {
          platformDitemukan = "Instagram";
          const regexIg = /"video_url":"([^"]+)"/i;
          let match = html.match(regexIg);
          if (match && match[1]) videoLink = cleanUrl(match[1]);
        }
        else if (urlTarget.includes('twitter.com') || urlTarget.includes('x.com')) {
          platformDitemukan = "Twitter/X";
          const regexTwitter = /"url":"([^"]+\.mp4[^"]*)"/i;
          let match = html.match(regexTwitter);
          if (match && match[1]) videoLink = cleanUrl(match[1]);
        }

        // ==========================================
        // 4. FALLBACK UMUM
        // ==========================================
        if (!videoLink) {
          const regexOgVideo = /<meta\s+property="og:video"\s+content="([^"]+)"/i;
          const matchOg = html.match(regexOgVideo);
          if (matchOg && matchOg[1]) {
            videoLink = cleanUrl(matchOg[1].replace(/&amp;/g, '&'));
          } else {
            const regexGeneralMp4 = /(https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)[^\s"'<>]*)/i;
            const matchGeneral = html.match(regexGeneralMp4);
            if (matchGeneral && matchGeneral[1]) videoLink = matchGeneral[1];
          }
        }

        return { 
          url_asli: urlTarget, 
          platform: platformDitemukan,
          title: title,
          image: image,
          status: videoLink ? 'sukses' : 'gagal', 
          video_url: videoLink || '',
        };

      } catch (err) {
        return { url_asli: urlTarget, status: 'error', pesan: err.message };
      }
    });

    const hasil = await Promise.all(scrapePromises);
    return Response.json({ success: true, data: hasil });

  } catch (error) {
    return Response.json({ success: false, pesan: "Server Error" }, { status: 500 });
  }
}
