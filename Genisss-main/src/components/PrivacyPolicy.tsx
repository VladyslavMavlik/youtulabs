export function PrivacyPolicy() {
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
          <h1 className="text-4xl font-bold text-emerald-100 mb-2">Privacy Policy</h1>
          <p className="text-emerald-200/60 mb-8">Last updated: 27 November 2025</p>

          <div className="prose prose-invert prose-emerald max-w-none text-emerald-100/80 space-y-6">
            <p>
              youtulabs provides an AI story generation service at youtulabs.com.
            </p>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">What data we collect</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Account information (email address and basic profile details you provide)</li>
                <li>Usage data (which features you use, basic analytics)</li>
                <li>Payment-related data (handled by our payment providers, such as Paddle. We do not store full card details.)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">How we use your data</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>To provide and maintain the Service</li>
                <li>To process payments and prevent fraud</li>
                <li>To improve the Service and understand how users interact with it</li>
                <li>To communicate with you about important updates, and (if you consent) occasional product news</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">Sharing your data</h2>
              <p className="mb-2">We do not sell your personal data.</p>
              <p className="mb-2">We may share limited data with:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>payment providers (for example Paddle) to process payments,</li>
                <li>service providers that help us host and run youtulabs,</li>
                <li>authorities if required by law.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">Data security</h2>
              <p>
                We take reasonable technical and organizational measures to protect your data, but no system is 100% secure.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">Your rights</h2>
              <p className="mb-2">
                Depending on your location, you may have the right to access, correct, or delete your personal data.
              </p>
              <p>
                You can contact us at youtulabs@gmail.com for any privacy questions or requests.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">Contact</h2>
              <p className="mb-2">If you have any questions about this Privacy Policy, please contact us at:</p>
              <p className="mb-1">Email: youtulabs@gmail.com</p>
              <p>Location: Poland</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
