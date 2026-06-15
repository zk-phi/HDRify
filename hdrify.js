/* HDRify an image by infusing the 2020_profile.icc
 * https://sharpletters.net/2025/04/16/hdr-emoji/ */

/* Convert input file to a PNG image */

const loadFileAsBlobURL = (file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => resolve(e.target.result);
  reader.readAsDataURL(file);
});

const urlToImg = async (url) => (
  new Promise((resolve) => {
    const img = document.createElement("img");
    img.src = url;
    img.onload = () => resolve(img);
  })
);

const fileToImg = async (file) => (
  await urlToImg(await loadFileAsBlobURL(file))
);

const canvasToPng = (canvas) => new Promise((resolve) => (
  canvas.toBlob(resolve, 'image/png')
));

const convertFileToPng = async (file) => {
  const img = await fileToImg(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  return await canvasToPng(canvas);
}

/* ---- */

/* Simple CRC32 implementation
 * https://note.com/zerogram0g/n/n6601c7fd0224 */

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let r = i;
  for (let j = 0; j < 8; j++) {
    r = (r & 1) ? (0xedb88320 ^ (r >>> 1)) : (r >>> 1);
  }
  CRC32_TABLE[i] = r >>> 0;
}

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const o of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ o) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/* ---- */

/* Deflate */

const deflateBinary = async (binary) => {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  writer.write(binary);
  writer.close();
  /* https://qiita.com/kerupani129/items/9a7ea8b2e1ca82301c87 */
  const buf = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buf);
};

/* ---- */

/* Binary helpers */

/* Unpack an u32 integer to big-endian 4B binary
 * 0x12345678 => [0x12, 0x34, 0x56, 0x78] */
const encodeU32 = (n) => ([
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
]);

/* Pack 4B big-endian binary into an u32 integer
 * [0x12, 0x34, 0x56, 0x78] => 0x12345678 */
const decodeU32 = (arr, ix) => (
  (arr[ix] << 24) |
  (arr[ix + 1] << 16) |
  (arr[ix + 2] << 8) |
  arr[ix + 3]
);

const concatBinaries = (arrays) => {
  const totalLength = arrays.reduce((l, r) => l + r.length, 0);
  const arr = new Uint8Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    arr.set(array, offset);
    offset += array.length;
  }
  return arr;
}

/* ---- */

/* iCCP Chunk https://www.setsuki.com/hsp/ext/chunk/iCCP.htm */

const getIcc = async () => {
  const response = await fetch('./2020_profile.icc');
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
};

const makeIccpChunk = async () => {
  const compressedIcc = await deflateBinary(await getIcc());
  const nameBinary = new TextEncoder().encode('BT.2020');
  const dataBinary = concatBinaries([nameBinary, [0x00, 0x00], compressedIcc]);
  const dataLengthBinary = encodeU32(dataBinary.length);
  const chunkTypeBinary = new TextEncoder().encode('iCCP');
  const chunkBodyBinary = concatBinaries([chunkTypeBinary, dataBinary]);
  const crcBinary = encodeU32(crc32(chunkBodyBinary));
  const chunk = concatBinaries([dataLengthBinary, chunkBodyBinary, crcBinary]);
  return chunk;
};

const iccpChunk = makeIccpChunk();

/* ---- */

/* Infuse the iCCP chunk into a png image
 * https://sharpletters.net/2025/04/16/hdr-emoji/ */

async function hdrify (pngBlob) {
  const pngBinary = new Uint8Array(await pngBlob.arrayBuffer());

  const chunks = [
    pngBinary.subarray(0, 8), /* PNG signature */
  ];

  /* Parse and pick PNG chunks
   * https://www.w3.org/TR/png-3/#5Chunk-layout */
  for (let ix = 8, chunkLen; ix < pngBinary.length; ix += chunkLen) {
    const chunkBodyLen = decodeU32(pngBinary, ix);
    chunkLen = 4 + 4 + chunkBodyLen + 4;

    const chunkType = String.fromCharCode(
      pngBinary[ix + 4],
      pngBinary[ix + 5],
      pngBinary[ix + 6],
      pngBinary[ix + 7],
    );

    /* Drop the sRGB chunk that conflict with our iCCP chunk
     * https://qiita.com/mikecat_mixc/items/0fb6a2a8e80263421253 */
    if (chunkType !== 'sRGB') {
      const chunk = pngBinary.subarray(ix, ix + chunkLen);
      chunks.push(chunk);
    }

    if (chunkType === 'IHDR') {
      chunks.push(await iccpChunk);
    }

    if (chunkType === 'IEND') break;
  }

  const injectedPngBinary = concatBinaries(chunks);
  return new Blob([injectedPngBinary], { type: 'image/png' });
}
