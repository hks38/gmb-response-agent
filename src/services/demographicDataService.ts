import { prisma } from '../db/client';
import { geocodeAddress } from '../utils/geocoding';

export interface DemographicData {
  areaName: string;
  areaType: 'zip' | 'tract' | 'custom';
  latitude: number;
  longitude: number;
  population?: number;
  householdIncome?: number;
  medianAge?: number;
  demographics?: {
    ageGroups?: { [key: string]: number };
    ethnicity?: { [key: string]: number };
    education?: { [key: string]: number };
  };
  insuranceCoverage?: {
    medicaid?: number;
    medicare?: number;
    private?: number;
    uninsured?: number;
  };
  trafficVolume?: number;
  trafficData?: {
    peakHours?: string[];
    patterns?: any;
  };
}

/**
 * Get demographic data for a location
 * Phase 1: Uses Google Places and estimates
 * Phase 2: Can integrate with US Census API
 */
export async function getDemographicData(
  businessId: string,
  location: string | { latitude: number; longitude: number },
  radiusMiles: number = 20
): Promise<DemographicData[]> {
  let center: { latitude: number; longitude: number };

  if (typeof location === 'string') {
    const geocode = await geocodeAddress(location);
    center = { latitude: geocode.latitude, longitude: geocode.longitude };
  } else {
    center = location;
  }

  // Check if we have cached data (within 90 days)
  const existing = await prisma.demographicData.findMany({
    where: {
      businessId,
      createdAt: {
        gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days
      },
    },
  });

  if (existing.length > 0) {
    return existing.map(d => ({
      areaName: d.areaName,
      areaType: d.areaType as any,
      latitude: d.latitude,
      longitude: d.longitude,
      population: d.population || undefined,
      householdIncome: d.householdIncome || undefined,
      medianAge: d.medianAge || undefined,
      demographics: d.demographicsJson ? JSON.parse(d.demographicsJson) : undefined,
      insuranceCoverage: d.insuranceCoverageJson ? JSON.parse(d.insuranceCoverageJson) : undefined,
      trafficVolume: d.trafficVolume || undefined,
      trafficData: d.trafficDataJson ? JSON.parse(d.trafficDataJson) : undefined,
    }));
  }

  // For Phase 1, create estimated demographic data based on location
  // In Phase 2, this would fetch from Census API or other sources
  // Create multiple data points in a grid pattern for better heatmap visualization
  const gridSize = 3; // 3x3 grid
  const gridSpacing = radiusMiles / gridSize;
  const estimatedDataPoints: DemographicData[] = [];
  
  // Generate grid of demographic data points
  for (let i = -gridSize; i <= gridSize; i++) {
    for (let j = -gridSize; j <= gridSize; j++) {
      const latOffset = (i * gridSpacing) / 69; // Approximate miles to degrees
      const lngOffset = (j * gridSpacing) / (69 * Math.cos(center.latitude * Math.PI / 180));
      
      // Add some variation to make it more realistic
      const variation = 0.1 + Math.random() * 0.2; // 10-30% variation
      
      estimatedDataPoints.push({
        areaName: `Area ${i + gridSize + 1},${j + gridSize + 1}`,
        areaType: 'custom',
        latitude: center.latitude + latOffset,
        longitude: center.longitude + lngOffset,
        // Estimated values with variation (ensure population is always > 0)
        population: Math.max(1000, Math.round(50000 * variation)),
        householdIncome: Math.max(30000, Math.round(75000 * (0.8 + variation * 0.4))),
        medianAge: 42 + (Math.random() - 0.5) * 10,
        demographics: {
          ageGroups: {
            '0-17': 20,
            '18-34': 25,
            '35-54': 30,
            '55-64': 15,
            '65+': 10,
          },
        },
        insuranceCoverage: {
          private: 70,
          medicare: 15,
          medicaid: 10,
          uninsured: 5,
        },
      });
    }
  }
  
  // Save all data points
  for (const data of estimatedDataPoints) {
    await prisma.demographicData.upsert({
      where: {
        businessId_areaName_areaType: {
          businessId,
          areaName: data.areaName,
          areaType: data.areaType,
        },
      },
      create: {
        businessId,
        areaName: data.areaName,
        areaType: data.areaType,
        latitude: data.latitude,
        longitude: data.longitude,
        population: data.population,
        householdIncome: data.householdIncome,
        medianAge: data.medianAge,
        demographicsJson: data.demographics ? JSON.stringify(data.demographics) : null,
        insuranceCoverageJson: data.insuranceCoverage ? JSON.stringify(data.insuranceCoverage) : null,
      },
      update: {
        population: data.population,
        householdIncome: data.householdIncome,
        medianAge: data.medianAge,
        demographicsJson: data.demographics ? JSON.stringify(data.demographics) : null,
        insuranceCoverageJson: data.insuranceCoverage ? JSON.stringify(data.insuranceCoverage) : null,
        updatedAt: new Date(),
      },
    });
  }
  
  // Return the data points
  return estimatedDataPoints;
}

/**
 * Get income data for an area
 * Phase 1: Returns estimated data
 * Phase 2: Integrate with Census API
 */
export async function getIncomeData(
  location: string | { latitude: number; longitude: number }
): Promise<number | null> {
  // Phase 1: Return estimated value
  // Phase 2: Fetch from Census API based on ZIP code
  return 75000; // Placeholder
}

/**
 * Get population data for an area
 */
export async function getPopulationData(
  location: string | { latitude: number; longitude: number }
): Promise<number | null> {
  // Phase 1: Return estimated value
  // Phase 2: Fetch from Census API
  return 50000; // Placeholder
}

/**
 * Get age demographics for an area
 */
export async function getAgeDemographics(
  location: string | { latitude: number; longitude: number }
): Promise<{ [key: string]: number } | null> {
  // Phase 1: Return estimated distribution
  // Phase 2: Fetch from Census API
  return {
    '0-17': 20,
    '18-34': 25,
    '35-54': 30,
    '55-64': 15,
    '65+': 10,
  };
}

/**
 * Aggregate demographics from multiple sources
 */
export async function aggregateDemographics(
  businessId: string,
  area: string
): Promise<DemographicData | null> {
  const data = await prisma.demographicData.findFirst({
    where: {
      businessId,
      areaName: area,
    },
  });

  if (!data) return null;

  return {
    areaName: data.areaName,
    areaType: data.areaType as any,
    latitude: data.latitude,
    longitude: data.longitude,
    population: data.population || undefined,
    householdIncome: data.householdIncome || undefined,
    medianAge: data.medianAge || undefined,
    demographics: data.demographicsJson ? JSON.parse(data.demographicsJson) : undefined,
    insuranceCoverage: data.insuranceCoverageJson ? JSON.parse(data.insuranceCoverageJson) : undefined,
    trafficVolume: data.trafficVolume || undefined,
    trafficData: data.trafficDataJson ? JSON.parse(data.trafficDataJson) : undefined,
  };
}

