import { NextResponse } from 'next/server';
import axios from 'axios';

// Fungsi pembersih URL dari enkripsi unicode (seperti \u002F, \/, dll)
function cleanUrl(rawUrl) {
  if (!rawUrl) return "";
  let clean = rawUrl;
  try {
    clean = JSON.parse(`"${clean.replace(/\\"/g, '"')}"`);
  } catch (e) { }
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

// ==========================================
// ENGINE KHUSUS TIKTOK
// ==========================================
async function scrapeTiktok(url) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': 'https://www.tiktok.com/',
    };

    const response = await fetch(url, { headers, cache: 'no-store', redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    let jsonText = "";
    const regexes = [
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/,
      /<script id="SIGI_STATE"[^>]*>([^<]+)<\/script>/,
      /<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/
    ];

    for (let regex of regexes) {
      const match = html.match(regex);
      if (match && match[1]) { jsonText = match[1]; break; }
    }

    if (!jsonText) throw new Error("Script TikTok tidak ditemukan.");
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
    if (!itemStruct) throw new Error("Data video kosong.");

    let candidates = [];
    if (itemStruct.video?.playAddr?.UrlList) candidates.push(...itemStruct.video.playAddr.UrlList);
    if (itemStruct.video?.bitrateInfo) {
      itemStruct.video.bitrateInfo.forEach(br => {
        if (br.PlayAddr?.UrlList) candidates.push(...br.PlayAddr.UrlList);
      });
    }

    let finalVideoUrl = candidates.find(c => c.includes('aweme')) || candidates.sort((a,b) => b.length - a.length)[0];
    if (!finalVideoUrl) throw new Error("URL MP4 gagal ditarik.");

    const authorUsername = itemStruct.author?.uniqueId || itemStruct.author?.nickname || 'Video TikTok';
    const finalTitle = itemStruct.desc ? itemStruct.desc : `Video by @${authorUsername}`;

    return { title: finalTitle, videoUrl: finalVideoUrl, thumbnail: itemStruct.video?.cover || itemStruct.video?.originCover || '' };
  } catch (error) {
    throw new Error('Gagal scrape TikTok: ' + error.message);
  }
}

// ==========================================
// HANDLER UTAMA API (POST)
// ==========================================
export async function POST(request) {
  try {
    const body = await request.json();
    const urls = body.urls || (body.url ? [body.url] : []); 

    if (!urls || !Array.isArray(urls) || urls.length === 0 || !urls[0]) {
      return NextResponse.json({ success: false, pesan: "Format URL salah!" }, { status: 400 });
    }

    const scrapePromises = urls.map(async (rawUrl) => {
      const targetUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
      if (!targetUrl) return null;

      try {
        let videoUrl = "";
        let platform = "Web Umum";
        let title = "Video Tanpa Judul";
        let thumbnail = "https://via.placeholder.com/500x500?text=No+Thumbnail";

        // 1. TIKTOK ENGINE
        if (targetUrl.includes('tiktok.com')) {
          platform = "TikTok";
          const tiktokData = await scrapeTiktok(targetUrl);
          title = tiktokData.title;
          thumbnail = tiktokData.thumbnail;
          videoUrl = tiktokData.videoUrl;
        } 
        else {
          const isFacebook = targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch') || targetUrl.includes('fb.me');
          
          let reqHeaders = {
            'User-Agent': isFacebook 
                ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
                : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache'
          };

          // Bypass Disclaimer Dewasa
          if (targetUrl.includes('pornhub') || targetUrl.includes('xvideos') || targetUrl.includes('xnxx')) {
            reqHeaders['Cookie'] = 'age_verified=1; platform=pc; wp_adult=1;';
          }

          const response = await axios.get(targetUrl, { headers: reqHeaders, timeout: 15000 });
          const html = response.data;

          // Universal Meta Title & Thumbnail
          const titleMatch = html.match(/<title>([^<]+)<\/title>/i) || html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
          if (titleMatch && titleMatch[1]) title = cleanUrl(titleMatch[1]);

          const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
          if (thumbMatch && thumbMatch[1]) thumbnail = cleanUrl(thumbMatch[1]);

          // 2. FACEBOOK ENGINE
          if (isFacebook) {
            platform = "Facebook";
            const fbHdPatterns = [
              /["']browser_native_hd_url["']\s*:\s*["']([^"']+)["']/i,
              /["']playable_url_quality_hd["']\s*:\s*["']([^"']+)["']/i,
              /["']hd_src["']\s*:\s*["']([^"']+)["']/i
            ];
            const fbSdPatterns = [
              /["']browser_native_sd_url["']\s*:\s*["']([^"']+)["']/i,
              /["']playable_url["']\s*:\s*["']([^"']+)["']/i,
              /["']sd_src["']\s*:\s*["']([^"']+)["']/i
            ];

            for (const pattern of fbHdPatterns) {
              const match = html.match(pattern);
              if (match && match[1] && match[1] !== "null") { videoUrl = match[1]; break; }
            }
            if (!videoUrl) {
              for (const pattern of fbSdPatterns) {
                const match = html.match(pattern);
                if (match && match[1] && match[1] !== "null") { videoUrl = match[1]; break; }
              }
            }
          }

          // 3. XVIDEOS & XNXX ENGINE (Satu Pabrik, Script Sama)
          else if (targetUrl.includes('xvideos.com') || targetUrl.includes('xnxx.com')) {
            platform = targetUrl.includes('xvideos') ? "XVideos" : "XNXX";

            // Mengincar setup script html5player secara agresif
            const xvTitle = html.match(/html5player\.setVideoTitle\(['"]([^'"]+)['"]\)/i);
            if (xvTitle && xvTitle[1]) title = xvTitle[1];

            const xvThumb = html.match(/html5player\.setThumbUrl(?:169)?\(['"]([^'"]+)['"]\)/i);
            if (xvThumb && xvThumb[1]) thumbnail = xvThumb[1];

            const xvHigh = html.match(/html5player\.setVideoUrlHigh\(['"]([^'"]+)['"]\)/i);
            const xvLow = html.match(/html5player\.setVideoUrlLow\(['"]([^'"]+)['"]\)/i);
            const xvHls = html.match(/html5player\.setVideoHLS\(['"]([^'"]+)['"]\)/i);

            if (xvHigh && xvHigh[1]) videoUrl = xvHigh[1];
            else if (xvLow && xvLow[1]) videoUrl = xvLow[1];
            else if (xvHls && xvHls[1]) videoUrl = xvHls[1]; // Kadang bentuknya .m3u8 (HLS)
          }

          // 4. PORNHUB ENGINE (Mengekstrak JSON mediaDefinitions)
          else if (targetUrl.includes('pornhub.com')) {
            platform = "Pornhub";
            // Cari block JSON mediaDefinitions
            const mediaDefsMatch = html.match(/mediaDefinitions\s*:\s*(\[.*?\])/i);
            if (mediaDefsMatch && mediaDefsMatch[1]) {
              try {
                // Gunakan regex agresif untuk menarik "videoUrl":"http..." dari dalam array
                const urls = [...mediaDefsMatch[1].matchAll(/"videoUrl"\s*:\s*"([^"]+)"/g)];
                const validUrls = urls.map(u => cleanUrl(u[1])).filter(u => u.startsWith('http') && u.includes('.mp4'));
                if (validUrls.length > 0) {
                  videoUrl = validUrls[0]; // Biasanya index ke-0 adalah kualitas default tertinggi
                }
              } catch (e) {}
            }
            
            // Fallback jika mediaDefinitions dienkripsi
            if (!videoUrl) {
              const fallbackPh = html.match(/(?:quality_\d+p|videoUrl)["']\s*:\s*["']([^"']+\.mp4[^"']*)["']/i);
              if (fallbackPh && fallbackPh[1]) videoUrl = fallbackPh[1];
            }
          }

          // 5. INSTAGRAM ENGINE
          else if (targetUrl.includes('instagram.com')) {
            platform = "Instagram";
            const igMatch = html.match(/"video_url":"([^"]+)"/i) || html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i);
            if (igMatch && igMatch[1]) videoUrl = igMatch[1];
          }

          // 6. TWITTER / X ENGINE
          else if (targetUrl.includes('x.com') || targetUrl.includes('twitter.com')) {
            platform = "Twitter/X";
            const twMatch = html.match(/"url":"([^"]+\.mp4[^"]*)"/i);
            if (twMatch && twMatch[1]) videoUrl = twMatch[1];
          }

          // 7. SUPER FALLBACK (Cari MP4 atau M3U8 Tersembunyi - Brutal Mode)
          if (!videoUrl) {
            const ogVideoMatch = html.match(/<meta\s+property="og:video(?::url|:secure_url)?"\s+content="([^"]+)"/i);
            if (ogVideoMatch && ogVideoMatch[1]) {
              videoUrl = ogVideoMatch[1];
            } else {
              // Regex ini menangkap link MP4 ATAU M3U8 walaupun dibungkus \/ escape Javascript
              // (Tidak memotong string jika URL-nya mengandung query ?hash=123)
              const allVids = [...html.matchAll(/(https?:\\?\/\\?[^"'\s<>]+?(?:\.mp4|\.m3u8)[^"'\s<>]*)/gi)];
              for (const m of allVids) {
                const candidate = cleanUrl(m[1]);
                // Filter cerdas: BUKAN GAMBAR (Sprite/Iklan)
                if (!candidate.includes('/rs:fit/') && !candidate.includes('/plain/') && !candidate.includes('preview')) {
                  videoUrl = candidate;
                  break;
                }
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
          // Akan muncul status Gagal jika finalVideoUrl kosong (Semua engine & fallback menyerah)
          status: finalVideoUrl ? 'sukses' : 'gagal',
          video_url: finalVideoUrl
        };

      } catch (err) {
        return { url_input: targetUrl, status: 'error', pesan: err.message };
      }
    });

    const hasilAll = await Promise.all(scrapePromises);
    const filteredHasil = hasilAll.filter(item => item !== null);

    return NextResponse.json({ success: true, data: filteredHasil });

  } catch (error) {
    return NextResponse.json({ success: false, pesan: "Gagal memproses scraper: " + error.message }, { status: 500 });
  }
}
