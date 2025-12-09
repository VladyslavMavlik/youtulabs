export function RefundPolicy() {
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
          <h1 className="text-4xl font-bold text-emerald-100 mb-2">Refund Policy</h1>
          <p className="text-emerald-200/60 mb-8">Last updated: 27 November 2025</p>

          <div className="prose prose-invert prose-emerald max-w-none text-emerald-100/80 space-y-6">
            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">Digital products and crystals</h2>
              <p className="mb-2">
                When you purchase crystals or other digital products on youtulabs, they are delivered to your account immediately after successful payment.
              </p>
              <p className="mb-2">
                All purchases are generally final and non-refundable.
              </p>
              <p>
                However, if you experience a technical problem (for example, you are charged but do not receive crystals), please contact us within 14 days at youtulabs@gmail.com and we will review your case.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">Chargebacks and disputes</h2>
              <p className="mb-2">
                If there is an unauthorized payment or another serious issue, please contact us first.
              </p>
              <p>
                We will do our best to resolve the problem quickly and fairly.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">Contact</h2>
              <p>
                For any questions about refunds, please email: youtulabs@gmail.com
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
