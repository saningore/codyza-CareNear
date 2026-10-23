export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earth = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function inSearchableArea(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  const statesAndCaribbean = latitude >= 17 && latitude <= 72 && longitude >= -180 && longitude <= -64;
  const hawaii = latitude >= 18.5 && latitude <= 22.5 && longitude >= -161 && longitude <= -154;
  const pacific = latitude >= 13 && latitude <= 21 && longitude >= 144 && longitude <= 147;
  const samoa = latitude >= -15.5 && latitude <= -13.5 && longitude >= -171.5 && longitude <= -168;
  return statesAndCaribbean || hawaii || pacific || samoa;
}

export function roundCoordinate(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}
