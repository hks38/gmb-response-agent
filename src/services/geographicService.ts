import { prisma } from '../db/client';
import { geocodeAddress, findNearbyPlaces, getLocationGeocode, GeocodeResult } from '../utils/geocoding';
import { calculateDistance, isWithinRadius } from '../utils/distance';

export interface PracticeLocation {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
}

export interface AreaData {
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  distanceMiles: number;
  geocode: string;
}

/**
 * Create or update a practice location
 */
export async function createOrUpdatePractice(
  businessId: string,
  name: string,
  address: string,
  radiusMiles: number = 20
): Promise<{ id: string; location: PracticeLocation }> {
  // Geocode the address
  const geocodeResult = await geocodeAddress(address);
  
  // Check if practice already exists for this business
  const existing = await prisma.practice.findFirst({
    where: {
      businessId,
      name,
      address,
    },
  });

  if (existing) {
    // Update existing practice
    const updated = await prisma.practice.update({
      where: { id: existing.id },
      data: {
        latitude: geocodeResult.latitude,
        longitude: geocodeResult.longitude,
        radiusMiles,
      },
    });

    return {
      id: updated.id,
      location: {
        name: updated.name,
        address: updated.address,
        latitude: updated.latitude,
        longitude: updated.longitude,
        radiusMiles: updated.radiusMiles,
      },
    };
  }

  // Create new practice
  const practice = await prisma.practice.create({
    data: {
      businessId,
      name,
      address,
      latitude: geocodeResult.latitude,
      longitude: geocodeResult.longitude,
      radiusMiles,
    },
  });

  return {
    id: practice.id,
    location: {
      name: practice.name,
      address: practice.address,
      latitude: practice.latitude,
      longitude: practice.longitude,
      radiusMiles: practice.radiusMiles,
    },
  };
}

/**
 * Find all areas (cities/towns) within the practice radius
 */
export async function findAreasWithinRadius(
  practiceId: string,
  forceRefresh: boolean = false
): Promise<AreaData[]> {
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
  });

  if (!practice) {
    throw new Error(`Practice with id ${practiceId} not found`);
  }

  // Check if areas already exist and are recent (within 7 days)
  if (!forceRefresh) {
    const existingAreas = await prisma.area.findMany({
      where: {
        practiceId,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      },
    });

    if (existingAreas.length > 0) {
      return existingAreas.map(area => ({
        name: area.name,
        city: area.city,
        state: area.state,
        latitude: area.latitude,
        longitude: area.longitude,
        distanceMiles: area.distanceMiles,
        geocode: area.geocode,
      }));
    }
  }

  // Find nearby places using Google Places API
  const radiusMeters = practice.radiusMiles;
  const nearbyPlaces = await findNearbyPlaces(
    practice.latitude,
    practice.longitude,
    radiusMeters
  );

  // Filter places within radius and calculate distances
  const areas: AreaData[] = [];
  
  for (const place of nearbyPlaces) {
    const distance = calculateDistance(
      practice.latitude,
      practice.longitude,
      place.latitude,
      place.longitude
    );

    if (distance <= practice.radiusMiles) {
      const geocode = getLocationGeocode(
        place.latitude,
        place.longitude,
        place.city,
        place.state
      );

      areas.push({
        name: place.formattedAddress || `${place.city || 'Unknown'}, ${place.state || ''}`,
        city: place.city || place.formattedAddress.split(',')[0] || 'Unknown',
        state: place.state || '',
        latitude: place.latitude,
        longitude: place.longitude,
        distanceMiles: Math.round(distance * 10) / 10, // Round to 1 decimal
        geocode,
      });
    }
  }

  // Remove duplicates and sort by distance
  const uniqueAreas = Array.from(
    new Map(areas.map(area => [area.name, area])).values()
  ).sort((a, b) => a.distanceMiles - b.distanceMiles);

  // Delete old areas and create new ones
  await prisma.area.deleteMany({
    where: { practiceId },
  });

  // Create areas in database
  for (const area of uniqueAreas) {
    await prisma.area.create({
      data: {
        name: area.name,
        city: area.city,
        state: area.state,
        latitude: area.latitude,
        longitude: area.longitude,
        distanceMiles: area.distanceMiles,
        geocode: area.geocode,
        practiceId,
      },
    });
  }

  return uniqueAreas;
}

/**
 * Get all areas for a practice
 */
export async function getPracticeAreas(practiceId: string): Promise<AreaData[]> {
  const areas = await prisma.area.findMany({
    where: { practiceId },
    orderBy: { distanceMiles: 'asc' },
  });

  return areas.map(area => ({
    name: area.name,
    city: area.city,
    state: area.state,
    latitude: area.latitude,
    longitude: area.longitude,
    distanceMiles: area.distanceMiles,
    geocode: area.geocode,
  }));
}

/**
 * Get a specific area by ID
 */
export async function getAreaById(areaId: string) {
  return await prisma.area.findUnique({
    where: { id: areaId },
    include: {
      keywordCosts: true,
      practice: true,
    },
  });
}


