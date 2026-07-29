import { NextResponse } from 'next/server';
import axios from 'axios';

// Pembersih URL dari enkripsi javascript unicode
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
// TIKTOK ENGINE (Sudah Aman)
// ==========================================
async function scrapeTiktok(url) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://www.tiktok.com/',
    };
    const response = await fetch(url, { headers, cache: 'no-store' });
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
    
    let candidates = [];
    if (itemStruct?.video?.playAddr?.UrlList) candidates.push(...itemStruct.video.playAddr.UrlList);
    if (itemStruct?.video?.bitrateInfo) {
      itemStruct.video.bitrateInfo.forEach(br => {
        if (br.PlayAddr?.UrlList) candidates.push(...br.PlayAddr.UrlList);
      });
    }

    let finalVideoUrl = candidates.find(c => c.includes('aweme')) || candidates.sort((a,b) => b.length - a.length)[0];
    const author = itemStruct?.author?.uniqueId || 'Video TikTok';
    return { title: `Video by @${author}`, videoUrl: finalVideoUrl, thumbnail: itemStruct?.video?.cover || '' };
  } catch (error) {
    throw new Error('Gagal scrape TikTok');
  }
}

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

        if (targetUrl.includes('tiktok.com')) {
          platform = "TikTok";
          const tiktokData = await scrapeTiktok(targetUrl);
          title = tiktokData.title; thumbnail = tiktokData.thumbnail; videoUrl = tiktokData.videoUrl;
        } 
        else {
          const isFacebook = targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch') || targetUrl.includes('fb.me');
          
          let reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          };

          // Bypass age gate secara natural
          if (targetUrl.includes('pornhub') || targetUrl.includes('xvideos') || targetUrl.includes('xnxx')) {
            reqHeaders['Cookie'] = 'age_verified=1; platform=pc; wp_adult=1;';
          }

          const response = await axios.get(targetUrl, { headers: reqHeaders, timeout: 15000 });
          const html = response.data;

          const titleMatch = html.match(/<title>([^<]+)<\/title>/i) || html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
          if (titleMatch && titleMatch[1]) title = cleanUrl(titleMatch[1]);
          const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
          if (thumbMatch && thumbMatch[1]) thumbnail = cleanUrl(thumbMatch[1]);

          // 1. FACEBOOK ENGINE (Kembali pakai Sniper Pola HD)
          if (isFacebook) {
            platform = "Facebook";
            const hdMatch = html.match(/["']?(?:browser_native_hd_url|playable_url_quality_hd)["']?\s*:\s*["']([^"']+)["']/i);
            const sdMatch = html.match(/["']?(?:browser_native_sd_url|playable_url)["']?\s*:\s*["']([^"']+)["']/i);
            if (hdMatch && hdMatch[1]) videoUrl = hdMatch[1];
            else if (sdMatch && sdMatch[1]) videoUrl = sdMatch[1];
          }

          // 2. XVIDEOS & XNXX ENGINE (Sniper Variabel html5player)
          else if (targetUrl.includes('xvideos.com') || targetUrl.includes('xnxx.com')) {
            platform = targetUrl.includes('xvideos') ? "XVideos" : "XNXX";
            const xvTitle = html.match(/setVideoTitle\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
            if (xvTitle && xvTitle[1]) title = xvTitle[1];
            const xvThumb = html.match(/setThumbUrl\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
            if (xvThumb && xvThumb[1]) thumbnail = xvThumb[1];

            // Incar kualitas tertinggi secara spesifik
            const xvHigh = html.match(/setVideoUrlHigh\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
            const xvLow = html.match(/setVideoUrlLow\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
            const xvHls = html.match(/setVideoHLS\s*\(\s*['"]([^'"]+)['"]\s*\)/i);

            if (xvHigh && xvHigh[1]) videoUrl = xvHigh[1];
            else if (xvLow && xvLow[1]) videoUrl = xvLow[1];
            else if (xvHls && xvHls[1]) videoUrl = xvHls[1];
          }

          // 3. PORNHUB ENGINE (Sniper MediaDefinitions Bebas Iklan)
          else if (targetUrl.includes('pornhub.com')) {
            platform = "Pornhub";
            const mediaDefsMatch = html.match(/mediaDefinitions\s*:\s*(\[.*?\])/i);
            if (mediaDefsMatch && mediaDefsMatch[1]) {
              try {
                const urls = [...mediaDefsMatch[1].matchAll(/"videoUrl"\s*:\s*"([^"]+)"/g)];
                const validUrls = urls.map(u => cleanUrl(u[1])).filter(u => u.startsWith('http') && u.includes('.mp4'));
                if (validUrls.length > 0) videoUrl = validUrls[0];
              } catch (e) {}
            }
            
            // Fallback PH (Pasti Video, bukan JPG iklan)
            if (!videoUrl) {
              const allMp4s = [...html.matchAll(/(https?:\\?\/\\?[^"'\s<>]+?\.mp4[^"'\s<>]*)/gi)];
              for (const m of allMp4s) {
                const candidate = cleanUrl(m[1]);
                // KUNCI: Tolak mentah-mentah jika mengandung ekstensi gambar!
                if (!candidate.match(/\.(jpg|jpeg|png|webp|gif)/i) && candidate.includes('phncdn')) {
                  videoUrl = candidate;
                  if (candidate.includes('1080') || candidate.includes('720')) break;
                }
              }
            }
          }

          // 4. GENERAL FALLBACK & LAINNYA
          if (!videoUrl) {
            const ogVideoMatch = html.match(/<meta\s+property="og:video(?::url|:secure_url)?"\s+content="([^"]+\.mp4[^"]*)"/i);
            if (ogVideoMatch && ogVideoMatch[1]) {
              videoUrl = ogVideoMatch[1];
            } else {
              const allMp4s = [...html.matchAll(/(https?:\\?\/\\?[^"'\s<>]+?\.mp4[^"'\s<>]*)/gi)];
              for (const m of allMp4s) {
                const candidate = cleanUrl(m[1]);
                // KUNCI: Tolak file iklan/gambar sprite
                if (!candidate.match(/\.(jpg|jpeg|png|webp|gif)/i) && !candidate.includes('/rs:fit/') && !candidate.includes('/plain/')) {
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
