export function TermsOfService() {
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
          <h1 className="text-4xl font-bold text-emerald-100 mb-2">Terms of Service – youtulabs</h1>
          <p className="text-emerald-200/60 mb-8">Last updated: 27 November 2025</p>

          <div className="prose prose-invert prose-emerald max-w-none text-emerald-100/80 space-y-6">
            <p>
              These Terms of Service govern your access to and use of the youtulabs website and services
              provided by youtulabs. By accessing or using the
              Service, you agree to be bound by these Terms. If you do not agree, you must not use the Service.
            </p>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">1. Eligibility and Accounts</h2>
              <p className="mb-2">1.1. You must be at least 18 years old, or the age of legal majority in your jurisdiction, to use the Service.</p>
              <p className="mb-2">1.2. When you create an account, you must provide accurate and complete information and keep it up to date.</p>
              <p>1.3. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">2. Crystals (Credits) and Virtual Items</h2>
              <p className="mb-2">2.1. The Service uses virtual credits ("Crystals") that you can purchase and spend to generate stories or other content through the Service.</p>
              <p className="mb-2">2.2. Crystals have no cash value, are not real currency, and cannot be exchanged for money or any other monetary value, except as required by law.</p>
              <p className="mb-2">2.3. Once Crystals are purchased and added to your account, they are considered delivered. Crystals are personal to your account and may not be sold, transferred, or assigned to another person or account.</p>
              <p>2.4. We may change the pricing, packages, or consumption rate of Crystals at any time, but such changes will not affect Crystals already purchased before the change.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">3. Payments, Billing and Refunds</h2>
              <p className="mb-2">3.1. Payments for Crystals, subscriptions, or other paid features are processed by third-party payment providers such as Paddle. By making a payment, you also agree to the terms and policies of the relevant payment provider.</p>
              <p className="mb-2">3.2. You authorize us and our payment providers to charge your selected payment method for all applicable fees, taxes, and charges.</p>
              <p className="mb-2">3.3. Unless otherwise stated, all purchases are final and non-refundable, except where a refund is required by applicable law or where we decide, at our sole discretion, to issue a goodwill refund.</p>
              <p className="mb-2">3.4. If you use a subscription plan, it may automatically renew at the end of each billing period, unless you cancel through your account or through the payment provider before the renewal date.</p>
              <p>3.5. We may suspend or cancel your access to the Service if a payment is reversed, disputed, or fails.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">4. Use of the Service and Generated Content</h2>
              <p className="mb-2">4.1. The Service allows you to generate stories and other text content using artificial intelligence tools, for example to use in videos, channels or other media projects.</p>
              <p className="mb-2">4.2. Subject to your compliance with these Terms and full payment of all applicable fees, we grant you a personal, non-exclusive, worldwide license to use, display, adapt, and modify the stories generated for you through the Service for your own projects (for example, for videos, websites, or social media), unless otherwise restricted in these Terms.</p>
              <p className="mb-2">4.3. You are solely responsible for how you use the generated content, including compliance with the laws, rules, and platform policies (e.g., YouTube, TikTok) that apply to your use.</p>
              <p className="mb-2">4.4. You must not use the Service or the generated content to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>violate any law or regulation;</li>
                <li>create or distribute illegal, hateful, or harmful content;</li>
                <li>infringe the rights of any third party, including intellectual property, privacy, or publicity rights;</li>
                <li>spam, harass, or mislead others.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">5. Data and Privacy</h2>
              <p className="mb-2">5.1. We collect and process certain information about you when you use the Service, such as your account details, usage information, and limited payment-related data. Full payment information (such as credit card numbers) is processed and stored by our payment providers and is not stored by us.</p>
              <p className="mb-2">5.2. We use your data to provide, maintain, and improve the Service, to process payments, to prevent fraud and abuse, and to communicate with you (for example, about important updates or marketing, if you have consented).</p>
              <p>5.3. By using the Service, you consent to our processing of your data in accordance with these Terms. We may provide a separate Privacy Policy with more detailed information; if so, that Privacy Policy forms part of these Terms.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">6. Intellectual Property</h2>
              <p className="mb-2">6.1. All software, code, designs, logos, and other materials that we provide as part of the Service (excluding the content generated specifically for you) are owned by us or our licensors and are protected by intellectual property laws.</p>
              <p>6.2. You are granted a limited, non-exclusive, non-transferable license to access and use the Service for its intended purpose. You may not copy, modify, distribute, reverse engineer, or create derivative works from the Service, except as expressly permitted by law.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">7. Service Availability and Changes</h2>
              <p className="mb-2">7.1. We may modify, suspend, or discontinue any part of the Service at any time, with or without notice, including the availability of any feature or content.</p>
              <p>7.2. We may update these Terms from time to time. When we do, we will change the "Last updated" date at the top. Continued use of the Service after changes become effective constitutes your acceptance of the new Terms.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">8. Disclaimers</h2>
              <p className="mb-2">8.1. The Service and all generated content are provided on an "as is" and "as available" basis. We do not guarantee that the stories or other content will be accurate, appropriate for every purpose, or free of errors.</p>
              <p className="mb-2">8.2. To the maximum extent permitted by law, we disclaim all warranties, express or implied, including any warranties of merchantability, fitness for a particular purpose, and non-infringement.</p>
              <p>8.3. You are responsible for reviewing and editing the generated content before using it in any context, especially public or commercial contexts.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">9. Limitation of Liability</h2>
              <p className="mb-2">9.1. To the maximum extent permitted by law, youtulabs and its owners, employees, and partners will not be liable for any indirect, incidental, consequential, special, or punitive damages, or for any loss of profits, revenues, data, or goodwill, arising out of or in connection with your use of the Service.</p>
              <p>9.2. To the extent that we are found liable, our total liability for any claim relating to the Service will not exceed the total amount you have paid to us for the Service in the twelve (12) months preceding the event giving rise to the claim.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">10. Termination</h2>
              <p className="mb-2">10.1. You may stop using the Service at any time.</p>
              <p className="mb-2">10.2. We may suspend or terminate your access to the Service at any time, with or without notice, if we reasonably believe that you have violated these Terms or that your use may harm us, other users, or third parties.</p>
              <p>10.3. Upon termination, any rights granted to you under these Terms will immediately cease, but sections that by their nature should survive (including payment obligations, disclaimers, limitations of liability, and intellectual property terms) will continue to apply.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">11. Governing Law</h2>
              <p>These Terms and any dispute arising out of or in connection with them will be governed by and interpreted in accordance with the laws of Poland, without regard to its conflict-of-laws rules.</p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-emerald-100 mt-8 mb-4">12. Contact</h2>
              <p className="mb-2">If you have any questions about these Terms, please contact us at:</p>
              <p className="mb-1">Email: youtulabs@gmail.com</p>
              <p>Website: https://youtulabs.com</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
