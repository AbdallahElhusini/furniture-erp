import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import {
  MAX_PRODUCT_MULTIPART_BYTES,
  MAX_PRODUCT_UPLOAD_BYTES,
  detectProductUpload,
} from "@/lib/upload-security";

export async function POST(request: NextRequest) {
  const unauthorized = requireApiSession(request);
  if (unauthorized) return unauthorized;

  try {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PRODUCT_MULTIPART_BYTES) {
      return NextResponse.json({ error: "File exceeds the 32 MB upload limit" }, { status: 413 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid multipart upload" }, { status: 400 });
    }
    const candidate = formData.get("file");
    if (!(candidate instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (candidate.size <= 0 || candidate.size > MAX_PRODUCT_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File must be between 1 byte and 32 MB" }, { status: 413 });
    }

    const buffer = Buffer.from(await candidate.arrayBuffer());
    const detected = detectProductUpload(buffer);
    if (!detected) {
      return NextResponse.json(
        { error: "Unsupported or invalid image/video file" },
        { status: 415 },
      );
    }

    const uniqueName = crypto.randomBytes(16).toString("hex") + detected.extension;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "catalog");
    await mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, uniqueName);
    await writeFile(filePath, buffer, { flag: "wx" });

    const publicUrl = `/uploads/catalog/${uniqueName}`;
    return NextResponse.json({
      success: true,
      url: publicUrl,
      kind: detected.kind,
      mimeType: detected.mimeType,
    });
  } catch (error) {
    console.error("Upload failed", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
