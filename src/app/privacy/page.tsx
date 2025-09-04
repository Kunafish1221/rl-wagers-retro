'use client'

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-8">
      <h1 className="text-5xl font-extrabold tracking-widest text-rl-neon neon">
        PRIVACY POLICY
      </h1>

      <p className="text-white/70">
        Last updated: {new Date().toLocaleDateString()}
      </p>

      <section className="space-y-4 leading-relaxed text-white/90">
        <p>
          This Privacy Policy explains how we collect, use, and protect your
          information when you use WAGER RL.
        </p>

        <h2 className="mt-6 text-2xl font-bold tracking-wider">1. Data We Collect</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>Account data: handle, display name, avatar, Epic IGN</li>
          <li>Technical data: IP, user agent, session tokens</li>
          <li>Financial data: WT balance, deposits, withdrawals, ledger entries</li>
          <li>Match data: lobbies, participants, outcomes, referee notes</li>
        </ul>

        <h2 className="mt-6 text-2xl font-bold tracking-wider">2. How We Use Data</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>Operate and secure the platform</li>
          <li>Prevent fraud and enforce rules</li>
          <li>Process deposits/withdrawals and match settlements</li>
          <li>Comply with legal obligations</li>
        </ul>

        <h2 className="mt-6 text-2xl font-bold tracking-wider">3. Cookies & Storage</h2>
        <p>
          We use session cookies and secure tokens for authentication. Do not
          share your device with untrusted users.
        </p>

        <h2 className="mt-6 text-2xl font-bold tracking-wider">4. Sharing</h2>
        <p>
          We may share limited data with payment/wallet providers to complete
          transactions or with authorities where required by law.
        </p>

        <h2 className="mt-6 text-2xl font-bold tracking-wider">5. Security</h2>
        <p>
          We employ technical and organizational measures. No system is
          perfectly secure; use strong passwords and wallet hygiene.
        </p>

        <h2 className="mt-6 text-2xl font-bold tracking-wider">6. Your Rights</h2>
        <p>
          You may request access or deletion of account data subject to legal
          exemptions and retention obligations.
        </p>

        <h2 className="mt-6 text-2xl font-bold tracking-wider">7. Changes</h2>
        <p>
          We may update this policy. Continued use means you accept the
          updates.
        </p>

        <h2 className="mt-6 text-2xl font-bold tracking-wider">8. Contact</h2>
        <p>
          For privacy requests, contact support via the Contact page.
        </p>
      </section>
    </main>
  )
}