import {
  getAllRegionCodes,
  getRegionDataByCode,
  isValidRegionCode,
} from "./regions-data";

export type Region = string;

/** What an unrecognised region collapses to – see `settings.ts`. */
const DEFAULT_REGION_CODE = "US";

export function getRegionCode(region: Region): string {
  // Validate region code and return it if valid, otherwise return default
  if (isValidRegionCode(region)) {
    return region;
  }
  return DEFAULT_REGION_CODE;
}

export function getRegionName(region: Region): string {
  // Resolved through the data rather than from a literal of its own. The two
  // disagreed: an unknown code answered "United States" while "US" itself
  // answered "United States of America", so the selector named a different
  // country depending on how it got there.
  const regionData =
    getRegionDataByCode(region) ?? getRegionDataByCode(DEFAULT_REGION_CODE);

  return regionData?.name ?? DEFAULT_REGION_CODE;
}

export function getAllValidRegions(): string[] {
  return getAllRegionCodes();
}

export function isValidRegion(region: string): boolean {
  return isValidRegionCode(region);
}
