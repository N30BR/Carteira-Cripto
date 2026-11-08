import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Política de conteúdo sem nonce (guia "Without Nonces" do Next): só recursos do próprio site,
// e a página não pode ser aberta dentro de outro site (frame-ancestors).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Só vale em HTTPS (o navegador ignora em HTTP local).
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    // Páginas abertas por link de e-mail (token no fragmento #): nunca enviar a origem a outros sites nem guardar em cache.
    const linkPages = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "no-store" },
    ];
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/redefinir-senha", headers: linkPages },
      { source: "/verificar-email", headers: linkPages },
    ];
  },
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],
  experimental: {
    serverActions: {
      allowedOrigins: process.env.APP_DOMAIN ? [process.env.APP_DOMAIN] : undefined,
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
