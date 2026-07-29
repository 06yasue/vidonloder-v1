import { NextResponse } from 'next/server';
import axios from 'axios';

// Fungsi pembersih URL dari segala macam unicode sampah (\u002F, dll)
function cleanUrl(rawUrl) {
  if (!rawUrl) return "";
  let clean = rawUrl;
  try {
    clean = JSON.parse(`"${clean.replace(/\\"/g, '"')}"`);
  } catch (e) {
    // Kalau gagal parse json, pakai replace manual
  }
  return clean
    .replace(/\\u002F/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\u0025/g, '%')
    .replace(/\\\//g, '/')
    .replace(/%2F/g, '/')
    .replace(/%3A/g, ':')
    .replace(/%3F/g, '?')
    .replace(/%3D/g, '=')
    .replace(/&amp;/g, '&');
}

export async function POST(request) {
  try {
    // Tangkap data body dari frontend (mendukung multi-URL)
    const body = await request.json();
    const urls = body.urls;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ 
        success: false, 
        pesan: "Format URL salah! Harus mengirim array 'urls'." 
      }, { status: 400 });
    }

    // Eksekusi scraping secara paralel (Multi-Download bersamaan)
    const scrapePromises = urls.map(async (rawUrl) => {
      const urlTarget = typeof rawUrl === 'string' ? rawUrl.trim() : '';
      if (!urlTarget) return null;

      try {
        // Menggunakan Axios dengan User-Agent browser desktop
        const response = await axios.get(urlTarget, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          timeout: 10000 // Batas waktu 10 detik per URL agar tidak gantung
        });

        const html = response.data;
        let videoUrl = "";
        let platform = "Web Umum";
        let title = "Video Tanpa Judul";

        // Ambil judul halaman HTML jika ada
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].trim();
        }

        // ==========================================
        // 1. LOGIKA TIKTOK
        // ==========================================
        if (urlTarget.includes('tiktok.com')) {
          platform = "TikTok";
          // Cari downloadAddr atau playAddr di dalam source HTML
          const dMatch = html.match(/"downloadAddr":"([^"]+)"/i);
          const pMatch = html.match(/"playAddr":"([^"]+)"/i);
          
          if (dMatch && dMatch[1]) videoUrl = dMatch[1];
          else if (pMatch && pMatch[1]) videoUrl = pMatch[1];
        } 
        
        // ==========================================
        // 2. LOGIKA FACEBOOK
        // ==========================================
        else if (urlTarget.includes('facebook.com') || urlTarget.includes('fb.watch')) {
          platform = "Facebook";
          const fbPatterns = [
            /"browser_native_hd_url":"([^"]+)"/i,
            /"browser_native_sd_url":"([^"]+)"/i,
            /"playable_url_quality_hd":"([^"]+)"/i,
            /"playable_url":"([^"]+)"/i,
            /"hd_src":"([^"]+)"/i,
            /"sd_src":"([^"]+)"/i
          ];

          for (const pattern of fbPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
              videoUrl = match[1];
              break;
            }
          }
        } 
        
        // ==========================================
        // 3. LOGIKA INSTAGRAM
        // ==========================================
        else if (urlTarget.includes('instagram.com')) {
          platform = "Instagram";
          const igMatch = html.match(/"video_url":"([^"]+)"/i);
          if (igMatch && igMatch[1]) videoUrl = igMatch[1];
        } 
        
        // ==========================================
        // 4. LOGIKA TWITTER / X
        // ==========================================
        else if (urlTarget.includes('x.com') || urlTarget.includes('twitter.com')) {
          platform = "Twitter/X";
          const twMatch = html.match(/"url":"([^"]+\.mp4[^"]*)"/i);
          if (twMatch && twMatch[1]) videoUrl = twMatch[1];
        }

        // ==========================================
        // 5. FALLBACK GLOBAL (Mencari tag OpenGraph video)
        // ==========================================
        if (!videoUrl) {
          const ogMatch = html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i);
          if (ogMatch && ogMatch[1]) {
            videoUrl = ogMatch[2];
          } else {
            const mp4Match = html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
            if (mp4Match && mp4Match[1]) videoUrl = mp4Match[1];
          }
        }

        // Bersihkan hasil akhir URL video
        const finalVideoUrl = cleanUrl(videoUrl);

        return {
          url_asli: urlTarget,
          platform: platform,
          title: title,
          status: finalVideoUrl ? 'sukses' : 'gagal (Video terproteksi)',
          video_url: finalVideoUrl
        };

      } catch (err) {
        return {
          url_asli: urlTarget,
          status: 'error',
          pesan: err.message
        };
      }
    });

    // Tunggu semua proses selesai secara bersamaan
    const hasilAll = await Promise.all(scrapePromises);
    const filteredHasil = hasilAll.filter(item => item !== null);

    return NextResponse.json({ success: true, data: filteredHasil });

  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      pesan: "Gagal memproses server scraper: " + error.message 
    }, { status: 500 });
  }
}
