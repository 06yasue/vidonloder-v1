"use client";

import { useState } from 'react';

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const handleScrape = async () => {
    setErrorMsg('');
    if (!inputText.trim()) {
      setErrorMsg('Teks area masih kosong. Masukkan link terlebih dahulu.');
      return;
    }
    
    const urls = inputText.split('\n').filter(link => link.trim() !== '');
    
    setLoading(true);
    setResults([]);

    try {
      const res = await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      });
      
      const responseData = await res.json();
      if (responseData.success) {
        setResults(responseData.data);
      } else {
        setErrorMsg('Gagal memproses data di server.');
      }
    } catch (error) {
      setErrorMsg('Gagal terhubung ke server backend.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="row" style={{ borderRadius: '0px' }}>
      <div className="col-md-8 col-md-offset-2">
        
        <h2 className="text-center" style={{ fontWeight: 'bold' }}>Multi Video Scraper</h2>
        <p className="text-center text-muted">Murni server code Next.js</p>
        <hr />

        {errorMsg && (
          <p className="text-danger" style={{ fontWeight: 'bold' }}>Error: {errorMsg}</p>
        )}

        <div className="form-group">
          <label>Daftar URL Target:</label>
          <textarea 
            className="form-control" 
            rows="5"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="https://www.tiktok.com/...&#10;https://www.facebook.com/..."
            style={{ borderRadius: '0px', resize: 'vertical' }}
          />
        </div>

        <button 
          type="button" 
          className="btn btn-primary btn-block" 
          onClick={handleScrape}
          disabled={loading}
          style={{ borderRadius: '0px', padding: '10px', fontSize: '16px' }}
        >
          {loading ? 'Sedang Memproses...' : 'Mulai Scrape'}
        </button>

        <hr style={{ margin: '30px 0' }} />
        
        {results.length > 0 && <h3>Hasil Scrape:</h3>}

        {results.map((item, index) => (
          <div key={index} style={{ borderBottom: '2px solid #ddd', paddingBottom: '15px', marginBottom: '20px' }}>
            <p><strong>Platform:</strong> {item.platform}</p>
            <p style={{ wordBreak: 'break-all' }}><strong>Target Asli:</strong> <a href={item.url_asli} target="_blank" rel="noreferrer">{item.url_asli}</a></p>
            
            {item.status === 'sukses' ? (
              <div>
                <p><strong>Judul:</strong> {item.title}</p>
                
                {item.image && (
                  <div style={{ marginBottom: '10px' }}>
                    <p><strong>Thumbnail:</strong></p>
                    <img src={item.image} alt="Thumbnail" style={{ maxWidth: '200px', height: 'auto', display: 'block' }} />
                  </div>
                )}

                <div style={{ marginTop: '15px' }}>
                  {/* Pemutar Video HTML5 Langsung di Halaman */}
                  <p><strong>Pratinjau Video:</strong></p>
                  <video 
                    controls 
                    style={{ width: '100%', maxWidth: '400px', backgroundColor: '#000', marginBottom: '10px' }}
                    src={`/api/download?url=${encodeURIComponent(item.video_url)}`}
                  >
                    Browser Anda tidak mendukung pemutar video.
                  </video>
                  <br />

                  {/* Tombol Buka di Tab Baru menggunakan API Proxy */}
                  <a 
                    href={`/api/download?url=${encodeURIComponent(item.video_url)}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="btn btn-success btn-sm"
                    style={{ borderRadius: '0px' }}
                  >
                    Buka Video di Tab Baru
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-danger"><strong>Status:</strong> Gagal diekstrak karena tersembunyi / proteksi keamanan.</p>
            )}
          </div>
        ))}

      </div>
    </div>
  )
}
