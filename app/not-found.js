import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="row">
      <div className="col-md-12 text-center" style={{ marginTop: '50px' }}>
        <h1 className="text-danger" style={{ fontSize: '60px', fontWeight: 'bold' }}>404</h1>
        <h3>Halaman Tidak Ditemukan</h3>
        <p className="text-muted">File atau URL yang kamu tuju tidak ada.</p>
        <Link href="/" className="btn btn-primary" style={{ borderRadius: '0px' }}>
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  )
}
