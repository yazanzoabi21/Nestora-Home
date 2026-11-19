import { UUID } from "./model.ts";

export async function authenticateSignal(
  request: Request,
  body: string,
  secret: string | undefined,
  now = Date.now(),
): Promise<{ nonce: string; bodyHash: string } | null> {
  const signature = request.headers.get("x-order-email-signature") ?? "";
  const timestamp = request.headers.get("x-order-email-timestamp") ?? "";
  const nonce = request.headers.get("x-order-email-nonce") ?? "";
  if (
    !secret || !/^[a-f0-9]{64}$/i.test(secret) ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    !/^\d{10}$/.test(timestamp) || !UUID.test(nonce)
  ) return null;
  const age = Math.floor(now / 1000) - Number(timestamp);
  if (age < -30 || age > 300) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(
    signature.match(/../g) ?? [],
    (value) => parseInt(value, 16),
  );
  const signed = encoder.encode(
    `nestora-order-email-v1\n${timestamp}\n${nonce}\n${body}`,
  );
  if (!await crypto.subtle.verify("HMAC", key, bytes, signed)) return null;
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(body)),
  );
  return {
    nonce,
    bodyHash: Array.from(hash, (value) => value.toString(16).padStart(2, "0"))
      .join(""),
  };
}
