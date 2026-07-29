import { NextResponse } from 'next/server';
import axios from 'axios';

// Fungsi pembersih URL dari enkripsi unicode (seperti \u002F, dll)
function cleanUrl(rawUrl) {
  if (!rawUrl) return "";
  let clean = rawUrl;
  try {
    clean = JSON.parse(`"${clean.replace(/\\"/g, '"')}"`);
  } catch (e) {
    // Abaikan jika bukan format JSON string murni
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
    const body = await request.json();
    const urls = body.urls || [body.url]; // Mendukung array "urls" maupun string tunggal "url"

    if (!urls || !Array.isArray(urls) || urls.length === 0 || !urls[0]) {
      return NextResponse.json({ 
        success: false, 
        pesan: "Format URL salah! Harap masukkan minimal satu URL." 
      }, { status: 400 });
    }

    // Proses scraping secara paralel untuk semua URL yang dikirim (Multi-Download support)
    const scrapePromises = urls.map(async (rawUrl) => {
      const targetUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
      if (!targetUrl) return null;

      try {
        // Menggunakan Axios dengan User-Agent seluler/desktop bergantian agar tidak mudah diblokir
        const response = await axios.get(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache'
          },
          timeout: 12000
        });

        const html = response.data;
        let videoUrl = "";
        let platform = "Web Umum";
        let title = "Video Tanpa Judul";
        let thumbnail = "https://via.placeholder.com/500x500?text=No+Thumbnail";

        // Ambil Judul Universal dari Tag HTML <title> atau OpenGraph
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i) || html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].trim();
        }

        // Ambil Thumbnail Universal dari OpenGraph Meta Tag
        const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
        if (thumbMatch && thumbMatch[1]) {
          thumbnail = cleanUrl(thumbMatch[1]);
        }

        // =================================================================
        // 1. ENGINE TIKTOK (Murni Parsing HTML & JSON State)
        // =================================================================
        if (targetUrl.includes('tiktok.com')) {
          platform = "TikTok";

          // Cari data rehydration universal di dalam script TikTok
          const hydrationMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i);
          if (hydrationMatch && hydrationMatch[1]) {
            try {
              const jsonData = JSON.parse(hydrationMatch[1]);
              // Navigasi mendalam ke objek data video TikTok
              const itemDetail = jsonData?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
              if (itemDetail) {
                videoUrl = itemDetail.video?.playAddr || itemDetail.video?.downloadAddr || "";
                if (itemDetail.desc) title = itemDetail.desc;
                if (itemDetail.video?.cover) thumbnail = itemDetail.video.cover;
              }
            } catch (e) {
              // Jika gagal parse JSON global, lanjut ke regex darurat di bawah
            }
          }

          // Fallback Regex jika script rehydration tidak tertangkap
          if (!videoUrl) {
            const playAddrMatch = html.match(/"playAddr":"([^"]+)"/i) || html.match(/"downloadAddr":"([^"]+)"/i);
            if (playAddrMatch && playAddrMatch[1]) {
              videoUrl = playAddrMatch[1];
            }
          }
        }

        // =================================================================
        // 2. ENGINE FACEBOOK (Murni Parsing Struktur HTML Mobile/Desktop)
        // =================================================================
        else if (targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch') || targetUrl.includes('fb.me')) {
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

        // =================================================================
        // 3. ENGINE INSTAGRAM (Murni Parsing Meta & JSON)
        // =================================================================
        else if (targetUrl.includes('instagram.com')) {
          platform = "Instagram";
          const igMatch = html.match(/"video_url":"([^"]+)"/i) || html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i);
          if (igMatch && igMatch[1]) {
            videoUrl = igMatch[1];
          }
        }

        // =================================================================
        // 4. ENGINE TWITTER / X (Murni Parsing)
        // =================================================================
        else if (targetUrl.includes('x.com') || targetUrl.includes('twitter.com')) {
          platform = "Twitter/X";
          const twMatch = html.match(/"url":"([^"]+\.mp4[^"]*)"/i);
          if (twMatch && twMatch[1]) {
            videoUrl = twMatch[1];
          }
        }

        // =================================================================
        // 5. FALLBACK GLOBAL (Mencari tag OpenGraph video atau ekstensi .mp4)
        // =================================================================
        if (!videoUrl) {
          const ogVideoMatch = html.match(/<meta\s+property="og:video(?::url|:secure_url)?"\s+content="([^"]+)"/i);
          if (ogVideoMatch && ogVideoMatch[1]) {
            videoUrl = ogVideoMatch[1];
          } else {
            const rawMp4Match = html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
            if (rawMp4Match && rawMp4Match[1]) {
              videoUrl = rawMp4Match[1];
            }
          }
        }

        const finalVideoUrl = cleanUrl(videoUrl);

        return {
          url_input: targetUrl,
          platform: platform,
          title: title,
          thumbnail: thumbnail,
          status: finalVideoUrl ? 'sukses' : 'gagal',
          video_url: finalVideoUrl
        };

      } catch (err) {
        return {
          url_input: targetUrl,
          status: 'error',
          pesan: err.message
        };
      }
    });

    const hasilAll = await Promise.all(scrapePromises);
    const filteredHasil = hasilAll.filter(item => item !== null);

    return NextResponse.json({ success: true, data: filteredHasil });

  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      pesan: "Gagal memproses scraper internal: " + error.message 
    }, { status: 500 });
  }
}
