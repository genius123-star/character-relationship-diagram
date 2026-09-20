export function validateAvatarFile(file: Pick<File, "type" | "size">): string | undefined {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "仅支持 JPEG、PNG 或 WebP 图片";
  if (file.size > 2 * 1024 * 1024) return "头像文件不能超过 2 MB";
  return undefined;
}
