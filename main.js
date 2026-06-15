document.getElementById("JS_file").addEventListener("input", async (e) => {
  const pngBlob = await convertFileToPng(e.target.files[0]);
  const infusedPngBlob = await hdrify(pngBlob);
  const img = document.createElement("img");
  img.src = URL.createObjectURL(infusedPngBlob);
  document.getElementById("result").prepend(img);
});
