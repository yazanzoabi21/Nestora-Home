import { type Job, UUID } from "./model.ts";

export type ImageRead = (path: string, signal: AbortSignal) => Promise<unknown>;

/** Embed only public, trusted image URLs. Never emit signed links or credentials. */
export function publicImageUrl(
  value: unknown,
  site: string,
  project: string,
): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password || url.search ||
      url.hash
    ) return null;
    const publicStorage = url.origin === new URL(project).origin &&
      url.pathname.startsWith("/storage/v1/object/public/");
    const siteAsset = url.origin === new URL(site).origin &&
      /^\/(images|assets)\//.test(url.pathname);
    return publicStorage || siteAsset ? url.href : null;
  } catch {
    return null;
  }
}

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("INVALID_IMAGE_ROWS");
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("INVALID_IMAGE_ROW");
    }
    return row as Record<string, unknown>;
  });
}

/** Optional decoration only: failure/timeout must never reject an otherwise valid email. */
export async function withProductImages(
  job: Job,
  read: ImageRead,
  site: string,
  project: string,
): Promise<Job> {
  if (
    job.kind === "customer" && !job.snapshot.recipientVerified && !job.sandbox
  ) return job;
  try {
    const signal = AbortSignal.timeout(2500);
    // Snapshot SQL orders its items by id too. Refuse positional mapping if the set changed.
    const query = new URLSearchParams({
      order_id: `eq.${job.orderId}`,
      select: "id,product_id,variant_image_url",
      order: "id.asc",
      limit: "100",
    });
    const saved = rows(await read(`/rest/v1/order_items?${query}`, signal));
    if (saved.length !== job.snapshot.items.length) return job;
    const images = saved.map((row) =>
      publicImageUrl(row["variant_image_url"], site, project)
    );
    const ids = [
      ...new Set(
        saved.filter((_, i) => !images[i]).map((row) => row["product_id"])
          .filter((id): id is string =>
            typeof id === "string" && UUID.test(id)
          ),
      ),
    ];
    const products = new Map<string, string | null>();
    if (ids.length) {
      try {
        const productQuery = new URLSearchParams({
          id: `in.(${ids.join(",")})`,
          select: "id,image_url",
          limit: "100",
        });
        for (
          const row of rows(
            await read(`/rest/v1/products?${productQuery}`, signal),
          )
        ) {
          if (typeof row["id"] === "string") {
            products.set(
              row["id"],
              publicImageUrl(row["image_url"], site, project),
            );
          }
        }
      } catch {
        /* Keep saved variant images when the optional catalog lookup is unavailable. */
      }
    }
    return {
      ...job,
      snapshot: {
        ...job.snapshot,
        items: job.snapshot.items.map((item, i) => ({
          ...item,
          imageUrl: images[i] ?? products.get(String(saved[i]["product_id"])) ??
            null,
        })),
      },
    };
  } catch {
    return job;
  }
}
