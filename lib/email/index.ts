/**
 * Email abstraction. Demo mode never requires credentials: the "console"
 * provider logs the message. Resend / SendGrid / Gmail can be wired later by
 * implementing EmailProvider — the rest of the app only depends on sendEmail().
 */

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface EmailProvider {
  name: string;
  send(msg: EmailMessage): Promise<{ id?: string; delivered: boolean; detail?: string }>;
}

class ConsoleProvider implements EmailProvider {
  name = "console";
  async send(msg: EmailMessage) {
    console.info(`[email:console] to=${msg.to.join(",")} subject="${msg.subject}" (${msg.html.length} chars html)`);
    return { delivered: false, detail: "Console provider — message logged, not delivered." };
  }
}

class ResendProvider implements EmailProvider {
  name = "resend";
  constructor(private readonly apiKey: string) {}
  async send(msg: EmailMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: msg.from ?? process.env.EMAIL_FROM ?? "AdPilot AI <adpilot@sketchdeck.ai>", to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) throw new Error(`Resend → ${res.status} ${await res.text().catch(() => "")}`);
    const json = (await res.json()) as { id?: string };
    return { id: json.id, delivered: true };
  }
}

class SendGridProvider implements EmailProvider {
  name = "sendgrid";
  constructor(private readonly apiKey: string) {}
  async send(msg: EmailMessage) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: msg.to.map((email) => ({ email })) }],
        from: { email: msg.from ?? process.env.EMAIL_FROM ?? "adpilot@sketchdeck.ai" },
        subject: msg.subject,
        content: [{ type: "text/html", value: msg.html }],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid → ${res.status}`);
    return { delivered: true };
  }
}

export function getEmailProvider(): EmailProvider {
  const provider = (process.env.EMAIL_PROVIDER ?? "console").toLowerCase();
  const key = process.env.EMAIL_PROVIDER_API_KEY;
  if (provider === "resend" && key) return new ResendProvider(key);
  if (provider === "sendgrid" && key) return new SendGridProvider(key);
  // Gmail requires OAuth; treated as not configured until an adapter exists.
  return new ConsoleProvider();
}

export function sendEmail(msg: EmailMessage) {
  return getEmailProvider().send(msg);
}
