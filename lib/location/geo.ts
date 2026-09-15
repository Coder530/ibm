const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Great-circle distance between two lat/lng points, in metres. */
export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_METERS * c;
}

/** Initial compass bearing from point a to point b, in degrees [0, 360). */
export function bearingDegrees(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const dLng = toRadians(bLng - aLng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const bearing = toDegrees(Math.atan2(y, x));
  return (bearing + 360) % 360;
}
