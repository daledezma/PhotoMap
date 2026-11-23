// PhotoMap front end: MetaMask + ethers.js + Leaflet/OpenStreetMap
let contract, account;
const SCALE = 1_000_000; // contract stores lat/lng as degrees x 1,000,000

const $ = (id) => document.getElementById(id);
const status = (msg, type = "secondary") => {
  $("status").className = `alert alert-${type} small`;
  $("status").textContent = msg;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const short = (addr) => addr.slice(0, 6) + "…" + addr.slice(-4);
const toDeg = (v) => (Number(v) / SCALE).toFixed(6);

// ---------- Map (Leaflet + OpenStreetMap) ----------
const map = L.map("map").setView([41.8781, -87.6298], 11); // Chicago
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const photoLayer = L.layerGroup().addTo(map);
const markers = {};   // photo id -> Leaflet marker
let pickMarker;       // the "new photo goes here" marker

// Click the map (or drag the marker) to set the location field
function setPick(lat, lng) {
  $("location").value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  if (!pickMarker) {
    pickMarker = L.marker([lat, lng], { draggable: true, opacity: 0.75 }).addTo(map)
      .bindTooltip("New photo goes here", { direction: "top", offset: [0, -30] });
    pickMarker.on("dragend", () => { const p = pickMarker.getLatLng(); setPick(p.lat, p.lng); });
  } else {
    pickMarker.setLatLng([lat, lng]);
  }
}
map.on("click", (e) => setPick(e.latlng.lat, e.latlng.lng));

// Typing coordinates moves the marker too
$("location").addEventListener("change", () => {
  const ll = parseLocation($("location").value);
  if (ll) { setPick(ll.lat, ll.lng); map.panTo([ll.lat, ll.lng]); }
});

$("myLocationBtn").onclick = () => {
  if (!navigator.geolocation) return status("Your browser doesn't support geolocation.", "warning");
  navigator.geolocation.getCurrentPosition(
    (pos) => { setPick(pos.coords.latitude, pos.coords.longitude); map.setView([pos.coords.latitude, pos.coords.longitude], 14); },
    () => status("Couldn't get your location. Click the map instead.", "warning")
  );
};

function parseLocation(text) {
  const parts = text.split(",").map((s) => parseFloat(s.trim()));
  if (parts.length !== 2 || parts.some(isNaN)) return null;
  const [lat, lng] = parts;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// ---------- Photo thumbnails ----------
// Prototype: thumbnails are kept in this browser (localStorage) keyed by hash.
// Final version: load the image from an IPFS gateway using the CID.
const thumbKey = (hash) => "photomap:" + hash;
const getThumb = (hash) => { try { return localStorage.getItem(thumbKey(hash)); } catch { return null; } };
function saveThumb(hash, dataUrl) { try { localStorage.setItem(thumbKey(hash), dataUrl); } catch { /* storage full or blocked */ } }

function makeThumb(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const max = 400, ratio = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * ratio; c.height = img.height * ratio;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.src = URL.createObjectURL(file);
  });
}

// ---------- Contract ----------
async function connect() {
  if (!window.ethereum) return status("MetaMask not found. Install the browser extension.", "danger");

  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  account = await signer.getAddress();
  $("account").textContent = short(account);

  // ABI + address come from Truffle's build output (written by `migrate`)
  const artifact = await (await fetch("../build/contracts/PhotoMap.json", { cache: "no-store" })).json();
  const networkId = await provider.send("net_version", []);
  const deployed = artifact.networks[networkId];
  if (!deployed) return status(`PhotoMap is not deployed on network ${networkId}. Run migrate and check MetaMask's network.`, "warning");

  if (contract) contract.removeAllListeners();
  contract = new ethers.Contract(deployed.address, artifact.abi, signer);
  status(`Connected to PhotoMap at ${deployed.address}`, "success");

  // Live updates: refresh when anyone adds or likes a photo
  contract.on("PhotoAdded", () => loadPhotos());
  contract.on("PhotoLiked", () => loadPhotos());

  await loadPhotos(true);
}

// Read every photo with ONE call: getPhotos()  (view call, no gas)
async function loadPhotos(fitMap = false) {
  const photos = await contract.getPhotos();
  $("count").textContent = photos.length;

  photoLayer.clearLayers();
  for (const k in markers) delete markers[k];
  const list = $("photoList");
  list.innerHTML = photos.length ? "" : '<li class="list-group-item text-muted">No photos yet. Click the map to pick a spot.</li>';

  const liked = await Promise.all(photos.map((_, i) => contract.hasLiked(i, account)));

  photos.forEach((p, i) => {
    const lat = Number(p.lat) / SCALE, lng = Number(p.lng) / SCALE;
    const thumb = getThumb(p.ipfsHash);
    const isMine = p.owner.toLowerCase() === account.toLowerCase();

    // Map marker + popup
    const popup = document.createElement("div");
    popup.className = "photo-popup";
    popup.innerHTML = `
      ${thumb ? `<img src="${thumb}" alt="Photo #${i}">` : `<div class="placeholder-img">Image on IPFS</div>`}
      <div class="mt-2 fw-semibold">Photo #${i}</div>
      <div class="small text-muted">${toDeg(p.lat)}, ${toDeg(p.lng)}</div>
      <div class="small text-muted">Owner ${esc(short(p.owner))}${isMine ? " (you)" : ""}</div>
      <button class="btn btn-sm mt-2 w-100 ${liked[i] ? "btn-danger" : "btn-outline-danger"}" ${liked[i] ? "disabled" : ""}>
        ♥ ${p.likes} ${liked[i] ? "· Liked" : "· Like"}
      </button>`;
    popup.querySelector("button").onclick = () => likePhoto(i);
    markers[i] = L.marker([lat, lng]).addTo(photoLayer).bindPopup(popup);

    // List item
    const li = document.createElement("li");
    li.className = "list-group-item d-flex justify-content-between align-items-center";
    li.innerHTML = `
      <div class="d-flex align-items-center">
        ${thumb ? `<img src="${thumb}" class="rounded me-3" style="width:48px;height:48px;object-fit:cover" alt="">`
                : `<div class="rounded me-3 bg-secondary-subtle" style="width:48px;height:48px"></div>`}
        <div>
          <div class="fw-semibold">#${i} · ${toDeg(p.lat)}, ${toDeg(p.lng)}</div>
          <div class="small text-muted text-truncate" style="max-width:260px">${esc(p.ipfsHash)} · ${esc(short(p.owner))}</div>
        </div>
      </div>
      <button class="btn btn-sm ${liked[i] ? "btn-danger" : "btn-outline-danger"}" ${liked[i] ? "disabled" : ""}>♥ ${p.likes}</button>`;
    li.onclick = () => { map.flyTo([lat, lng], 15); markers[i].openPopup(); };
    li.querySelector("button").onclick = (e) => { e.stopPropagation(); likePhoto(i); };
    list.appendChild(li);
  });

  if (fitMap && photos.length) {
    map.fitBounds(L.featureGroup(Object.values(markers)).getBounds().pad(0.3), { maxZoom: 14 });
  }
}

// Write: addPhoto(ipfsHash, lat, lng)  (transaction, MetaMask confirms)
async function addPhoto(e) {
  e.preventDefault();
  if (!contract) return status("Connect MetaMask first.", "warning");
  const ll = parseLocation($("location").value);
  if (!ll) return status("Pick a location on the map (or enter lat, lng).", "warning");

  try {
    status("Confirm the transaction in MetaMask…", "info");
    const tx = await contract.addPhoto(
      $("ipfsHash").value.trim(),
      Math.round(ll.lat * SCALE),
      Math.round(ll.lng * SCALE)
    );
    await tx.wait();
    status(`Photo pinned. Tx: ${tx.hash}`, "success");
    e.target.reset();
    resetDrop();
    if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; }
    await loadPhotos();
  } catch (err) {
    status(errorMessage(err), "danger");
  }
}

// Write: likePhoto(id)
async function likePhoto(id) {
  try {
    status("Confirm the like in MetaMask…", "info");
    const tx = await contract.likePhoto(id);
    await tx.wait();
    status(`Liked photo #${id}. Tx: ${tx.hash}`, "success");
    await loadPhotos();
    markers[id]?.openPopup();
  } catch (err) {
    status(errorMessage(err), "danger");
  }
}

// Turn custom errors (AlreadyLiked, etc.) into readable messages.
// Ganache/MetaMask bury the revert data in different places, so search the whole error for it.
function findRevertData(obj, depth = 0) {
  if (!obj || depth > 6) return null;
  if (typeof obj === "string") return /^0x[0-9a-fA-F]{8}/.test(obj) ? obj : null;
  if (typeof obj !== "object") return null;
  for (const key of ["data", "result", "error", "info", "revert"]) {
    const found = findRevertData(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function errorMessage(err) {
  const messages = {
    AlreadyLiked: "You already liked this photo.",
    PhotoDoesNotExist: "That photo doesn't exist.",
    InvalidLocation: "That location is out of range.",
  };
  let name = err.revert?.name;
  if (!name && contract) {
    const data = findRevertData(err);
    try { name = data && contract.interface.parseError(data)?.name; } catch { /* not one of ours */ }
  }
  if (err.code === "ACTION_REJECTED") return "Transaction cancelled in MetaMask.";
  return messages[name] || err.shortMessage || err.message;
}

// ---------- Drag-and-drop photo upload ----------
// Prototype: hashes the file locally (keccak256) as a stand-in for the IPFS CID.
// Final version: upload to IPFS (e.g. Pinata) and use the CID it returns.
const dropZone = $("dropZone"), fileInput = $("fileInput");

async function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) return status("Please choose an image file.", "warning");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = ethers.keccak256(bytes);
  const thumb = await makeThumb(file);
  saveThumb(hash, thumb);
  $("ipfsHash").value = hash;
  $("preview").src = thumb;
  $("preview").classList.remove("d-none");
  $("dropText").innerHTML = `<span class="small">${esc(file.name)} · ${(file.size / 1024).toFixed(0)} KB</span>`;
}

function resetDrop() {
  $("preview").classList.add("d-none");
  $("dropText").innerHTML = 'Drag &amp; drop a photo here<br><span class="small">or click to choose a file</span>';
}

dropZone.onclick = () => fileInput.click();
fileInput.onchange = () => handleFile(fileInput.files[0]);
["dragenter", "dragover"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("bg-primary-subtle"); }));
["dragleave", "drop"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("bg-primary-subtle"); }));
dropZone.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));

$("connectBtn").onclick = connect;
$("addForm").onsubmit = addPhoto;
if (window.ethereum) window.ethereum.on("accountsChanged", connect);

