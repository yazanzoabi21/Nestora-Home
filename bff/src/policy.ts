import { HttpError, jsonBody } from './security.js';
import type { Audience } from './supabase.js';

// Explicit application surface. Unknown tables/RPCs/schemas fail closed.
export const publicTables = new Set([
  'products', 'product_variants', 'categories', 'product_videos', 'promotions', 'promotion_products',
  'discounts', 'discount_gift_products', 'shipping_methods', 'shipping_method_zones', 'delivery_zones',
  'payment_methods', 'loyalty_program_settings', 'customer_content_pages', 'customer_faqs', 'customer_offers',
]);
const customerTables = new Set([...publicTables, 'profiles', 'customers', 'orders', 'order_items',
  'carts', 'cart_items', 'wishlist', 'customer_addresses', 'reviews', 'customer_product_history',
  'customer_notification_preferences', 'customer_contact_messages', 'customer_loyalty_points_ledger', 'customer_offers']);
const adminTables = new Set([...customerTables, 'notifications', 'analytics', 'inventory_logs',
  'media_assets', 'media_usages', 'order_shipping_addresses', 'payment_transactions', 'customer_offers']);
const customerWrites = new Set(['profiles', 'carts', 'cart_items', 'wishlist', 'customer_addresses',
  'customer_notification_preferences', 'customer_contact_messages']);
export const publicRpcs = new Set(['get_public_product_reviews', 'search_customer_site',
  'search_products_by_image', 'get_customer_image_search_index_count']);
const customerRpcs = new Set([...publicRpcs, 'place_customer_order', 'record_product_view', 'replace_cart_free_gifts',
  'get_my_loyalty_balance', 'get_my_loyalty_points_history', 'get_my_redeemable_loyalty_products',
  'can_current_customer_use_discount', 'submit_product_review', 'edit_own_product_review']);
const adminRpcs = new Set(['refresh_dashboard_statistics', 'refresh_analytics', 'replace_promotion_products',
  'replace_product_variants', 'get_product_image_embedding_status', 'upsert_product_image_embedding',
  'delete_product_image_embedding', 'update_admin_order_status', 'remove_admin_order_item',
  'update_inventory_stock', 'replace_discount_gift_products', 'submit_product_review', 'edit_own_product_review']);
export const storageBuckets = new Set(['avatars', 'product-images', 'promotion-images', 'product-videos', 'media-library']);
export const publicRealtimeTables = new Set(['products', 'product_variants', 'categories', 'product_videos', 'loyalty_program_settings']);

export interface DataRoute { path: string; resource: string; kind: 'table' | 'rpc' | 'storage'; publicAccess: boolean }
export function dataRoute(audience: Audience, rawPath: string, method: string): DataRoute {
  if (!['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method) || rawPath.includes('%') || rawPath.includes('..') || rawPath.includes('\\')) {
    throw new HttpError(400, 'INVALID_PATH');
  }
  const rpc = /^rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/.exec(rawPath);
  if (rpc?.[1]) {
    if (!(audience === 'admin' ? adminRpcs : customerRpcs).has(rpc[1]) || !['GET', 'POST', 'HEAD'].includes(method)) throw new HttpError(403, 'ROUTE_NOT_ALLOWED');
    if (method !== 'POST' && !publicRpcs.has(rpc[1])) throw new HttpError(403, 'ROUTE_NOT_ALLOWED');
    return { path: rawPath, resource: rpc[1], kind: 'rpc', publicAccess: audience === 'customer' && (publicRpcs.has(rpc[1]) || rpc[1] === 'place_customer_order') };
  }
  const table = /^rest\/v1\/([a-z_][a-z0-9_]*)$/.exec(rawPath);
  if (table?.[1]) {
    if (!(audience === 'admin' ? adminTables : customerTables).has(table[1])) throw new HttpError(403, 'ROUTE_NOT_ALLOWED');
    const read = ['GET', 'HEAD'].includes(method);
    if (audience === 'customer' && !read && !customerWrites.has(table[1])) throw new HttpError(403, 'ROUTE_NOT_ALLOWED');
    return { path: rawPath, resource: table[1], kind: 'table', publicAccess: audience === 'customer' &&
      ((read && publicTables.has(table[1])) || (method === 'POST' && table[1] === 'customer_contact_messages')) };
  }
  const object = /^storage\/v1\/object\/(?:public\/)?([a-zA-Z0-9_-]+)(?:\/.*)?$/.exec(rawPath);
  if (object?.[1] && storageBuckets.has(object[1])) {
    return { path: rawPath, resource: object[1], kind: 'storage', publicAccess: false };
  }
  throw new HttpError(403, 'ROUTE_NOT_ALLOWED');
}

export function checkProfileMutation(body: unknown, audience: Audience, userId: string, query: URLSearchParams): void {
  const allowed = audience === 'admin'
    ? ['full_name', 'email', 'phone', 'avatar_media_id', 'avatar_url']
    : ['full_name', 'phone', 'birthday', 'avatar_media_id', 'avatar_url'];
  if (query.get('id') !== `eq.${userId}` || query.getAll('id').length !== 1 ||
    [...query.keys()].some((key) => !['id', 'select'].includes(key)) ||
    Object.keys(jsonBody(body)).some((key) => !allowed.includes(key))) throw new HttpError(403, 'PROFILE_FIELDS_RESTRICTED');
}
