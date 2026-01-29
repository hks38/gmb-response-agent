import { prisma } from '../db/client';
import { getCommunityPoints, CommunityPointData } from './communityDiscoveryService';
import { getDemographicData, DemographicData } from './demographicDataService';
import { getPracticeAreas } from './geographicService';

export interface MapDataLayer {
  competitors: any[];
  communityPoints: CommunityPointData[];
  demographics: DemographicData[];
  heatmapData?: {
    metric: 'income' | 'population';
    data: Array<{ lat: number; lng: number; value: number }>;
  };
}

export interface MarketOpportunity {
  areaName: string;
  latitude: number;
  longitude: number;
  opportunityScore: number;
  factors: {
    population?: number;
    income?: number;
    competitorCount?: number;
    communityPoints?: number;
  };
  recommendations: string[];
}

/**
 * Prepare complete map data with all layers
 */
export async function prepareMapData(
  businessId: string,
  location: { latitude: number; longitude: number } | string,
  radiusMiles: number = 20
): Promise<MapDataLayer> {
  // Get competitors
  const competitors = await prisma.competitor.findMany({
    where: {
      businessId,
      status: 'active',
      latitude: { not: null },
      longitude: { not: null },
    },
  });

  // Get community points
  const locationCoords = typeof location === 'string'
    ? await (async () => {
        const { geocodeAddress } = await import('../utils/geocoding');
        const geocode = await geocodeAddress(location);
        return { latitude: geocode.latitude, longitude: geocode.longitude };
      })()
    : location;

  const communityPoints = await getCommunityPoints(businessId);

  // Get demographic data
  const demographics = await getDemographicData(
    businessId,
    locationCoords,
    radiusMiles
  );

  return {
    competitors: competitors.map(c => ({
      id: c.id,
      name: c.name,
      address: c.address,
      latitude: c.latitude,
      longitude: c.longitude,
      placeId: c.placeId,
    })),
    communityPoints,
    demographics,
  };
}

/**
 * Generate heatmap data for demographic metrics
 */
export function generateHeatmapData(
  demographicData: DemographicData[],
  metric: 'income' | 'population'
): Array<{ lat: number; lng: number; value: number }> {
  return demographicData.map(d => ({
    lat: d.latitude,
    lng: d.longitude,
    value: metric === 'income' 
      ? (d.householdIncome || 0)
      : (d.population || 0),
  }));
}

/**
 * Calculate drivable area polygon
 */
export function calculateDrivableArea(
  center: { latitude: number; longitude: number },
  radiusMiles: number
): Array<{ lat: number; lng: number }> {
  // Generate a circle of points around the center
  const points: Array<{ lat: number; lng: number }> = [];
  const numPoints = 32; // Number of points to create a smooth circle

  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    // Approximate: 1 degree latitude ≈ 69 miles, 1 degree longitude ≈ 69 * cos(latitude) miles
    const latOffset = (radiusMiles / 69) * Math.cos(angle);
    const lngOffset = (radiusMiles / (69 * Math.cos(center.latitude * Math.PI / 180))) * Math.sin(angle);
    
    points.push({
      lat: center.latitude + latOffset,
      lng: center.longitude + lngOffset,
    });
  }

  return points;
}

/**
 * Identify competitor clusters and market opportunities
 */
export async function identifyCompetitorClusters(
  businessId: string,
  location: { latitude: number; longitude: number },
  radiusMiles: number = 20
): Promise<MarketOpportunity[]> {
  const competitors = await prisma.competitor.findMany({
    where: {
      businessId,
      status: 'active',
      latitude: { not: null },
      longitude: { not: null },
    },
  });

  const communityPoints = await getCommunityPoints(businessId);
  const demographics = await getDemographicData(businessId, location, radiusMiles);

  // Group competitors by proximity (clusters)
  const clusters: Array<{
    center: { lat: number; lng: number };
    competitors: any[];
    communityPoints: CommunityPointData[];
  }> = [];

  for (const competitor of competitors) {
    if (!competitor.latitude || !competitor.longitude) continue;

    // Find existing cluster within 2 miles
    let foundCluster = false;
    for (const cluster of clusters) {
      const { calculateDistance } = await import('../utils/distance');
      const distance = calculateDistance(
        cluster.center.lat,
        cluster.center.lng,
        competitor.latitude,
        competitor.longitude
      );
      if (distance <= 2) {
        cluster.competitors.push(competitor);
        foundCluster = true;
        break;
      }
    }

    if (!foundCluster) {
      clusters.push({
        center: { lat: competitor.latitude, lng: competitor.longitude },
        competitors: [competitor],
        communityPoints: [],
      });
    }
  }

  // Find community points near each cluster
  for (const cluster of clusters) {
    const { calculateDistance } = await import('../utils/distance');
    cluster.communityPoints = communityPoints.filter(point => {
      const distance = calculateDistance(
        cluster.center.lat,
        cluster.center.lng,
        point.latitude,
        point.longitude
      );
      return distance <= 3; // Within 3 miles of cluster
    });
  }

  // Calculate opportunity scores
  const opportunities: MarketOpportunity[] = [];

  for (const cluster of clusters) {
    const demographic = demographics[0]; // Use first demographic data point
    const competitorCount = cluster.competitors.length;
    const communityPointCount = cluster.communityPoints.length;

    // Calculate opportunity score (lower competition + higher demand = better)
    const populationScore = (demographic?.population || 0) / 10000; // Normalize
    const incomeScore = (demographic?.householdIncome || 0) / 100000; // Normalize
    const competitionPenalty = competitorCount * 0.2; // More competitors = lower score
    const communityBonus = communityPointCount * 0.1; // More community points = higher score

    const opportunityScore = Math.max(0, Math.min(100, 
      (populationScore * 30 + incomeScore * 30 + communityBonus * 20) - (competitionPenalty * 20)
    ));

    const recommendations: string[] = [];
    if (competitorCount > 3) {
      recommendations.push('High competition area - consider differentiation strategy');
    }
    if (communityPointCount > 5) {
      recommendations.push('High community activity - good opportunity for local marketing');
    }
    if (demographic && demographic.householdIncome && demographic.householdIncome > 80000) {
      recommendations.push('High-income area - premium services may be viable');
    }

    opportunities.push({
      areaName: `Area near ${cluster.competitors[0]?.name || 'cluster'}`,
      latitude: cluster.center.lat,
      longitude: cluster.center.lng,
      opportunityScore: Math.round(opportunityScore * 100) / 100,
      factors: {
        population: demographic?.population,
        income: demographic?.householdIncome,
        competitorCount,
        communityPoints: communityPointCount,
      },
      recommendations,
    });
  }

  // Sort by opportunity score (descending)
  return opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);
}

/**
 * Find coverage gaps (areas with demand but no competitors)
 */
export async function findCoverageGaps(
  businessId: string,
  location: { latitude: number; longitude: number },
  radiusMiles: number = 20
): Promise<Array<{ latitude: number; longitude: number; opportunityScore: number }>> {
  const competitors = await prisma.competitor.findMany({
    where: {
      businessId,
      status: 'active',
      latitude: { not: null },
      longitude: { not: null },
    },
  });

  const communityPoints = await getCommunityPoints(businessId);
  const { calculateDistance } = await import('../utils/distance');

  const gaps: Array<{ latitude: number; longitude: number; opportunityScore: number }> = [];

  // Check areas around community points
  for (const point of communityPoints) {
    // Check if there are competitors nearby (within 2 miles)
    const nearbyCompetitors = competitors.filter(comp => {
      if (!comp.latitude || !comp.longitude) return false;
      const distance = calculateDistance(
        point.latitude,
        point.longitude,
        comp.latitude,
        comp.longitude
      );
      return distance <= 2;
    });

    // If no competitors nearby, this is a potential gap
    if (nearbyCompetitors.length === 0) {
      gaps.push({
        latitude: point.latitude,
        longitude: point.longitude,
        opportunityScore: 75, // High opportunity in underserved areas
      });
    }
  }

  return gaps;
}

