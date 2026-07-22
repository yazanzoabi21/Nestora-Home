import type { SupabaseClient } from '@supabase/supabase-js';

const AVATAR_STORAGE_BUCKET = 'avatars';
const MAX_AVATAR_SIZE_BYTES = 10 * 1024 * 1024;
const AVATAR_UPLOAD_SIZE = 512;
const AVATAR_UPLOAD_QUALITY = 0.82;
const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export async function prepareAvatarImage(file: File): Promise<File> {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    throw new Error('Please select a PNG, JPG, or WebP image.');
  }
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    throw new Error('Avatar image must be 10 MB or smaller.');
  }

  return resizeAvatarImage(file);
}

export async function uploadAvatar(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please select a valid image file.');
  if (file.size > MAX_AVATAR_SIZE_BYTES) throw new Error('Avatar image must be 10 MB or smaller.');

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const filePath = `${userId}/${Date.now()}-${safeFileName}`;
  const { error } = await supabase.storage.from(AVATAR_STORAGE_BUCKET).upload(filePath, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    if (error.message.toLowerCase().includes('bucket')) {
      throw new Error('Avatar storage bucket is missing. Please create a Supabase Storage bucket named avatars.');
    }
    throw new Error(error.message);
  }

  return supabase.storage.from(AVATAR_STORAGE_BUCKET).getPublicUrl(filePath).data.publicUrl;
}

function resizeAvatarImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_UPLOAD_SIZE;
      canvas.height = AVATAR_UPLOAD_SIZE;
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('Canvas is not supported.'));

      const sourceSize = Math.min(image.width, image.height);
      context.drawImage(
        image,
        (image.width - sourceSize) / 2,
        (image.height - sourceSize) / 2,
        sourceSize,
        sourceSize,
        0,
        0,
        AVATAR_UPLOAD_SIZE,
        AVATAR_UPLOAD_SIZE,
      );
      canvas.toBlob(
        (blob) => blob
          ? resolve(new File([blob], `avatar-${Date.now()}.webp`, { type: 'image/webp' }))
          : reject(new Error('Unable to create optimized avatar.')),
        'image/webp',
        AVATAR_UPLOAD_QUALITY,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to load image.'));
    };
    image.src = objectUrl;
  });
}
