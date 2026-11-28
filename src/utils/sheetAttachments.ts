import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { MeasurementSheetAttachment } from '../types';
import { generateId } from '../services/db';

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
}

const MAX_ATTACHMENT_DIM = 1500;
const ATTACHMENT_JPEG_QUALITY = 0.82;
const PREVIEW_MAX_WIDTH = 960;

function canvasToJpegDataUrl(
  sourceCanvas: HTMLCanvasElement,
  maxDim = MAX_ATTACHMENT_DIM,
  quality = ATTACHMENT_JPEG_QUALITY
): { dataUrl: string; width: number; height: number } {
  const srcW = sourceCanvas.width || 1;
  const srcH = sourceCanvas.height || 1;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) {
    return {
      dataUrl: sourceCanvas.toDataURL('image/jpeg', quality),
      width: srcW,
      height: srcH
    };
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(sourceCanvas, 0, 0, outW, outH);

  return {
    dataUrl: outCanvas.toDataURL('image/jpeg', quality),
    width: outW,
    height: outH
  };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image file.'));
    img.src = src;
  });
}

async function processImageFile(file: File): Promise<MeasurementSheetAttachment> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const srcW = img.naturalWidth || img.width || 1;
    const srcH = img.naturalHeight || img.height || 1;
    const scale = Math.min(1, MAX_ATTACHMENT_DIM / Math.max(srcW, srcH));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas is unavailable for image processing.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', ATTACHMENT_JPEG_QUALITY);
    return {
      id: generateId(),
      name: file.name || 'Image',
      sourceType: 'image',
      dataUrl,
      width,
      height
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function processPdfFile(file: File): Promise<MeasurementSheetAttachment[]> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const results: MeasurementSheetAttachment[] = [];

  try {
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      try {
        const baseViewport = page.getViewport({ scale: 1 });
        const maxSide = Math.max(baseViewport.width, baseViewport.height) || 842;
        const targetScale = Math.min(2.4, Math.max(1.2, MAX_ATTACHMENT_DIM / maxSide));
        const viewport = page.getViewport({ scale: targetScale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Browser canvas is unavailable for PDF rendering.');
        }

        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          background: '#ffffff'
        }).promise;

        const { dataUrl, width, height } = canvasToJpegDataUrl(canvas, MAX_ATTACHMENT_DIM, ATTACHMENT_JPEG_QUALITY);
        results.push({
          id: generateId(),
          name: totalPages > 1 ? `${file.name} (Page ${pageNum}/${totalPages})` : file.name,
          sourceType: 'pdf',
          dataUrl,
          width,
          height
        });
      } finally {
        page.cleanup();
      }
    }
    await pdf.cleanup();
    return results;
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

export async function processMeasurementAttachmentFiles(
  files: FileList | File[]
): Promise<MeasurementSheetAttachment[]> {
  const fileArray = Array.from(files);
  const attachments: MeasurementSheetAttachment[] = [];

  for (const file of fileArray) {
    const lowerName = (file.name || '').toLowerCase();
    const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
    const isImage =
      file.type.startsWith('image/') ||
      /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(lowerName);

    if (isPdf) {
      const pdfPages = await processPdfFile(file);
      attachments.push(...pdfPages);
    } else if (isImage) {
      const imgAttachment = await processImageFile(file);
      attachments.push(imgAttachment);
    } else {
      throw new Error(`Unsupported file "${file.name}". Please upload PDF or image files.`);
    }
  }

  return attachments;
}

export async function renderPdfArrayBufferToPreviewImages(
  pdfArrayBuffer: ArrayBuffer
): Promise<string[]> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfArrayBuffer) });
  const images: string[] = [];

  try {
    const pdf = await loadingTask.promise;
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      try {
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2.0, Math.max(1.35, PREVIEW_MAX_WIDTH / (baseViewport.width || 595)));
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context is unavailable.');
        }

        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          background: '#ffffff'
        }).promise;

        images.push(canvas.toDataURL('image/jpeg', 0.88));
      } finally {
        page.cleanup();
      }
    }
    await pdf.cleanup();
    return images;
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}
