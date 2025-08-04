import {
  getAllRegionCodes,
  getRegionDataByCode,
  isValidRegionCode,
} from "./regions-data";

export type Region = string;

export function getRegionCode(region: Region): string {
  // Validate region code and return it if valid, otherwise return default
  if (isValidRegionCode(region)) {
    return region;
  }
  return "US"; // Default fallback
}

export function getRegionName(region: Region): string {
  const regionData = getRegionDataByCode(region);
  if (regionData) {
    return regionData.name;
  }
  return "United States"; // Default fallback
}

export function getAllValidRegions(): string[] {
  return getAllRegionCodes();
}

export function isValidRegion(region: string): boolean {
  return isValidRegionCode(region);
}
