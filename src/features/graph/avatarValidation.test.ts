import { describe, expect, it } from "vitest";
import { validateAvatarFile } from "./avatarValidation";

describe("validateAvatarFile", () => {
  it("accepts supported images up to 2 MB", () => {
    expect(validateAvatarFile({ type: "image/png", size: 2 * 1024 * 1024 })).toBeUndefined();
  });

  it("rejects unsupported formats and oversized files", () => {
    expect(validateAvatarFile({ type: "image/gif", size: 100 })).toContain("JPEG");
    expect(validateAvatarFile({ type: "image/webp", size: 2 * 1024 * 1024 + 1 })).toContain("2 MB");
  });
});
