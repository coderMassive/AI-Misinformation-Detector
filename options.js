const fields = ["key", "openrouterKey", "model", "tavilyKey"];

browser.storage.local.get(fields).then((d) => {
  fields.forEach((f) => {
    if (d[f]) document.getElementById(f).value = d[f];
  });
});

document.getElementById("save").addEventListener("click", async () => {
  const values = {};
  fields.forEach((f) => { values[f] = document.getElementById(f).value.trim(); });
  await browser.storage.local.set(values);
  document.getElementById("status").textContent = "Saved";
});