import { describe, expect, it } from "vitest";
import { createPdfFromJpeg } from "./graphImageExport";

describe("graph image export", () => {
  it("creates a real single-page PDF containing the JPEG graph", async () => {
    const pdf = createPdfFromJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 1600, 900);
    const text = await readBlobAsBinaryString(pdf);

    expect(pdf.type).toBe("application/pdf");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("/DCTDecode");
    expect(text.endsWith("%%EOF\n")).toBe(true);
  });
});

function readBlobAsBinaryString(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(blob);
  });
}
