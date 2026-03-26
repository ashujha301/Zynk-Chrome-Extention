export default function PrivacyPolicy() {
    return (
      <div className="min-h-screen bg-black text-white px-6 py-12 flex justify-center">
        <div className="max-w-3xl w-full">
          <h1 className="text-3xl font-bold mb-6 text-cyan-400">
            Privacy Policy
          </h1>
  
          <p className="text-sm text-gray-400 mb-8">
            Last updated: March 2026
          </p>
  
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-2">1. Introduction</h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              Zynk ("we", "our", "us") respects your privacy. This Privacy Policy
              explains how we collect, use, and protect your information when you
              use our Chrome extension and web application.
            </p>
          </section>
  
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-2">
              2. Information We Collect
            </h2>
            <ul className="text-gray-300 text-sm space-y-2 list-disc ml-5">
              <li>
                Authentication data via Clerk (secure session-based login).
              </li>
              <li>
                User inputs such as commands used for AI execution.
              </li>
              <li>
                Gesture data processed locally via your device camera.
              </li>
              <li>
                Basic usage logs for performance and debugging.
              </li>
            </ul>
          </section>
  
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-2">
              3. Camera Usage (Important)
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              Zynk uses your device camera only for real-time hand gesture
              detection. This data is processed locally on your device and is not
              stored or transmitted to our servers.
            </p>
          </section>
  
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-2">
              4. How We Use Information
            </h2>
            <ul className="text-gray-300 text-sm space-y-2 list-disc ml-5">
              <li>To authenticate users securely.</li>
              <li>To process AI commands and provide results.</li>
              <li>To improve performance and user experience.</li>
              <li>To prevent abuse and ensure system security.</li>
            </ul>
          </section>
  
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-2">
              5. Data Sharing
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              We do not sell or share your personal data with third parties. Data
              is only processed through secure backend services required for the
              functionality of the application.
            </p>
          </section>
  
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-2">
              6. Data Security
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              We use secure, HTTP-only cookies and encrypted communication (HTTPS)
              to protect your data. Authentication is handled through trusted
              providers to ensure maximum security.
            </p>
          </section>
  
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-2">
              7. Your Control
            </h2>
            <ul className="text-gray-300 text-sm space-y-2 list-disc ml-5">
              <li>You can log out anytime to clear your session.</li>
              <li>You can disable camera permissions in your browser.</li>
              <li>You may stop using the service at any time.</li>
            </ul>
          </section>
  
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-2">
              8. Changes to This Policy
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              We may update this Privacy Policy from time to time. Updates will be
              reflected on this page with a revised date.
            </p>
          </section>
  
          <section>
            <h2 className="text-xl font-semibold mb-2">
              9. Contact
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              If you have any questions about this Privacy Policy, you can contact
              developer at:
            </p>
            <p className="text-cyan-400 text-sm mt-2">
              ashujha301@gmail.com
            </p>
          </section>
        </div>
      </div>
    );
  }