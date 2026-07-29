import { NextResponse } from 'next/server';
import axios from 'axios';

// ------------------------------------------------------------------
// 1. FUNGSI UTILITAS
// ------------------------------------------------------------------

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

// ------------------------------------------------------------------
// 2. ENGINE KHUSUS TIKTOK (Sesuai dengan kode perbaikan Anda)
// ------------------------------------------------------------------
async function scrapeTiktok(url) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': 'https://www.tiktok.com/',
    };

    const response = await fetch(url, {
      headers,
      cache: 'no-store', 
      redirect: 'follow'
    });

    if (!response.ok) {
       throw new Error(`Gagal akses TikTok: HTTP ${response.status}`);
    }

    const html = await response.text();

    let jsonText = "";
    const regexes = [
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/,
      /<script id="SIGI_STATE"[^>]*>([^<]+)<\/script>/,
      /<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/
    ];

    for (let regex of regexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        jsonText = match[1];
        break;
      }
    }

    if (!jsonText) throw new Error("Kena blokir Captcha TikTok atau script gak ketemu.");

    const data = JSON.parse(jsonText);
    let itemStruct = null;

    function findStruct(obj) {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.video && obj.id && obj.author) return obj;
      for (let key in obj) {
        if (['music', 'stats', 'author'].includes(key)) continue;
        const result = findStruct(obj[key]);
        if (result) return result;
      }
      return null;
    }

    itemStruct = findStruct(data);
    if (!itemStruct) throw new Error("Data video gak ketemu di dalam JSON.");

    let candidates = [];
    if (itemStruct.video?.playAddr?.UrlList) candidates.push(...itemStruct.video.playAddr.UrlList);
    if (itemStruct.video?.bitrateInfo) {
      itemStruct.video.bitrateInfo.forEach(br => {
        if (br.PlayAddr?.UrlList) candidates.push(...br.PlayAddr.UrlList);
      });
    }

    let finalVideoUrl = candidates.find(c => c.includes('aweme')) || candidates.sort((a,b) => b.length - a.length)[0];

    if (!finalVideoUrl) {
      throw new Error("Link URL video MP4 gagal ditarik.");
    }

    const authorUsername = itemStruct.author?.uniqueId || itemStruct.author?.nickname || 'Video TikTok';
    const finalTitle = itemStruct.desc ? itemStruct.desc : `Video by @${authorUsername}`;

    return {
      title: finalTitle,
      videoUrl: finalVideoUrl,
      thumbnail: itemStruct.video?.cover || itemStruct.video?.originCover || ''
    };

  } catch (error) {
    throw new Error('Gagal scrape TikTok: ' + error.message);
  }
}

// ------------------------------------------------------------------
// 3. HANDLER UTAMA API (POST)
// ------------------------------------------------------------------
export async function POST(request) {
  try {
    const body = await request.json();
    const urls = body.urls || (body.url ? [body.url] : []); 

    if (!urls || !Array.isArray(urls) || urls.length === 0 || !urls[0]) {
      return NextResponse.json({ 
        success: false, 
        pesan: "Format URL salah! Harap masukkan minimal satu URL." 
      }, { status: 400 });
    }

    const scrapePromises = urls.map(async (rawUrl) => {
      const targetUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
      if (!targetUrl) return null;

      try {
        let videoUrl = "";
        let platform = "Web Umum";
        let title = "Video Tanpa Judul";
        let thumbnail = "https://via.placeholder.com/500x500?text=No+Thumbnail";

        // =================================================================
        // ENGINE TIKTOK (Dialihkan ke fungsi khusus)
        // =================================================================
        if (targetUrl.includes('tiktok.com')) {
          platform = "TikTok";
          const tiktokData = await scrapeTiktok(targetUrl);
          title = tiktokData.title;
          thumbnail = tiktokData.thumbnail;
          videoUrl = tiktokData.videoUrl;
        } 
        // =================================================================
        // ENGINE LAINNYA (Facebook, IG, Twitter, dll)
        // =================================================================
        else {
          // Gunakan Desktop User-Agent agar Facebook memberikan struktur HD JSON, bukan versi mobile lite
          const response = await axios.get(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
              'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Cache-Control': 'no-cache'
            },
            timeout: 15000
          });

          const html = response.data;

          // Ambil Judul & Thumbnail Universal
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i) || html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
          if (titleMatch && titleMatch[1]) title = cleanUrl(titleMatch[1]);

          const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
          if (thumbMatch && thumbMatch[1]) thumbnail = cleanUrl(thumbMatch[1]);

          // ENGINE FACEBOOK (Cerdas ambil HD)
          if (targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch') || targetUrl.includes('fb.me')) {
            platform = "Facebook";
            
            // Prioritaskan pola HD terlebih dahulu, baru fallback ke SD
            const fbHdPatterns = [
              /"browser_native_hd_url":"([^"]+)"/i,
              /"playable_url_quality_hd":"([^"]+)"/i,
              /"hd_src":"([^"]+)"/i,
              /"hd_src_no_ratelimit":"([^"]+)"/i
            ];
            
            const fbSdPatterns = [
              /"browser_native_sd_url":"([^"]+)"/i,
              /"playable_url":"([^"]+)"/i,
              /"sd_src":"([^"]+)"/i,
              /"sd_src_no_ratelimit":"([^"]+)"/i
            ];

            // Coba cari HD
            for (const pattern of fbHdPatterns) {
              const match = html.match(pattern);
              if (match && match[1] && match[1] !== "null") {
                videoUrl = match[1];
                break;
              }
            }

            // Jika HD tidak ada, cari SD
            if (!videoUrl) {
              for (const pattern of fbSdPatterns) {
                const match = html.match(pattern);
                if (match && match[1] && match[1] !== "null") {
                  videoUrl = match[1];
                  break;
                }
              }
            }
          }
          // ENGINE INSTAGRAM
          else if (targetUrl.includes('instagram.com')) {
            platform = "Instagram";
            // Cari di meta tag atau di dalam JSON (video_versions)
            const igMatch = html.match(/"video_url":"([^"]+)"/i) || html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i) || html.match(/"video_versions":\[{"type":\d+,"width":\d+,"height":\d+,"url":"([^"]+)"/i);
            if (igMatch && igMatch[1]) {
              videoUrl = igMatch[1];
            }
          }
          // ENGINE TWITTER / X
          else if (targetUrl.includes('x.com') || targetUrl.includes('twitter.com')) {
            platform = "Twitter/X";
            const twMatch = html.match(/"url":"([^"]+\.mp4[^"]*)"/i) || html.match(/<meta\s+property="og:video:url"\s+content="([^"]+)"/i);
            if (twMatch && twMatch[1]) {
              videoUrl = twMatch[1];
            }
          }
          // FALLBACK GLOBAL (Website Umum)
          if (!videoUrl) {
            const ogVideoMatch = html.match(/<meta\s+property="og:video(?::url|:secure_url)?"\s+content="([^"]+)"/i);
            if (ogVideoMatch && ogVideoMatch[1]) {
              videoUrl = ogVideoMatch[1];
            } else {
              // Cari string berakhiran .mp4 di dalam seluruh script (Cerdas mencari URL tersembunyi)
              const rawMp4Match = html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
              if (rawMp4Match && rawMp4Match[1]) {
                videoUrl = rawMp4Match[1];
              }
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
