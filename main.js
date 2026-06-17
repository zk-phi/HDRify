document.getElementById("JS_file").addEventListener("input", async (e) => {
  const hdrBlob = await hdrify(e.target.files[0], 1.5, 0.9);
  const img = document.createElement("img");
  img.src = URL.createObjectURL(hdrBlob);
  document.getElementById("result").prepend(img);
});
