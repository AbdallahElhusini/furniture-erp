export const COLLECTION_TYPES = ["STYLE", "SET", "SPACE", "CAMPAIGN"] as const;
export type CollectionType = (typeof COLLECTION_TYPES)[number];

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_IMAGE = /^\/(?:uploads\/catalog|images)\/[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:avif|gif|jpe?g|png|webp)$/i;

export interface CollectionPublicationInput {
  type: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  descriptionAr?: string | null;
  image?: string | null;
  isDraft: boolean;
  isActive: boolean;
  activeItemCount: number;
}

export function isSafeCollectionImagePath(value: string | null | undefined): boolean {
  if (!value || value.includes("..") || value.includes("\\") || value.includes("%") || value.includes("?") || value.includes("#")) {
    return false;
  }
  return SAFE_IMAGE.test(value);
}

export function validateCollection(input: CollectionPublicationInput): string[] {
  const errors: string[] = [];
  if (!COLLECTION_TYPES.includes(input.type as CollectionType)) errors.push("نوع التشكيلة غير صالح.");
  if (input.nameAr.trim().length < 3) errors.push("الاسم العربي يجب أن يتكون من 3 أحرف على الأقل.");
  if (input.nameEn.trim().length < 3) errors.push("الاسم الإنجليزي يجب أن يتكون من 3 أحرف على الأقل.");
  if (!SAFE_SLUG.test(input.slug.trim())) errors.push("الرابط يجب أن يكون أحرفاً إنجليزية صغيرة وأرقاماً وشرطات فقط.");

  if (!input.isDraft && input.isActive) {
    if ((input.descriptionAr?.trim().length || 0) < 20) errors.push("أضف وصفاً عربياً من 20 حرفاً على الأقل قبل النشر.");
    if (!isSafeCollectionImagePath(input.image)) errors.push("أضف صورة محلية صالحة للتشكيلة قبل النشر.");
    if (input.activeItemCount < 1) errors.push("أضف منتجاً نشطاً واحداً على الأقل قبل النشر.");
  }

  return errors;
}
