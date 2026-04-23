export { buildVersionPath, defineDocsVersions, getPathWithinVersion } from "./versions.js";

export function getVersionIdFromPath(pathname) {
  const [firstSegment] = String(pathname || "").replace(/^\//, "").split("/");
  return /^v\d+$/.test(firstSegment) ? firstSegment : "next";
}

export function findVersionById(versions, versionId) {
  return versions.find((version) => version.id === versionId) ?? versions[0] ?? null;
}

export function findVersionByPath(versions, pathname) {
  return findVersionById(versions, getVersionIdFromPath(pathname));
}
