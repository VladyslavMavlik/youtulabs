export function Contact() {
  const handleBack = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-emerald-900 to-black">
      <div className="container mx-auto px-4 pt-24 pb-8 max-w-4xl">
        <button
          onClick={handleBack}
          style={{
            color: '#10b981',
            fontSize: '14px',
            background: 'none',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '8px 16px',
            cursor: 'pointer',
            borderRadius: '6px',
            marginTop: '1.5rem',
            marginBottom: '1rem',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)';
            e.currentTarget.style.borderColor = '#10b981';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          }}
        >
          ← Back to Home
        </button>
        <div className="bg-emerald-950/30 backdrop-blur-xl border border-emerald-600/30 rounded-lg p-8">
          <h1 className="text-4xl font-bold text-emerald-100 mb-2">Contact</h1>
          <p className="text-emerald-200/60 mb-8">Get in touch with us</p>

          <div className="prose prose-invert prose-emerald max-w-none text-emerald-100/80 space-y-6">
            <p>
              If you have any questions about youtulabs, billing or your account, you can reach us at:
            </p>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">Contact Information</h2>
              <p className="mb-1"><strong>Email:</strong> youtulabs@gmail.com</p>
              <p className="mb-1"><strong>Service:</strong> youtulabs (AI story generation platform)</p>
              <p><strong>Website:</strong> https://youtulabs.com</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">Support Hours</h2>
              <p>
                We typically respond to emails within 24-48 hours during business days.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">What we can help with</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Account and billing questions</li>
                <li>Technical issues</li>
                <li>Feature requests</li>
                <li>Payment and refund inquiries</li>
                <li>General questions about the service</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
