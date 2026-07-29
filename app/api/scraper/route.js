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
          title = tiktokData.title;
          thumbnail = tiktokData.thumbnail;
          videoUrl = tiktokData.videoUrl;
        } 
        else {
          const isFacebook = targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch') || targetUrl.includes('fb.me');
          
          let reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          };

          // Bypass age gate secara paksa
          if (targetUrl.includes('pornhub') || targetUrl.includes('xvideos') || targetUrl.includes('xnxx')) {
            reqHeaders['Cookie'] = 'age_verified=1; platform=pc; wp_adult=1;';
          }

          const response = await axios.get(targetUrl, { headers: reqHeaders, timeout: 15000 });
          const html = response.data;

          const titleMatch = html.match(/<title>([^<]+)<\/title>/i) || html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
          if (titleMatch && titleMatch[1]) title = cleanUrl(titleMatch[1]);

          const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
          if (thumbMatch && thumbMatch[1]) thumbnail = cleanUrl(thumbMatch[1]);

          // 1. FACEBOOK ENGINE
          if (isFacebook) {
            platform = "Facebook";
            const hdMatch = html.match(/["']?(?:browser_native_hd_url|playable_url_quality_hd|hd_src)["']?\s*:\s*["']([^"']+)["']/i);
            const sdMatch = html.match(/["']?(?:browser_native_sd_url|playable_url|sd_src)["']?\s*:\s*["']([^"']+)["']/i);

            if (hdMatch && hdMatch[1] && hdMatch[1] !== "null") videoUrl = hdMatch[1];
            else if (sdMatch && sdMatch[1] && sdMatch[1] !== "null") videoUrl = sdMatch[1];
          }

          // 2. XVIDEOS & XNXX ENGINE (MODE SAPU JAGAT MP4)
          else if (targetUrl.includes('xvideos.com') || targetUrl.includes('xnxx.com')) {
            platform = targetUrl.includes('xvideos') ? "XVideos" : "XNXX";

            const xvTitle = html.match(/setVideoTitle\(['"]([^'"]+)['"]\)/i);
            if (xvTitle && xvTitle[1]) title = xvTitle[1];
            const xvThumb = html.match(/setThumbUrl(?:169)?\(['"]([^'"]+)['"]\)/i);
            if (xvThumb && xvThumb[1]) thumbnail = xvThumb[1];

            // Sapu jagat: Cari SEMUA link MP4 di seluruh isi HTML
            const allMp4Links = [...html.matchAll(/(https?:\\?\/\\?[^"'\s<>]+?\.mp4[^"'\s<>]*)/gi)];
            
            for (const match of allMp4Links) {
              const cleanV = cleanUrl(match[1]);
              // Pastikan itu link CDN resmi XVideos / XNXX (Bukan iklan/sponsor)
              if (cleanV.includes('xvideos-cdn.com') || cleanV.includes('xnxx-cdn.com')) {
                videoUrl = cleanV; // Simpan
                // Jika dapet yang ada tulisan 1080p, 720p, atau High, langsung berhenti (ambil yang terbaik)
                if (cleanV.includes('1080p') || cleanV.includes('720p') || cleanV.includes('high')) {
                  break; 
                }
              }
            }
          }

          // 3. PORNHUB ENGINE (MODE SAPU JAGAT MP4)
          else if (targetUrl.includes('pornhub.com')) {
            platform = "Pornhub";
            
            // Sapu jagat seluruh HTML mencari file mp4 dari server phncdn
            const allMp4Links = [...html.matchAll(/(https?:\\?\/\\?[^"'\s<>]+?\.mp4[^"'\s<>]*)/gi)];
            for (const match of allMp4Links) {
              const cleanV = cleanUrl(match[1]);
              if (cleanV.includes('phncdn.com') || cleanV.includes('pornhub')) {
                // Filter agar tidak ngambil video GIF preview (trailer)
                if (!cleanV.includes('blank') && !cleanV.includes('preview') && !cleanV.includes('gif')) {
                  videoUrl = cleanV;
                  // Jika ada tulisan kualitas HD, langsung berhenti
                  if (cleanV.includes('1080P') || cleanV.includes('720P') || cleanV.includes('480P')) {
                    break;
                  }
                }
              }
            }
          }

          // 4. INSTAGRAM & TWITTER
          else if (targetUrl.includes('instagram.com')) {
            platform = "Instagram";
            const igMatch = html.match(/"video_url":"([^"]+)"/i) || html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i);
            if (igMatch && igMatch[1]) videoUrl = igMatch[1];
          }
          else if (targetUrl.includes('x.com') || targetUrl.includes('twitter.com')) {
            platform = "Twitter/X";
            const twMatch = html.match(/"url":"([^"]+\.mp4[^"]*)"/i);
            if (twMatch && twMatch[1]) videoUrl = twMatch[1];
          }

          // 5. SUPER FALLBACK UNTUK SITUS LAIN (WAJIB MP4, ANTI-M3U8)
          if (!videoUrl) {
            // Langkah A: Cek tag Meta Standard
            const ogVideoMatch = html.match(/<meta\s+property="og:video(?::url|:secure_url)?"\s+content="([^"]+\.mp4[^"]*)"/i);
            if (ogVideoMatch && ogVideoMatch[1]) {
              videoUrl = ogVideoMatch[1];
            } else {
              // Langkah B: Cari file HANYA .MP4 (Abaikan M3U8 supaya tidak jadi file text 1KB)
              const allMp4s = [...html.matchAll(/(https?:\\?\/\\?[^"'\s<>]+?\.mp4[^"'\s<>]*)/gi)];
              for (const m of allMp4s) {
                const candidate = cleanUrl(m[1]);
                // Pastikan bukan thumbnail gambar atau preview
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
