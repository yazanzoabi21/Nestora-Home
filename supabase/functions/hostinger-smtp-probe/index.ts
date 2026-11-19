import nodemailer from "nodemailer";
import { createProbeHandler, type ProbeConfig } from "./handler.ts";

const HOST = "smtp.hostinger.com";
const PORT = 465;

function transport(config: ProbeConfig) {
  return nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: true,
    pool: false,
    auth: { user: config.username, pass: config.password },
    tls: { servername: HOST, rejectUnauthorized: true, minVersion: "TLSv1.2" },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    dnsTimeout: 10_000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

async function dns(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const records = await Promise.race([
      Promise.allSettled([
        Deno.resolveDns(HOST, "A"),
        Deno.resolveDns(HOST, "AAAA"),
      ]),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("DNS timeout")), 10_000);
      }),
    ]);
    if (
      !records.some((result) =>
        result.status === "fulfilled" && result.value.length > 0
      )
    ) {
      throw new Error("DNS unavailable");
    }
  } finally {
    clearTimeout(timer);
  }
}

async function tls(): Promise<void> {
  // Explicit certificate-validating TLS probe, independent of SMTP authentication.
  let expired = false;
  let connection: Deno.TlsConn | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        connection?.close();
        reject(new Error("TLS timeout"));
      }, 10_000);
    });
    const connect = Deno.connectTls({ hostname: HOST, port: PORT }).then(
      (socket) => {
        if (expired) {
          socket.close();
          throw new Error("TLS timeout");
        }
        connection = socket;
        return socket.handshake();
      },
    );
    await Promise.race([connect, timeout]);
  } finally {
    clearTimeout(timer);
    try {
      connection?.close();
    } catch { /* Timeout may already have closed the socket. */ }
  }
}

async function claim(runId: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Claim configuration missing");
  // This service-only RPC must be reviewed/installed separately before send-once is enabled.
  const result = await fetch(
    new URL("/rest/v1/rpc/claim_nestora_smtp_probe", url),
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_run_id: runId }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!result.ok) throw new Error("Claim failed");
  const claimed: unknown = await result.json();
  if (typeof claimed !== "boolean") throw new Error("Invalid claim result");
  return claimed;
}

Deno.serve(createProbeHandler({
  env: (name) => Deno.env.get(name),
  now: Date.now,
  dns,
  tls,
  claim,
  async verify(config) {
    const client = transport(config);
    try {
      await client.verify();
    } finally {
      client.close();
    }
  },
  async send(config) {
    const client = transport(config);
    try {
      const result = await client.sendMail({
        from: { name: "Nestora Home", address: config.username },
        to: config.username,
        replyTo: config.username,
        envelope: { from: config.username, to: [config.username] },
        messageId: `<nestora-smtp-probe-${config.runId}@${
          config.username.split("@")[1]
        }>`,
        subject: "Nestora Home — SMTP Test",
        text:
          "Nestora Home SMTP compatibility test. This is a manually authorized technical test, not an order confirmation.\nاختبار تقني معتمد يدوياً لبريد نيستورا هوم. هذه الرسالة ليست تأكيد طلب.",
      });
      if (result.accepted.length !== 1 || result.rejected.length !== 0) {
        throw new Error("Not accepted");
      }
    } finally {
      client.close();
    }
  },
}));
