(function () {
  function createBackgroundPdfUtils(context) {
    const { CAPTURE_QUALITY } = context;

    async function dataUrlToBlob(dataUrl) {
      const response = await fetch(dataUrl);
      return await response.blob();
    }

    function bytesToBase64(bytes) {
      let binary = '';
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      return btoa(binary);
    }

    async function blobToDataUrl(blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return `data:${blob.type || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;
    }

    async function blobToUint8Array(blob) {
      return new Uint8Array(await blob.arrayBuffer());
    }

    async function canvasToJpegBytes(canvas) {
      if (typeof canvas.convertToBlob === 'function') {
        return await blobToUint8Array(
          await canvas.convertToBlob({
            type: 'image/jpeg',
            quality: CAPTURE_QUALITY / 100,
          }),
        );
      }

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (value) => {
            if (!value) {
              reject(new Error('capture canvas export failed'));
              return;
            }

            resolve(value);
          },
          'image/jpeg',
          CAPTURE_QUALITY / 100,
        );
      });

      return await blobToUint8Array(blob);
    }

    function createCanvas(width, height) {
      if (typeof OffscreenCanvas !== 'undefined') {
        return new OffscreenCanvas(width, height);
      }

      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
      }

      throw new Error('Slides capture 用キャンバスを作成できませんでした。');
    }

    async function cropCapturedSlide(dataUrl, captureMetrics) {
      const blob = await dataUrlToBlob(dataUrl);
      const bitmap = await createImageBitmap(blob);

      try {
        const viewportWidth = Number(captureMetrics?.viewportWidth) || 0;
        const viewportHeight = Number(captureMetrics?.viewportHeight) || 0;
        const rect = captureMetrics?.rect || {};
        if (!viewportWidth || !viewportHeight) {
          throw new Error('Slides capture viewport 情報が不足しています。');
        }

        const scaleX = bitmap.width / viewportWidth;
        const scaleY = bitmap.height / viewportHeight;
        const sourceX = Math.max(
          0,
          Math.round((Number(rect.left) || 0) * scaleX),
        );
        const sourceY = Math.max(
          0,
          Math.round((Number(rect.top) || 0) * scaleY),
        );
        const sourceWidth = Math.max(
          1,
          Math.round((Number(rect.width) || 0) * scaleX),
        );
        const sourceHeight = Math.max(
          1,
          Math.round((Number(rect.height) || 0) * scaleY),
        );
        const clampedWidth = Math.min(sourceWidth, bitmap.width - sourceX);
        const clampedHeight = Math.min(sourceHeight, bitmap.height - sourceY);

        if (clampedWidth <= 0 || clampedHeight <= 0) {
          throw new Error('Slides capture 範囲が無効です。');
        }

        const canvas = createCanvas(clampedWidth, clampedHeight);
        const context2d = canvas.getContext('2d');
        if (!context2d) {
          throw new Error('Slides capture canvas context unavailable');
        }

        context2d.fillStyle = '#ffffff';
        context2d.fillRect(0, 0, clampedWidth, clampedHeight);
        context2d.drawImage(
          bitmap,
          sourceX,
          sourceY,
          clampedWidth,
          clampedHeight,
          0,
          0,
          clampedWidth,
          clampedHeight,
        );

        return {
          width: clampedWidth,
          height: clampedHeight,
          jpegBytes: await canvasToJpegBytes(canvas),
        };
      } finally {
        if (typeof bitmap.close === 'function') {
          bitmap.close();
        }
      }
    }

    function createPdfBuilder() {
      const encoder = new TextEncoder();
      const pdfWidth = 841.89;
      const pdfHeight = 595.28;
      const catalogId = 1;
      const pagesId = 2;
      const chunks = [encoder.encode('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')];
      const offsets = [0];
      const pageRefs = [];
      let pageCount = 0;
      let currentOffset = chunks[0].length;
      let nextObjectId = 3;

      function appendChunk(chunk) {
        chunks.push(chunk);
        currentOffset += chunk.length;
      }

      function appendObject(id, contentChunks) {
        offsets[id] = currentOffset;
        contentChunks.forEach(appendChunk);
      }

      function addJpegPage(page) {
        pageCount += 1;
        const imageId = nextObjectId++;
        const contentId = nextObjectId++;
        const pageId = nextObjectId++;
        const imageName = `Im${pageCount}`;
        const scale = Math.min(pdfWidth / page.width, pdfHeight / page.height);
        const drawWidth = page.width * scale;
        const drawHeight = page.height * scale;
        const offsetX = (pdfWidth - drawWidth) / 2;
        const offsetY = (pdfHeight - drawHeight) / 2;
        const contentStream = [
          'q',
          `${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${offsetX.toFixed(2)} ${offsetY.toFixed(2)} cm`,
          `/${imageName} Do`,
          'Q',
          '',
        ].join('\n');

        appendObject(imageId, [
          encoder.encode(`${imageId} 0 obj\n`),
          encoder.encode(
            `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
              `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\nstream\n`,
          ),
          page.jpegBytes,
          encoder.encode('\nendstream\nendobj\n'),
        ]);

        const contentBytes = encoder.encode(contentStream);
        appendObject(contentId, [
          encoder.encode(
            `${contentId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`,
          ),
          contentBytes,
          encoder.encode('\nendstream\nendobj\n'),
        ]);

        appendObject(pageId, [
          encoder.encode(
            `${pageId} 0 obj\n` +
              `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] ` +
              `/Resources << /XObject << /${imageName} ${imageId} 0 R >> >> ` +
              `/Contents ${contentId} 0 R >>\nendobj\n`,
          ),
        ]);
        pageRefs.push(`${pageId} 0 R`);
      }

      function finalize() {
        appendObject(pagesId, [
          encoder.encode(
            `${pagesId} 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [${pageRefs.join(' ')}] >>\nendobj\n`,
          ),
        ]);
        appendObject(catalogId, [
          encoder.encode(
            `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`,
          ),
        ]);

        const xrefOffset = currentOffset;
        const totalObjects = nextObjectId - 1;
        const xrefLines = [
          'xref',
          `0 ${totalObjects + 1}`,
          '0000000000 65535 f ',
        ];

        for (let objectId = 1; objectId <= totalObjects; objectId += 1) {
          xrefLines.push(
            `${String(offsets[objectId] || 0).padStart(10, '0')} 00000 n `,
          );
        }

        appendChunk(
          encoder.encode(
            [
              ...xrefLines,
              'trailer',
              `<< /Size ${totalObjects + 1} /Root ${catalogId} 0 R >>`,
              'startxref',
              String(xrefOffset),
              '%%EOF',
              '',
            ].join('\n'),
          ),
        );

        return new Blob(chunks, { type: 'application/pdf' });
      }

      return {
        addJpegPage,
        finalize,
        getPageCount() {
          return pageCount;
        },
      };
    }

    return {
      blobToDataUrl,
      canvasToJpegBytes,
      createCanvas,
      createPdfBuilder,
      cropCapturedSlide,
    };
  }

  globalThis.__glassmoocsCreateBackgroundPdfUtils = createBackgroundPdfUtils;
})();
