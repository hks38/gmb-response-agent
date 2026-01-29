import { prisma } from '../db/client';
import { searchTextPlaces, getPlaceDetails } from './googlePlaces';
import { geocodeAddress } from '../utils/geocoding';
import { calculateDistance } from '../utils/distance';

export interface CommunityPointData {
  name: string;
  type: 'employer' | 'hospital' | 'school' | 'poi';
  category?: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  metadata?: {
    employees?: number;
    students?: number;
    beds?: number;
    [key: string]: any;
  };
}

/**
 * Discover community points (employers, hospitals, schools) within radius
 */
export async function discoverCommunityPoints(
  businessId: string,
  location: { latitude: number; longitude: number },
  radiusMiles: number = 20,
  forceRefresh: boolean = false
): Promise<{ upserted: number; points: CommunityPointData[] }> {
  // Check if we have recent data (within 30 days)
  if (!forceRefresh) {
    const recentPoints = await prisma.communityPoint.findFirst({
      where: {
        businessId,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      },
    });

    if (recentPoints) {
      const existingPoints = await prisma.communityPoint.findMany({
        where: { businessId },
      });
      return {
        upserted: existingPoints.length,
        points: existingPoints.map(p => ({
          name: p.name,
          type: p.type as any,
          category: p.category || undefined,
          address: p.address,
          latitude: p.latitude,
          longitude: p.longitude,
          placeId: p.placeId || undefined,
          metadata: p.metadataJson ? JSON.parse(p.metadataJson) : undefined,
        })),
      };
    }
  }

  const radiusMeters = radiusMiles * 1609.34; // Convert miles to meters
  const allPoints: CommunityPointData[] = [];

  // Discover hospitals
  console.log('Discovering hospitals...');
  try {
    const hospitalsResult = await searchTextPlaces({
      textQuery: 'hospital',
      maxResultCount: 20,
      locationBiasCircle: {
        center: location,
        radiusMeters,
      },
    });

    for (const hospital of hospitalsResult.places) {
      if (hospital.id) {
        try {
          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
          const details = await getPlaceDetails({ placeId: hospital.id });
          if (details && details.location) {
            const distance = calculateDistance(
              location.latitude,
              location.longitude,
              details.location.latitude,
              details.location.longitude
            );
            if (distance <= radiusMiles) {
              allPoints.push({
                name: details.displayName?.text || hospital.displayName?.text || 'Hospital',
                type: 'hospital',
                category: 'Hospital',
                address: details.formattedAddress || '',
                latitude: details.location.latitude,
                longitude: details.location.longitude,
                placeId: hospital.id,
                metadata: {},
              });
            }
          }
        } catch (err) {
          console.error(`Failed to get details for hospital ${hospital.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('Failed to discover hospitals:', err);
  }

  // Discover schools (K-12 and colleges)
  console.log('Discovering schools...');
  const schoolQueries = ['elementary school', 'middle school', 'high school', 'college', 'university'];
  
  for (const query of schoolQueries) {
    try {
      const schoolsResult = await searchTextPlaces({
        textQuery: query,
        maxResultCount: 15,
        locationBiasCircle: {
          center: location,
          radiusMeters,
        },
      });

      for (const school of schoolsResult.places) {
        if (school.id) {
          try {
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
            const details = await getPlaceDetails({ placeId: school.id });
            if (details && details.location) {
              const distance = calculateDistance(
                location.latitude,
                location.longitude,
                details.location.latitude,
                details.location.longitude
              );
              if (distance <= radiusMiles) {
                // Check if already added (avoid duplicates)
                const existing = allPoints.find(p => p.placeId === school.id);
                if (!existing) {
                  allPoints.push({
                    name: details.displayName?.text || school.displayName?.text || 'School',
                    type: 'school',
                    category: query.includes('elementary') ? 'Elementary School' :
                             query.includes('middle') ? 'Middle School' :
                             query.includes('high') ? 'High School' :
                             query.includes('college') || query.includes('university') ? 'College/University' : 'School',
                    address: details.formattedAddress || '',
                    latitude: details.location.latitude,
                    longitude: details.location.longitude,
                    placeId: school.id,
                    metadata: {},
                  });
                }
              }
            }
          } catch (err) {
            console.error(`Failed to get details for school ${school.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to discover schools for query "${query}":`, err);
    }
  }

  // Discover major employers (large companies, corporate offices)
  console.log('Discovering major employers...');
  const employerQueries = ['corporate office', 'headquarters', 'large company', 'business park'];
  
  for (const query of employerQueries) {
    try {
      const employersResult = await searchTextPlaces({
        textQuery: query,
        maxResultCount: 15,
        locationBiasCircle: {
          center: location,
          radiusMeters,
        },
      });

      for (const employer of employersResult.places) {
        if (employer.id) {
          try {
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
            const details = await getPlaceDetails({ placeId: employer.id });
            if (details && details.location) {
              const distance = calculateDistance(
                location.latitude,
                location.longitude,
                details.location.latitude,
                details.location.longitude
              );
              if (distance <= radiusMiles) {
                // Check if already added
                const existing = allPoints.find(p => p.placeId === employer.id);
                if (!existing) {
                  allPoints.push({
                    name: details.displayName?.text || employer.displayName?.text || 'Business',
                    type: 'employer',
                    category: 'Major Employer',
                    address: details.formattedAddress || '',
                    latitude: details.location.latitude,
                    longitude: details.location.longitude,
                    placeId: employer.id,
                    metadata: {},
                  });
                }
              }
            }
          } catch (err) {
            console.error(`Failed to get details for employer ${employer.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to discover employers for query "${query}":`, err);
    }
  }

  // Remove duplicates by placeId
  const uniquePoints = Array.from(
    new Map(allPoints.map(p => [p.placeId || p.name, p])).values()
  );

  // Delete old points and save new ones
  await prisma.communityPoint.deleteMany({
    where: { businessId },
  });

  let upserted = 0;
  for (const point of uniquePoints) {
    await prisma.communityPoint.create({
      data: {
        businessId,
        name: point.name,
        type: point.type,
        category: point.category,
        address: point.address,
        latitude: point.latitude,
        longitude: point.longitude,
        placeId: point.placeId,
        metadataJson: point.metadata ? JSON.stringify(point.metadata) : null,
      },
    });
    upserted++;
  }

  console.log(`Discovered ${upserted} community points`);

  return {
    upserted,
    points: uniquePoints,
  };
}

/**
 * Get community points for a business
 */
export async function getCommunityPoints(businessId: string): Promise<CommunityPointData[]> {
  const points = await prisma.communityPoint.findMany({
    where: { businessId },
    orderBy: { name: 'asc' },
  });

  return points.map(p => ({
    name: p.name,
    type: p.type as any,
    category: p.category || undefined,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    placeId: p.placeId || undefined,
    metadata: p.metadataJson ? JSON.parse(p.metadataJson) : undefined,
  }));
}

/**
 * Enrich a community point with additional details
 */
export async function enrichCommunityPoint(placeId: string): Promise<CommunityPointData | null> {
  if (!placeId) return null;

  try {
    const details = await getPlaceDetails({ placeId });
    if (!details || !details.location) return null;

    return {
      name: details.displayName?.text || '',
      type: 'poi',
      address: details.formattedAddress || '',
      latitude: details.location.latitude,
      longitude: details.location.longitude,
      placeId,
      metadata: {
        phone: details.internationalPhoneNumber || undefined,
        website: details.websiteUri || undefined,
      },
    };
  } catch (error) {
    console.error('Failed to enrich community point:', error);
    return null;
  }
}

