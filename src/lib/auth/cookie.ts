function isSecure(): boolean {
  return process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
}

export function sessionCookieName(): string {
  return isSecure() ? "__Host-session" : "session";
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecure(),
    path: "/",
    expires: expiresAt,
  };
}
