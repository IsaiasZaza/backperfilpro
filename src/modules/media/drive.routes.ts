import { Router } from "express";
import { notFound } from "../../lib/errors";
import { extractGoogleDriveFileId, isGoogleDriveFileId } from "../../lib/sanitize";

const FILE_ID_PARAM = /^[a-zA-Z0-9_-]{20,128}$/;

function driveSources(fileId: string) {
  return [
    `https://lh3.googleusercontent.com/d/${fileId}=w2000`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`,
    `https://drive.google.com/uc?export=download&id=${fileId}`,
  ];
}

async function fetchDriveImage(fileId: string) {
  for (const url of driveSources(fileId)) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "PerfilPro/1.0" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) continue;

      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType,
      };
    } catch {
      continue;
    }
  }
  return null;
}

/** GET /media/drive/:fileId — JPEG/PNG do Drive, sem o front bater no Google. */
export const driveMediaRoutes = Router();

driveMediaRoutes.get("/:fileId", async (req, res) => {
  const raw = String(req.params.fileId ?? "");
  const fileId = FILE_ID_PARAM.test(raw) ? raw : extractGoogleDriveFileId(raw);
  if (!fileId || !isGoogleDriveFileId(fileId)) {
    throw notFound("Imagem nao encontrada", "IMAGE_NOT_FOUND");
  }

  const image = await fetchDriveImage(fileId);
  if (!image) {
    throw notFound("Imagem do Google Drive nao encontrada ou sem acesso publico", "IMAGE_NOT_FOUND");
  }

  res.setHeader("Content-Type", image.contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  return res.send(image.buffer);
});
