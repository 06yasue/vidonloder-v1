import { NextResponse } from 'next/server';

// FUNGSI PEMBANTAI UNICODE & KOTORAN URL
function superDecodeUrl(rawUrl) {
  if (!rawUrl) return "";
  let cleanUrl = rawUrl;
  
  // Lapis 1: Coba paksa parse sebagai JSON string
  try {
    cleanUrl = JSON.parse(`"${cleanUrl.replace(/\\"/g, '"')}"`);
  } catch (e) {
    // Abaikan jika gagal, lanjut ke lapis 2
  }

  // Lapis 2: Replace manual semua unicode yang sering muncul di TikTok/FB
  cleanUrl = cleanUrl
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\u0025/g, '%')
    .replace(/\\\//g, '/')
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':')
    .replace(/%3F/g, '?')
    .replace(/%3D/g, '=')
    .replace(/%26/g, '&')
    .replace(/&amp;/g, '&');

  return cleanUrl;
}

export async function POST(request) {
  try {
    // Tangkap data dari frontend
    const body = await request.json();
    const urls = body.urls;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ success: false, pesan: "Mana URL-nya? Harus berupa array minimal 1 URL" }, { status: 400 });
    }

    // MULTI-URL PARALLEL SCRAPING
    const scrapeTasks = urls.map(async (rawTarget) => {
      const urlTarget = rawTarget.trim();
      if (!urlTarget) return null;

      try {
        // Tembak URL dengan Header Browser Asli (Bypass Anti-Bot ringan)
        const response = await fetch(urlTarget, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Mode': 'navigate',
          },
          // Jangan ikuti redirect otomatis terlalu dalam biar nggak timeout
          redirect: 'follow'
        });

        if (!response.ok) {
          throw new Error(`Server target menolak akses (Status: ${response.status})`);
        }

        const html = await response.text();
        let videoUrl = "";
        let platformName = "Web Umum";
        let title = "Video " + Math.floor(Math.random() * 1000);

        // Cari Judul (Opsional)
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) title = titleMatch[1].trim();

        // ==========================================
        // LOGIKA 1: TIKTOK (Banyak Lapis)
        // ==========================================
        if (urlTarget.includes('tiktok.com')) {
          platformName = "TikTok";
          
          // Lapis 1: Cari Universal Data Rehydration (JSON mentah TikTok)
          const regexJson = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/;
          const jsonMatch = html.match(regexJson);
          
          if (jsonMatch && jsonMatch[1]) {
            const strData = jsonMatch[1];
            // Cari downloadAddr dulu (kualitas lebih baik, tanpa watermark jika hoki)
            const dMatch = strData.match(/"downloadAddr":"([^"]+)"/i);
            const pMatch = strData.match(/"playAddr":"([^"]+)"/i);
            
            if (dMatch && dMatch[1]) videoUrl = dMatch[1];
            else if (pMatch && pMatch[1]) videoUrl = pMatch[1];
          }

          // Lapis 2: Kalau script gak ketemu, pake Regex buta ke seluruh HTML
          if (!videoUrl) {
            const butaMatch = html.match(/"(?:downloadAddr|playAddr)":"([^"]+)"/i);
            if (butaMatch) videoUrl = butaMatch[1];
          }
        }
        
        // ==========================================
        // LOGIKA 2: FACEBOOK (Semua Kemungkinan Key)
        // ==========================================
        else if (urlTarget.includes('facebook.com') || urlTarget.includes('fb.watch') || urlTarget.includes('fb.com')) {
          platformName = "Facebook";
          // Cari dari kualitas HD sampai SD
          const fbRegexList = [
            /"browser_native_hd_url":"([^"]+)"/i,
            /"playable_url_quality_hd":"([^"]+)"/i,
            /"hd_src":"([^"]+)"/i,
            /"browser_native_sd_url":"([^"]+)"/i,
            /"playable_url":"([^"]+)"/i,
            /"sd_src":"([^"]+)"/i,
            /"video_url":"([^"]+)"/i
          ];

          for (const rx of fbRegexList) {
            const match = html.match(rx);
            if (match && match[1]) {
              videoUrl = match[1];
              break; // Kalo ketemu 1, langsung stop cari
            }
          }
        }
        
        // ==========================================
        // LOGIKA 3: INSTAGRAM / THREADS
        // ==========================================
        else if (urlTarget.includes('instagram.com') || urlTarget.includes('threads.net')) {
          platformName = "Instagram";
          const igMatch = html.match(/"video_url":"([^"]+)"/i) || html.match(/"video_versions":\[{"type":\d+,"url":"([^"]+)"/i);
          if (igMatch) videoUrl = igMatch[1];
        }
        
        // ==========================================
        // LOGIKA 4: TWITTER / X
        // ==========================================
        else if (urlTarget.includes('x.com') || urlTarget.includes('twitter.com')) {
          platformName = "Twitter/X";
          // Twitter sering nampilin banyak resolusi, ambil yg ada tulisan .mp4
          const twMatch = html.match(/"url":"([^"]+\.mp4[^"]*)"/i);
          if (twMatch) videoUrl = twMatch[1];
        }

        // ==========================================
        // LOGIKA 5: FALLBACK GLOBAL (Website Apapun)
        // ==========================================
        if (!videoUrl) {
          const ogVideoMatch = html.match(/<meta\s+property="og:video(:url|:secure_url)?"\s+content="([^"]+)"/i);
          if (ogVideoMatch) {
            videoUrl = ogVideoMatch[2];
          } else {
            // Deteksi link MP4 murni di dalam HTML
            const mp4Match = html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
            if (mp4Match) videoUrl = mp4Match[1];
          }
        }

        // BERSIHKAN URL FINAL
        let finalVideoUrl = superDecodeUrl(videoUrl);

        return {
          url_input: urlTarget,
          platform: platformName,
          title: title,
          status: finalVideoUrl ? 'sukses' : 'gagal (Video tidak ditemukan/tergembok)',
          video_url: finalVideoUrl
        };

      } catch (err) {
        return {
          url_input: urlTarget,
          status: 'error',
          pesan: err.message
        };
      }
    });

    // Jalankan semua task scraping secara bersamaan
    const hasilScraping = await Promise.all(scrapeTasks);
    
    // Filter hasil yang null
    const finalData = hasilScraping.filter(item => item !== null);

    return NextResponse.json({ success: true, data: finalData });

  } catch (error) {
    return NextResponse.json({ success: false, pesan: "Fatal Error di Server Scraper: " + error.message }, { status: 500 });
  }
}
