// Envio de e-mails (servidor). Credenciais SÓ por variáveis de ambiente — nada no código, nada no navegador:
//   SMTP_HOST, SMTP_PORT (465 = TLS direto; 587 = STARTTLS), SMTP_USER, SMTP_PASS, MAIL_FROM ("BlackHole <nao-responda@seu-dominio>")
// Funciona com qualquer SMTP (e-mail da Hostinger, Gmail com senha de app, Brevo, etc.).
// Sem SMTP configurado, nada é enviado (a tela mostra que o envio está indisponível) — exceto, só para testes locais,
// MAIL_OUTBOX_DIR: grava as mensagens como arquivos nessa pasta (NUNCA definir em produção).
// Mensagens de erro nunca levam credenciais, e o conteúdo (que contém links) nunca vai para logs.
import fs from "node:fs";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";

export type Mail = { to: string; subject: string; text: string };
type Sender = (m: Mail) => Promise<void>;

let override: Sender | null = null;
let cached: { key: string; transport: Transporter } | null = null;

/** Só para testes: troca o envio por uma função (ou null para voltar ao normal). */
export function setMailSenderForTests(fn: Sender | null): void {
  override = fn;
}

function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM ?? user;
  if (!host || !user || !pass || !from || !Number.isInteger(port)) return null;
  return { host, port, user, pass, from };
}

/** Há como enviar e-mail? (SMTP configurado, pasta de teste, ou envio de teste injetado) */
export function mailConfigured(): boolean {
  return !!override || !!smtpConfig() || !!process.env.MAIL_OUTBOX_DIR;
}

export async function sendMail(m: Mail): Promise<void> {
  if (override) return override(m);
  const cfg = smtpConfig();
  if (cfg) {
    const key = `${cfg.host}:${cfg.port}:${cfg.user}`;
    if (!cached || cached.key !== key) {
      cached = {
        key,
        transport: nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.port === 465,
          requireTLS: cfg.port !== 465,
          auth: { user: cfg.user, pass: cfg.pass },
          connectionTimeout: 15_000,
          greetingTimeout: 15_000,
          socketTimeout: 20_000,
          // Mensagens só de texto: nada de anexos, arquivos ou URLs externas.
          disableFileAccess: true,
          disableUrlAccess: true,
        }),
      };
    }
    try {
      await cached.transport.sendMail({ from: cfg.from, to: m.to, subject: m.subject, text: m.text });
    } catch {
      // Sem detalhes (poderiam conter o servidor ou o usuário do SMTP).
      throw new Error("Falha no envio do e-mail");
    }
    return;
  }
  const dir = process.env.MAIL_OUTBOX_DIR;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    fs.writeFileSync(file, JSON.stringify(m, null, 1));
    return;
  }
  throw new Error("Envio de e-mail não configurado");
}
