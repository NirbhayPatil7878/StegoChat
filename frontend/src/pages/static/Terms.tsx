import { PageTitle, Prose } from "@/components/layout/MarketingLayout";

export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Terms of service" subtitle="Last updated: July 2026" />
      <Prose>
        <h2>1. The service</h2>
        <p>
          StegoChat provides encrypted messaging and image steganography tools. It is offered
          as-is, without warranty of any kind. We may change or discontinue features with
          reasonable notice.
        </p>
        <h2>2. Your account</h2>
        <p>
          You are responsible for your credentials and for everything done under your account.
          Choose a strong password — password resets cannot recover encrypted content whose
          passwords only you knew.
        </p>
        <h2>3. Acceptable use</h2>
        <p>
          Use StegoChat for lawful purposes only. Privacy is a right; harassment, fraud,
          distribution of illegal material and attacks against the service or its users are not.
          We may suspend accounts engaged in abuse.
        </p>
        <h2>4. Your content</h2>
        <p>
          You retain all rights to what you upload and send. You grant us only the technical
          license needed to store and deliver it. Deleting content or your account removes it
          from our systems.
        </p>
        <h2>5. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, StegoChat is not liable for indirect or
          consequential damages, data loss caused by forgotten passwords, or payload destruction
          caused by third-party image re-compression.
        </p>
        <h2>6. Contact</h2>
        <p>Questions about these terms? Reach us through the Contact page.</p>
      </Prose>
    </div>
  );
}
