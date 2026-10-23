import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const root = process.cwd();
const rawDir = path.join(root, "data", "raw");
const dataDir = path.join(root, "data");

const HRSA_URL =
  "https://data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites.csv";
const ZCTA_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_zcta_national.zip";
const PLACE_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip";

await mkdir(rawDir, { recursive: true });

async function download(url, destination) {
  console.log("Downloading", url);
  const response = await fetch(url, {
    headers: { "User-Agent": "CareNear/1.0 (public healthcare locator ingest)" },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed ${response.status} ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
  const info = await stat(destination);
  console.log("Saved", destination, info.size, "bytes");
  return response.headers.get("last-modified");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(current);
      current = "";
    } else if (char === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else if (char !== "\r") current += char;
  }
  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function column(header, name) {
  const index = header.indexOf(name);
  if (index < 0) throw new Error(`Missing HRSA column: ${name}`);
  return index;
}

function blank(value) {
  const text = (value ?? "").trim();
  return text ? text : null;
}

function coordinate(value) {
  if (!value || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function buildHrsa() {
  const csvPath = path.join(rawDir, "hrsa-sites.csv");
  let lastModified = null;
  try {
    const info = await stat(csvPath);
    if (info.size < 1_000_000) throw new Error("incomplete");
    lastModified = info.mtime.toUTCString();
    console.log("Using saved HRSA file", csvPath);
  } catch {
    lastModified = await download(HRSA_URL, csvPath);
  }
  const rows = parseCsv(await readFile(csvPath, "utf8"));
  const header = rows[0];
  const idx = {
    bhcmis: column(header, "BHCMIS Organization Identification Number"),
    location: column(header, "Health Center Location Identification Number"),
    name: column(header, "Site Name"),
    grantee: column(header, "Health Center Name"),
    address: column(header, "Site Address"),
    city: column(header, "Site City"),
    state: column(header, "Site State Abbreviation"),
    zip: column(header, "Site Postal Code"),
    phone: column(header, "Site Telephone Number"),
    website: column(header, "Site Web Address"),
    hours: column(header, "Operating Hours per Week"),
    setting: column(header, "Health Center Service Delivery Site Location Setting Description"),
    status: column(header, "Site Status Description"),
    npi: column(header, "FQHC Site NPI Number"),
    locationKind: column(header, "Health Center Location Type Description"),
    typeDescription: column(header, "Health Center Type Description"),
    schedule: column(header, "Health Center Operational Schedule Description"),
    calendar: column(header, "Health Center Operating Calendar"),
    program: column(header, "Health Center Type"),
    lon: column(header, "Geocoding Artifact Address Primary X Coordinate"),
    lat: column(header, "Geocoding Artifact Address Primary Y Coordinate"),
  };

  const typeCounts = new Map();
  const sites = [];
  const seen = new Set();
  for (const cells of rows.slice(1)) {
    const typeDescription = (cells[idx.typeDescription] ?? "").trim();
    const status = (cells[idx.status] ?? "").trim();
    typeCounts.set(`${status} | ${typeDescription}`, (typeCounts.get(`${status} | ${typeDescription}`) ?? 0) + 1);
    const providesCare = typeDescription === "Service Delivery Site" || typeDescription === "Administrative/Service Delivery Site";
    if (status !== "Active" || !providesCare) continue;

    const address = blank(cells[idx.address]);
    const zip = blank(cells[idx.zip]);
    const withheld = !address || !zip;
    let lat = coordinate(cells[idx.lat]);
    let lon = coordinate(cells[idx.lon]);
    if (withheld || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      lat = null;
      lon = null;
    }

    const bhcmis = blank(cells[idx.bhcmis]) ?? "unknown";
    const location = (blank(cells[idx.location]) ?? "0").replace(/[^A-Za-z0-9.-]/g, "");
    let id = `${bhcmis}-${location}`;
    if (seen.has(id)) id = `${id}-${(zip ?? "na").slice(0, 5)}`;
    seen.add(id);

    const hoursRaw = blank(cells[idx.hours]);
    const hours = hoursRaw ? String(Number(hoursRaw)) : null;

    sites.push({
      id,
      name: blank(cells[idx.name]),
      grantee: blank(cells[idx.grantee]),
      address,
      city: blank(cells[idx.city]),
      state: blank(cells[idx.state]),
      zip,
      phone: blank(cells[idx.phone]),
      website: blank(cells[idx.website]),
      lat,
      lon,
      hoursPerWeek: hours === "NaN" ? hoursRaw : hours,
      setting: blank(cells[idx.setting]),
      locationKind: blank(cells[idx.locationKind]),
      schedule: blank(cells[idx.schedule]),
      calendar: blank(cells[idx.calendar]),
      program: blank(cells[idx.program]),
      npi: blank(cells[idx.npi]),
      withheld,
    });
  }

  const payload = {
    source: "HRSA Health Center Service Delivery and Look-Alike Sites",
    publisher: "Health Resources and Services Administration",
    url: "https://data.hrsa.gov/topics/health-centers",
    downloadUrl: HRSA_URL,
    retrievedAt: new Date().toISOString(),
    fileLastModified: lastModified,
    count: sites.length,
    sites,
  };
  await writeFile(path.join(dataDir, "hrsa-sites.json"), JSON.stringify(payload));
  console.log("HRSA service delivery sites", sites.length);
  console.log("Status and type counts:");
  for (const [key, count] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${count}\t${key}`);
  }
}

function parsePipe(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const header = lines[0].split("|").map((cell) => cell.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split("|");
    const record = {};
    header.forEach((name, index) => {
      record[name] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

async function ensureZip(name, url) {
  const zipPath = path.join(rawDir, name);
  try {
    const info = await stat(zipPath);
    if (info.size > 1000) return zipPath;
  } catch {
    /* download below */
  }
  await download(url, zipPath);
  return zipPath;
}

async function buildGeography() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const zctaZip = await ensureZip("zcta.zip", ZCTA_URL);
  const placeZip = await ensureZip("places.zip", PLACE_URL);
  await execFileAsync("tar", ["-xf", zctaZip, "-C", rawDir]);
  await execFileAsync("tar", ["-xf", placeZip, "-C", rawDir]);

  const zctaRows = parsePipe(await readFile(path.join(rawDir, "2025_Gaz_zcta_national.txt"), "utf8"));
  const zcta = {};
  for (const row of zctaRows) {
    const lat = Number(row.INTPTLAT);
    const lon = Number(row.INTPTLONG);
    if (/^\d{5}$/.test(row.GEOID) && Number.isFinite(lat) && Number.isFinite(lon)) {
      zcta[row.GEOID] = [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5];
    }
  }
  await writeFile(path.join(dataDir, "zcta.json"), JSON.stringify({
    source: "U.S. Census Bureau 2025 Gazetteer ZIP Code Tabulation Areas",
    url: "https://www.census.gov/geographies/reference-files/2025/geo/gazetter-file.html",
    retrievedAt: new Date().toISOString(),
    centroids: zcta,
  }));
  console.log("ZCTA centroids", Object.keys(zcta).length);

  const placeRows = parsePipe(await readFile(path.join(rawDir, "2025_Gaz_place_national.txt"), "utf8"));
  const best = new Map();
  for (const row of placeRows) {
    if (row.FUNCSTAT === "I") continue;
    const lat = Number(row.INTPTLAT);
    const lon = Number(row.INTPTLONG);
    const sqmi = Number(row.ALAND_SQMI);
    if (!row.USPS || !row.NAME || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const base = row.NAME.replace(
      /\s+(city|town|village|cdp|borough|municipality|comunidad|zona urbana|urbanizacion|barrio-pueblo|unified government)$/i,
      "",
    ).trim();
    const key = `${row.USPS}|${base.toUpperCase()}`;
    const candidate = {
      s: row.USPS,
      n: base,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      a: Number.isFinite(sqmi) ? Math.round(sqmi * 10) / 10 : 0,
      cdp: /cdp/i.test(row.NAME) || row.LSAD === "57",
    };
    const current = best.get(key);
    if (!current || candidate.a > current.a) best.set(key, candidate);
  }
  const places = [...best.values()].sort((a, b) => a.s.localeCompare(b.s) || a.n.localeCompare(b.n));
  await writeFile(path.join(dataDir, "places.json"), JSON.stringify({
    source: "U.S. Census Bureau 2025 Gazetteer Places",
    url: "https://www.census.gov/geographies/reference-files/2025/geo/gazetter-file.html",
    retrievedAt: new Date().toISOString(),
    places,
  }));
  console.log("Places", places.length);
}

await buildGeography();
await buildHrsa();
