import { NextResponse } from 'next/server';

// ==========================================
// FUNGSI UTILITAS PEMBERSIH URL & TEKS
// ==========================================
function cleanUrl(rawUrl) {
  if (!rawUrl) return "";
  let clean = rawUrl;
  try {
    clean = JSON.parse(`"${clean.replace(/\\"/g, '"')}"`);
  } catch (e) {
    // Fallback jika gagal parse JSON
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

function extractTitle(html) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i) || html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  return titleMatch ? titleMatch[1].trim() : "Video Tanpa Judul";
}

function extractThumbnail(html) {
  const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i);
  return thumbMatch ? cleanUrl(thumbMatch[1]) : "https://via.placeholder.com/500x500?text=No+Thumbnail";
}

// ==========================================
// FUNGSI UTAMA SCRAPING
// ==========================================
export async function POST(request) {
  try {
    const body = await request.json();
    const urls = body.urls || [body.url]; // Support array "urls" atau string "url" satuan

    if (!urls || urls.length === 0 || !urls[0]) {
      return NextResponse.json({ success: false, pesan: "Harap masukkan URL video yang valid." }, { status: 400 });
    }

    const scrapePromises = urls.map(async (rawUrl) => {
      const targetUrl = typeof rawUrl === 'string' ? rawUrl.trim() : '';
      if (!targetUrl) return null;

      try {
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache'
          },
          redirect: 'follow'
        });

        if (!response.ok) throw new Error(`Server target menolak akses (Status: ${response.status})`);

        const html = await response.text();
        let videoUrl = "";
        let platform = "Web Umum";
        let title = extractTitle(html);
        let thumbnail = extractThumbnail(html);

        // ------------------------------------------
        // 1. ENGINE TIKTOK
        // ------------------------------------------
        if (targetUrl.includes('tiktok.com')) {
          platform = "TikTok";
          
          // Cari universal data script
          const universalDataMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/);
          if (universalDataMatch && universalDataMatch[1]) {
            const dMatch = universalDataMatch[1].match(/"downloadAddr":"([^"]+)"/i);
            const pMatch = universalDataMatch[1].match(/"playAddr":"([^"]+)"/i);
            const coverMatch = universalDataMatch[1].match(/"cover":"([^"]+)"/i);
            const descMatch = universalDataMatch[1].match(/"desc":"([^"]+)"/i);

            if (dMatch) videoUrl = dMatch[1];
            else if (pMatch) videoUrl = pMatch[1];
            if (coverMatch) thumbnail = cleanUrl(coverMatch[1]);
            if (descMatch) title = descMatch[1];
          }

          // Fallback regex buta
          if (!videoUrl) {
            const fallbackVid = html.match(/"(?:downloadAddr|playAddr)":"([^"]+)"/i);
            if (fallbackVid) videoUrl = fallbackVid[1];
          }
        } 
        
        // ------------------------------------------
        // 2. ENGINE FACEBOOK
        // ------------------------------------------
        else if (targetUrl.includes('facebook.com') || targetUrl.includes('fb.watch')) {
          platform = "Facebook";
          const fbPatterns = [
            /"browser_native_hd_url":"([^"]+)"/i,
            /"playable_url_quality_hd":"([^"]+)"/i,
            /"browser_native_sd_url":"([^"]+)"/i,
            /"playable_url":"([^"]+)"/i
          ];
          for (const pattern of fbPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
              videoUrl = match[1];
              break;
            }
          }
        } 
        
        // ------------------------------------------
        // 3. ENGINE INSTAGRAM
        // ------------------------------------------
        else if (targetUrl.includes('instagram.com')) {
          platform = "Instagram";
          const igMatch = html.match(/"video_url":"([^"]+)"/i) || html.match(/"video_versions":\[{"type":\d+,"url":"([^"]+)"/i);
          if (igMatch) videoUrl = igMatch[1];
        } 
        
        // ------------------------------------------
        // 4. ENGINE TWITTER / X
        // ------------------------------------------
        else if (targetUrl.includes('x.com') || targetUrl.includes('twitter.com')) {
          platform = "Twitter/X";
          const twMatch = html.match(/"url":"([^"]+\.mp4[^"]*)"/i);
          if (twMatch) videoUrl = twMatch[1];
        }

        // ------------------------------------------
        // 5. ENGINE GLOBAL (YOUTUBE SHORTS & LAINNYA)
        // ------------------------------------------
        if (!videoUrl) {
          const ogVideo = html.match(/<meta\s+property="og:video(?::url|:secure_url)?"\s+content="([^"]+)"/i);
          if (ogVideo) {
            videoUrl = ogVideo[1];
          } else {
            const mp4Match = html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
            if (mp4Match) videoUrl = mp4Match[1];
          }
        }

        // Finalisasi Data
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

    const hasil = await Promise.all(scrapePromises);
    const dataBersih = hasil.filter(item => item !== null);

    return NextResponse.json({ success: true, data: dataBersih });

  } catch (error) {
    return NextResponse.json({ success: false, pesan: "Fatal Error: " + error.message }, { status: 500 });
  }
}
