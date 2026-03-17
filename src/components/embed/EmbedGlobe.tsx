'use client';

import { useEffect, useRef, useState, useMemo, type CSSProperties } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Reorder } from 'framer-motion';

interface EventMarker {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
  event_type: string | null;
  tier: string | null;
  venue_name: string | null;
  venue_address: string | null;
  event_time: string | null;
  registration_url: string | null;
  is_side_event: boolean;
  parent_event_id: string | null;
  tags: string[] | null;
  is_past: boolean;
  is_current: boolean;
}

// Travel mode types and constants
type TravelMode = 'car' | 'foot' | 'bike';
const TRAVEL_SPEEDS: Record<TravelMode, number> = { car: 30, foot: 5, bike: 15 }; // km/h avg urban
const MODE_LABELS: Record<TravelMode, string> = { car: 'drive', foot: 'walk', bike: 'bike' };

// Nomadz design tokens
const N = {
  bg: '#080A0C',
  cyan: '#50D8D8',
  blue: '#50B1D8',
  red: '#FF6B6B',
  text: '#FFFFFF',
  textDim: 'rgba(255,255,255,0.6)',
  textMuted: 'rgba(255,255,255,0.35)',
  border: 'rgba(255,255,255,0.10)',
  bgPanel: 'rgba(10,12,14,0.97)',
  gradient: 'linear-gradient(135deg, #50D8D8, #50B1D8)',
};

const getNomadzMapStyle = (showLabels: boolean) => ({
  version: 8 as const,
  sources: {
    'carto-dark': {
      type: 'raster' as const,
      tiles: showLabels ? [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ] : [
        'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background' as const,
      paint: { 'background-color': N.bg },
    },
    {
      id: 'carto-tiles',
      type: 'raster' as const,
      source: 'carto-dark',
      paint: {
        'raster-opacity': 0.75,
        'raster-hue-rotate': 195,
        'raster-contrast': -0.2,
        'raster-brightness-min': 0.15,
      },
    },
  ],
});

function getMarkerColor(event: EventMarker): string {
  if (event.is_past) return N.red;
  if (event.is_current) return N.blue;
  // Upcoming: green if within 30 days, white if further out
  const startDate = new Date(event.start_date);
  const now = new Date();
  const daysAway = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysAway <= 30) return N.cyan;
  return '#FFFFFF';
}

function getMarkerSize(tier: string | null): number {
  if (tier === 'major') return 6;
  if (tier === 'regional') return 5;
  return 4;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function parseStartHour(eventTime: string | null): number | null {
  if (!eventTime) return null;
  const normalized = eventTime.replace(/\s*[-–]\s*/, '-').trim();
  const parts = normalized.split('-');
  if (parts.length < 2) return null;
  const startPart = parts[0].trim();
  const endPart = parts.slice(1).join('-').trim();
  const startMatch = startPart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!startMatch) return null;
  let hours = parseInt(startMatch[1], 10);
  const minutes = parseInt(startMatch[2], 10);
  let meridiem = startMatch[3]?.toUpperCase() || null;
  if (!meridiem) {
    const endMeridiem = endPart.match(/(AM|PM)\s*$/i);
    meridiem = endMeridiem ? endMeridiem[1].toUpperCase() : null;
  }
  if (!meridiem) return null;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  else if (meridiem === 'PM' && hours !== 12) hours += 12;
  return hours + minutes / 60;
}

function formatHour(h: number): string {
  if (h === 0 || h === 24) return '12 AM';
  if (h === 12) return '12 PM';
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(1)}km`;
  return `${Math.round(km)}km`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return '< 1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function hasSpecificLocation(event: EventMarker, mainEvent?: EventMarker | null): boolean {
  const isTBA = !event.venue_name || event.venue_name === 'TBA';
  if (isTBA) return false;
  // If main event is provided, check if side event shares the main event's coords (city-level fallback)
  if (mainEvent) {
    const TOL = 0.001;
    const isMainCoords =
      Math.abs(event.lat - mainEvent.lat) < TOL &&
      Math.abs(event.lng - mainEvent.lng) < TOL;
    if (isMainCoords) return false;
  }
  return true;
}

function hasVenueAddress(event: EventMarker): boolean {
  return !!event.venue_address && event.venue_address.trim().length > 0 && event.venue_address !== 'TBA';
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
}

export default function EmbedGlobe() {
  const mapRef = useRef<MapRef>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const touchHandledRef = useRef(false);
  const markerTriggerRef = useRef(false);
  const [events, setEvents] = useState<EventMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [projection, setProjection] = useState<'2d' | 'globe'>('globe');
  const [showLabels, setShowLabels] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<EventMarker | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<EventMarker | null>(null);
  const [hoveredScreenPos, setHoveredScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  // Filter state for side events
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [timeRangeStart, setTimeRangeStart] = useState(0);
  const [timeRangeEnd, setTimeRangeEnd] = useState(24);

  // Location mode state
  const [travelMode, setTravelMode] = useState<TravelMode>('car');
  const [locationMode, setLocationMode] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userLocationSource, setUserLocationSource] = useState<'gps' | 'pin' | 'search' | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [hoveredSideEventId, setHoveredSideEventId] = useState<string | null>(null);
  const [hoveredSideScreenPos, setHoveredSideScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [pinDropMode, setPinDropMode] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressResults, setAddressResults] = useState<NominatimResult[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [routeDistances, setRouteDistances] = useState<Record<string, { km: number; duration: number; geometry: GeoJSON.LineString | null }>>({});
  const [routeLoading, setRouteLoading] = useState(false);
  const [routesFetched, setRoutesFetched] = useState(0);
  const [routesTotal, setRoutesTotal] = useState(0);
  // Multi-stop route
  const [routeStops, setRouteStops] = useState<string[]>([]);
  const [multiStopRoute, setMultiStopRoute] = useState<{
    geometry: GeoJSON.LineString;
    legs: Array<{ from: string; to: string; km: number; duration: number }>;
    totalKm: number;
    totalDuration: number;
  } | null>(null);
  const [multiStopLoading, setMultiStopLoading] = useState(false);
  // Geocoded coordinates for side events that have addresses but share city-level fallback coords
  const [geocodedCoords, setGeocodedCoords] = useState<Record<string, { lat: number; lng: number }>>({});
  const [geocodingProgress, setGeocodingProgress] = useState<{ done: number; total: number } | null>(null);
  const [geocodeFailedIds, setGeocodeFailedIds] = useState<Set<string>>(new Set());

  // Viewfinder state
  const [viewfinderTab, setViewfinderTab] = useState<'upcoming' | 'search' | null>(null);
  const [viewfinderSearch, setViewfinderSearch] = useState('');

  const isInteractingRef = useRef(false);
  const isHoveringMarkerRef = useRef(false);
  const rotationRef = useRef<number | null>(null);
  const resumeRotationAfter = useRef<number | null>(null);

  // Reset filters and location state when switching events
  useEffect(() => {
    setSearchQuery('');
    setSelectedDates(new Set());
    setTimeRangeStart(0);
    setTimeRangeEnd(24);
    setLocationMode(false);
    setUserLocation(null);
    setUserLocationSource(null);
    setGeoError(null);
    setPinDropMode(false);
    setHoveredSideEventId(null);
    setHoveredSideScreenPos(null);
    setAddressQuery('');
    setAddressResults([]);
    setRouteDistances({});
    setRouteLoading(false);
    setRoutesFetched(0);
    setRoutesTotal(0);
    setRouteStops([]);
    setMultiStopRoute(null);
    setMultiStopLoading(false);
    setGeocodedCoords({});
    setGeocodingProgress(null);
    setGeocodeFailedIds(new Set());
  }, [selectedEvent?.id]);

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Fetch events
  useEffect(() => {
    fetch('/api/embed/events')
      .then(r => r.json())
      .then(data => {
        setEvents(data.events || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const projectionConfig = useMemo(
    () => projection === 'globe' ? { type: 'globe' as const } : { type: 'mercator' as const },
    [projection]
  );

  const mapStyle = useMemo(() => getNomadzMapStyle(showLabels), [showLabels]);

  // Globe rotation — verbatim from WarRoomMap.tsx:327-392
  useEffect(() => {
    if (projection !== 'globe') return;

    const initTimeout = setTimeout(() => {
      if (!mapRef.current) return;

      let lastTime = Date.now();
      const rotateGlobe = () => {
        if (!mapRef.current) return;

        const now = Date.now();
        const delta = now - lastTime;
        const currentZoom = mapRef.current.getMap().getZoom();
        const isPaused = resumeRotationAfter.current !== null && now < resumeRotationAfter.current;

        const shouldRotate =
          !isInteractingRef.current &&
          currentZoom <= 8 &&
          !isHoveringMarkerRef.current &&
          !isPaused &&
          delta > 33;

        if (shouldRotate) {
          if (resumeRotationAfter.current !== null && now >= resumeRotationAfter.current) {
            resumeRotationAfter.current = null;
          }
          const map = mapRef.current;
          const center = map.getCenter();
          map.easeTo({
            center: [center.lng + 0.5, center.lat],
            duration: 100,
            easing: (t: number) => t,
          });
          lastTime = now;
        }

        rotationRef.current = requestAnimationFrame(rotateGlobe);
      };

      rotationRef.current = requestAnimationFrame(rotateGlobe);
    }, 300);

    return () => {
      clearTimeout(initTimeout);
      if (rotationRef.current) cancelAnimationFrame(rotationRef.current);
    };
  }, [projection]);

  // Side events for selected event
  const sideEvents = useMemo(() => {
    if (!selectedEvent || selectedEvent.is_side_event) return [];
    const parentId = selectedEvent.parent_event_id;
    if (!parentId) return [];
    return events
      .filter(e => e.is_side_event && e.parent_event_id === parentId)
      .sort((a: EventMarker, b: EventMarker) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }, [selectedEvent, events]);

  const mainEvents = useMemo(() => events.filter(e => !e.is_side_event), [events]);

  // Viewfinder computed data
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 60);
    return mainEvents
      .filter(e => {
        const start = new Date(e.start_date);
        return start >= now && start <= cutoff;
      })
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }, [mainEvents]);

  const viewfinderResults = useMemo(() => {
    if (!viewfinderSearch.trim()) return mainEvents;
    const q = viewfinderSearch.toLowerCase().trim();
    return mainEvents.filter(e => {
      const name = e.name.toLowerCase();
      const city = (e.city || '').toLowerCase();
      const country = (e.country || '').toLowerCase();
      const tags = (e.tags || []).join(' ').toLowerCase();
      return name.includes(q) || city.includes(q) || country.includes(q) || tags.includes(q);
    });
  }, [mainEvents, viewfinderSearch]);

  // Unique dates from side events for date chips
  const sideEventDates = useMemo(() => {
    const dates = [...new Set(sideEvents.map(e => e.start_date))];
    return dates.sort();
  }, [sideEvents]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedDates(new Set());
    setTimeRangeStart(0);
    setTimeRangeEnd(24);
  };

  const handleViewfinderSelect = (event: EventMarker) => {
    setViewfinderTab(null);
    setViewfinderSearch('');
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [event.lng, event.lat],
        zoom: 10,
        duration: 1500,
      });
      resumeRotationAfter.current = Date.now() + 10000;
    }
  };

  const hasActiveFilters = searchQuery !== '' ||
    selectedDates.size > 0 ||
    timeRangeStart !== 0 ||
    timeRangeEnd !== 24;

  const filteredSideEvents = useMemo(() => {
    let result = sideEvents;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e => e.name.toLowerCase().includes(q));
    }
    if (selectedDates.size > 0) {
      result = result.filter(e => selectedDates.has(e.start_date));
    }
    if (timeRangeStart !== 0 || timeRangeEnd !== 24) {
      result = result.filter(e => {
        const hour = parseStartHour(e.event_time);
        if (hour === null) return true;
        return hour >= timeRangeStart && hour <= timeRangeEnd;
      });
    }
    return result;
  }, [sideEvents, searchQuery, selectedDates, timeRangeStart, timeRangeEnd]);

  // Stable jitter offsets for events pending geocoding (seeded by event id hash)
  const jitterOffsets = useMemo(() => {
    const offsets: Record<string, { lat: number; lng: number }> = {};
    sideEvents.forEach(se => {
      let hash = 0;
      for (let i = 0; i < se.id.length; i++) {
        hash = ((hash << 5) - hash) + se.id.charCodeAt(i);
        hash |= 0;
      }
      const r1 = ((hash & 0xFF) / 255) * 2 - 1;
      const r2 = (((hash >> 8) & 0xFF) / 255) * 2 - 1;
      offsets[se.id] = { lat: r1 * 0.002, lng: r2 * 0.002 };
    });
    return offsets;
  }, [sideEvents]);

  // Helper: get effective coordinates for a side event (geocoded if available)
  const getEffectiveCoords = (event: EventMarker) => {
    const gc = geocodedCoords[event.id];
    if (gc) return gc;
    return { lat: event.lat, lng: event.lng };
  };

  // Helper: get display coordinates for map markers (includes jitter for pending events)
  const getDisplayCoords = (event: EventMarker) => {
    if (geocodedCoords[event.id]) return geocodedCoords[event.id];
    if (hasSpecificLocation(event, selectedEvent)) return { lat: event.lat, lng: event.lng };
    if (selectedEvent && jitterOffsets[event.id]) {
      return {
        lat: selectedEvent.lat + jitterOffsets[event.id].lat,
        lng: selectedEvent.lng + jitterOffsets[event.id].lng,
      };
    }
    return { lat: event.lat, lng: event.lng };
  };

  // Helper: does a side event have resolved coordinates we can route to?
  const hasResolvedLocation = (event: EventMarker) => {
    if (geocodedCoords[event.id]) return true;
    return hasSpecificLocation(event, selectedEvent);
  };

  // Helper: does a side event have any venue info (address or name) even if not yet geocoded?
  const hasVenueInfo = (event: EventMarker) => {
    if (geocodedCoords[event.id]) return true;
    if (hasSpecificLocation(event, selectedEvent)) return true;
    return hasVenueAddress(event) || (!!event.venue_name && event.venue_name !== 'TBA');
  };

  // Helper: is this event pending geocoding? (has address but coords not resolved yet)
  const isPendingGeocode = (event: EventMarker) => {
    if (geocodedCoords[event.id]) return false;
    if (geocodeFailedIds.has(event.id)) return false;
    if (hasSpecificLocation(event, selectedEvent)) return false;
    return hasVenueAddress(event);
  };

  const filteredSideEventsWithDistance = useMemo(() => {
    let sorted;
    if (!userLocation) {
      sorted = filteredSideEvents.map(e => ({ ...e, distance: null as number | null }));
    } else {
      const withDist = filteredSideEvents.map(e => {
        const coords = getEffectiveCoords(e);
        return {
          ...e,
          distance: haversineKm(userLocation.lat, userLocation.lng, coords.lat, coords.lng),
        };
      });
      // Sort: resolved locations first (by distance), then pending, then unresolved at bottom
      if (locationMode) {
        sorted = withDist.sort((a, b) => {
          const aResolved = hasResolvedLocation(a as EventMarker) ? 0 : isPendingGeocode(a as EventMarker) ? 1 : 2;
          const bResolved = hasResolvedLocation(b as EventMarker) ? 0 : isPendingGeocode(b as EventMarker) ? 1 : 2;
          if (aResolved !== bResolved) return aResolved - bResolved;
          return (a.distance ?? Infinity) - (b.distance ?? Infinity);
        });
      } else {
        sorted = withDist.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      }
    }
    // Float route-selected cards to top in routeStops order
    if (routeStops.length > 0) {
      const inRoute: typeof sorted = [];
      const notInRoute: typeof sorted = [];
      for (const item of sorted) {
        if (routeStops.includes(item.id)) {
          inRoute.push(item);
        } else {
          notInRoute.push(item);
        }
      }
      inRoute.sort((a, b) => routeStops.indexOf(a.id) - routeStops.indexOf(b.id));
      return [...inRoute, ...notInRoute];
    }
    return sorted;
  }, [filteredSideEvents, userLocation, geocodedCoords, locationMode, geocodeFailedIds, routeStops]);

  // Toggle a side event in/out of the route stops list
  const toggleRouteStop = (eventId: string) => {
    const isInRoute = routeStops.includes(eventId);
    const newStops = isInRoute
      ? routeStops.filter(id => id !== eventId)
      : routeStops.length >= 10 ? routeStops : [...routeStops, eventId];
    setRouteStops(newStops);
    // Fit map to show all stops + user location
    if (newStops.length > 0 && mapRef.current && userLocation) {
      const allPoints = [{ lng: userLocation.lng, lat: userLocation.lat }];
      newStops.forEach(id => {
        const ev = filteredSideEventsWithDistance.find(ev2 => ev2.id === id);
        if (ev) {
          const ec = getEffectiveCoords(ev as EventMarker);
          allPoints.push({ lng: ec.lng, lat: ec.lat });
        }
      });
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      allPoints.forEach(p => {
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
      });
      mapRef.current.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        { padding: 80, duration: 1000 }
      );
      resumeRotationAfter.current = Date.now() + 15000;
    }
  };

  // Estimate travel duration based on selected mode and distance
  const estimateDuration = (km: number) => (km / TRAVEL_SPEEDS[travelMode]) * 3600;

  // Route geometry for the currently hovered side event (for rendering line on map)
  const hoveredRouteGeometry = useMemo(() => {
    if (!hoveredSideEventId) return null;
    return routeDistances[hoveredSideEventId]?.geometry ?? null;
  }, [hoveredSideEventId, routeDistances]);

  // Geocode side events that have addresses but share the main event's fallback coordinates
  const geocodeAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!locationMode || !selectedEvent) return;
    // Find side events with addresses but at the main event's fallback coords
    const needsGeocoding = sideEvents.filter(se => {
      if (geocodedCoords[se.id]) return false; // already geocoded
      if (geocodeFailedIds.has(se.id)) return false; // already failed
      if (hasSpecificLocation(se, selectedEvent)) return false; // already has unique coords
      return hasVenueAddress(se); // has address text we can geocode
    });
    if (needsGeocoding.length === 0) return;

    if (geocodeAbortRef.current) geocodeAbortRef.current.abort();
    const controller = new AbortController();
    geocodeAbortRef.current = controller;
    setGeocodingProgress({ done: 0, total: needsGeocoding.length });

    // Build query variants for an address: original, simplified (no suite/floor/building name), street-only
    const buildQueries = (rawAddr: string, city: string): string[] => {
      const base = city && !rawAddr.toLowerCase().includes(city.toLowerCase())
        ? `${rawAddr}, ${city}` : rawAddr;
      const queries = [base];

      // Simplify: strip building name prefix, suite/unit/floor, USA, zip
      let simplified = rawAddr;
      // Remove building name prefix: text before the first part starting with a digit
      const parts = simplified.split(',');
      for (let i = 0; i < parts.length; i++) {
        if (/^\s*\d/.test(parts[i])) {
          simplified = parts.slice(i).join(',');
          break;
        }
      }
      // Remove suite/unit/floor/ste/apt
      simplified = simplified.replace(/\s*#\d+\w*/g, '');
      simplified = simplified.replace(/\s*(Suite|Ste|Unit|Apt|Floor|Rm|Room)\s*\d+\w*/gi, '');
      simplified = simplified.replace(/\s*\d+(st|nd|rd|th)\s+floor/gi, '');
      // Remove ", USA"
      simplified = simplified.replace(/,\s*USA\s*$/i, '');
      // Remove zip codes
      simplified = simplified.replace(/\s+\d{5}(-\d{4})?\s*/g, ' ');
      // Clean up
      simplified = simplified.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim().replace(/,$/, '').trim();

      if (simplified !== base && simplified.length > 5) {
        queries.push(simplified);
      }

      // Street-only fallback: drop the street number, keep street name + city
      const streetMatch = simplified.match(/^\d+\s+(.+)/);
      if (streetMatch) {
        queries.push(streetMatch[1]);
      }

      return queries;
    };

    const tryGeocode = async (query: string, signal: AbortSignal): Promise<{ lat: number; lng: number } | null> => {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        { signal, headers: { 'Accept': 'application/json' } }
      );
      const data = await res.json();
      if (data && data[0]) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
      }
      return null;
    };

    let cancelled = false;
    (async () => {
      for (const event of needsGeocoding) {
        if (cancelled) break;
        try {
          const addr = event.venue_address!;
          const city = event.city || '';
          const queries = buildQueries(addr, city);

          let result: { lat: number; lng: number } | null = null;
          for (let qi = 0; qi < queries.length; qi++) {
            if (cancelled) break;
            result = await tryGeocode(queries[qi], controller.signal);
            if (result) {
              // Rate limit delay before next event
              await new Promise(r => setTimeout(r, 1100));
              break;
            }
            // Rate limit delay before retry with next query variant
            await new Promise(r => setTimeout(r, 1100));
          }

          if (result) {
            setGeocodedCoords(prev => ({ ...prev, [event.id]: result! }));
          } else {
            setGeocodeFailedIds(prev => new Set(prev).add(event.id));
          }
          if (!cancelled) setGeocodingProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null);
        } catch {
          if (cancelled) break;
          setGeocodeFailedIds(prev => new Set(prev).add(event.id));
        }
      }
      if (!cancelled) setGeocodingProgress(null);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [locationMode, selectedEvent, sideEvents]);

  // Fetch OSRM walking routes incrementally — only fetch for newly resolved events
  const routeAbortRef = useRef<AbortController | null>(null);
  const fetchedRouteIdsRef = useRef<Set<string>>(new Set());
  const prevUserLocationRef = useRef<string | null>(null);
  useEffect(() => {
    const locKey = userLocation ? `${userLocation.lat},${userLocation.lng}` : null;

    if (!locationMode || !userLocation) {
      setRouteDistances({});
      fetchedRouteIdsRef.current = new Set();
      prevUserLocationRef.current = null;
      return;
    }

    // If user location changed, clear everything and restart
    if (locKey !== prevUserLocationRef.current) {
      fetchedRouteIdsRef.current = new Set();
      setRouteDistances({});
      setRoutesFetched(0);
      setRoutesTotal(0);
      prevUserLocationRef.current = locKey;
    }

    // Only fetch routes for resolved events we haven't fetched yet
    const locatable = filteredSideEvents.filter(e =>
      hasResolvedLocation(e) && !fetchedRouteIdsRef.current.has(e.id)
    );
    if (locatable.length === 0) {
      setRouteLoading(false);
      return;
    }

    // Abort previous batch (if still running) and start new batch for new events
    if (routeAbortRef.current) routeAbortRef.current.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    setRouteLoading(true);
    setRoutesTotal(fetchedRouteIdsRef.current.size + locatable.length);

    let cancelled = false;
    (async () => {
      for (const event of locatable) {
        if (cancelled) break;
        // Double-check not already fetched (in case of concurrent updates)
        if (fetchedRouteIdsRef.current.has(event.id)) continue;
        try {
          const coords = getEffectiveCoords(event);
          const url = `https://router.project-osrm.org/route/v1/foot/${userLocation.lng},${userLocation.lat};${coords.lng},${coords.lat}?overview=full&geometries=geojson`;
          const res = await fetch(url, { signal: controller.signal });
          const data = await res.json();
          if (data.routes && data.routes[0]) {
            const route = data.routes[0];
            fetchedRouteIdsRef.current.add(event.id);
            setRouteDistances(prev => ({
              ...prev,
              [event.id]: { km: route.distance / 1000, duration: route.duration, geometry: route.geometry || null },
            }));
          } else {
            // Mark as fetched even if no route found (e.g., across ocean)
            fetchedRouteIdsRef.current.add(event.id);
          }
          if (!cancelled) setRoutesFetched(fetchedRouteIdsRef.current.size);
          // Rate limit: ~1 req/sec for OSRM public server
          await new Promise(r => setTimeout(r, 1000));
        } catch {
          if (cancelled) break;
        }
      }
      if (!cancelled) setRouteLoading(false);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [locationMode, userLocation, filteredSideEvents, geocodedCoords]);

  // Multi-stop route fetching via OSRM multi-waypoint API
  const multiRouteAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!userLocation || routeStops.length === 0) {
      setMultiStopRoute(null);
      return;
    }
    const stopEvents = routeStops
      .map(id => filteredSideEventsWithDistance.find(e => e.id === id))
      .filter((e): e is NonNullable<typeof e> => !!e && hasResolvedLocation(e as EventMarker));
    if (stopEvents.length === 0) {
      setMultiStopRoute(null);
      return;
    }
    if (multiRouteAbortRef.current) multiRouteAbortRef.current.abort();
    const controller = new AbortController();
    multiRouteAbortRef.current = controller;
    setMultiStopLoading(true);

    const coords = [
      `${userLocation.lng},${userLocation.lat}`,
      ...stopEvents.map(e => {
        const ec = getEffectiveCoords(e as EventMarker);
        return `${ec.lng},${ec.lat}`;
      }),
    ].join(';');
    const url = `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=false`;

    fetch(url, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (data.routes && data.routes[0]) {
          const route = data.routes[0];
          const legs = route.legs.map((leg: any, i: number) => ({
            from: i === 0 ? 'user' : stopEvents[i - 1].id,
            to: stopEvents[i].id,
            km: leg.distance / 1000,
            duration: leg.duration,
          }));
          setMultiStopRoute({
            geometry: route.geometry,
            legs,
            totalKm: route.distance / 1000,
            totalDuration: route.duration,
          });
        }
        setMultiStopLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMultiStopLoading(false);
      });

    return () => controller.abort();
  }, [routeStops, userLocation, filteredSideEventsWithDistance, geocodedCoords]);

  // Nominatim address search
  const searchAddress = async (query: string) => {
    if (!query.trim()) return;
    setAddressLoading(true);
    setAddressResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`,
        { headers: { 'Accept': 'application/json' } }
      );
      const data: NominatimResult[] = await res.json();
      setAddressResults(data);
    } catch {
      setAddressResults([]);
    }
    setAddressLoading(false);
  };

  // Browser geolocation
  const requestGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation not supported');
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        // Check if user is within reasonable distance of the event city (50km)
        if (selectedEvent) {
          const distToEvent = haversineKm(userLat, userLng, selectedEvent.lat, selectedEvent.lng);
          if (distToEvent > 50) {
            setGeoError(`Your location is ${Math.round(distToEvent)}km away. Input a location within ${selectedEvent.city || 'the event city'} to proceed.`);
            setGeoLoading(false);
            return;
          }
        }
        setUserLocation({ lat: userLat, lng: userLng });
        setUserLocationSource('gps');
        setGeoLoading(false);
        if (mapRef.current) {
          mapRef.current.flyTo({
            center: [userLng, userLat],
            zoom: 13,
            duration: 1500,
          });
          resumeRotationAfter.current = Date.now() + 15000;
        }
      },
      (err) => {
        setGeoError(
          err.code === 1 ? 'Location access denied' :
          err.code === 2 ? 'Location unavailable' :
          'Location request timed out'
        );
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  };

  // ESC key navigation hierarchy
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      // Priority 1: Close address search dropdown
      if (addressResults.length > 0) {
        setAddressResults([]);
        return;
      }
      // Priority 2: Exit pin drop mode
      if (pinDropMode) {
        setPinDropMode(false);
        return;
      }
      // Priority 3: Clear multi-stop route
      if (routeStops.length > 0) {
        setRouteStops([]);
        setMultiStopRoute(null);
        return;
      }
      // Priority 4: Exit location mode
      if (locationMode) {
        setLocationMode(false);
        setUserLocation(null);
        setUserLocationSource(null);
        setPinDropMode(false);
        setAddressQuery('');
        setAddressResults([]);
        setRouteDistances({});
        setRouteStops([]);
        setMultiStopRoute(null);
        setHoveredSideEventId(null);
        setHoveredSideScreenPos(null);
        return;
      }
      // Priority 5: Close event panel and zoom out
      if (selectedEvent) {
        setSelectedEvent(null);
        if (mapRef.current) {
          mapRef.current.flyTo({ center: [20, 20], zoom: 2, duration: 1500 });
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addressResults.length, pinDropMode, routeStops.length, locationMode, selectedEvent]);

  // Count side events per main event by parent_event_id
  const sideEventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => {
      if (e.is_side_event && e.parent_event_id) {
        counts[e.parent_event_id] = (counts[e.parent_event_id] || 0) + 1;
      }
    });
    return counts;
  }, [events]);

  // Compute pixel offsets for main events that share the same city
  const mainEventPixelOffsets = useMemo(() => {
    const mainEvents = events.filter(e => !e.is_side_event);
    const PROXIMITY = 0.15; // ~16km — events within this are considered overlapping
    const PIXEL_SPREAD = 12; // pixels offset from center

    const groups: EventMarker[][] = [];
    const assigned = new Set<string>();

    for (const e of mainEvents) {
      if (assigned.has(e.id)) continue;
      const group = [e];
      assigned.add(e.id);
      for (const other of mainEvents) {
        if (assigned.has(other.id)) continue;
        if (Math.abs(e.lat - other.lat) < PROXIMITY && Math.abs(e.lng - other.lng) < PROXIMITY) {
          group.push(other);
          assigned.add(other.id);
        }
      }
      if (group.length > 1) groups.push(group);
    }

    const offsets: Record<string, [number, number]> = {};
    for (const group of groups) {
      group.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
      const n = group.length;
      group.forEach((e, i) => {
        const angle = (2 * Math.PI * i) / n;
        offsets[e.id] = [
          Math.cos(angle) * PIXEL_SPREAD,
          Math.sin(angle) * PIXEL_SPREAD,
        ];
      });
    }
    return offsets;
  }, [events]);

  // Scroll to card when marker triggers hover
  useEffect(() => {
    if (hoveredSideEventId && markerTriggerRef.current) {
      markerTriggerRef.current = false;
      document.getElementById(`card-${hoveredSideEventId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [hoveredSideEventId]);

  // Panel styles
  const panelStyle: CSSProperties = isMobile
    ? {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '70vh',
        borderRadius: '20px 20px 0 0',
        background: N.bgPanel,
        border: `1px solid ${N.border}`,
        overflowY: 'auto',
        zIndex: 500,
        fontFamily: "'Space Grotesk', sans-serif",
      }
    : {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 360,
        maxHeight: 'calc(100% - 32px)',
        borderRadius: 14,
        background: N.bgPanel,
        border: `1px solid ${N.border}`,
        overflowY: 'auto',
        zIndex: 500,
        fontFamily: "'Space Grotesk', sans-serif",
      };

  return (
    <div className="nomadz-embed" style={{ width: '100%', height: '100%', background: N.bg, position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
        @keyframes nomadz-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }
        .nomadz-pulse { animation: nomadz-pulse 1.5s ease-in-out infinite; }
        .maplibregl-ctrl-attrib { display: none !important; }
        .maplibregl-ctrl-logo { display: none !important; }
        .nomadz-embed .nomadz-datechips::-webkit-scrollbar { display: none !important; }
        .nomadz-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 4px;
          background: #FFFFFF;
          border: 2px solid #080A0C;
          cursor: pointer;
          pointer-events: auto;
          box-shadow: 0 0 8px rgba(255,255,255,0.4);
        }
        .nomadz-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 4px;
          background: #FFFFFF;
          border: 2px solid #080A0C;
          cursor: pointer;
          pointer-events: auto;
          box-shadow: 0 0 8px rgba(255,255,255,0.4);
        }
        @keyframes nomadz-diamond-glow {
          0%, 100% { box-shadow: 0 0 6px var(--glow-color); }
          50% { box-shadow: 0 0 14px var(--glow-color), 0 0 20px var(--glow-color); }
        }
        .nomadz-diamond-glow { animation: nomadz-diamond-glow 1.2s ease-in-out infinite; }
        @keyframes nomadz-ring-pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        @layer base {
          .nomadz-embed ::-webkit-scrollbar { width: 5px !important; height: 5px !important; }
          .nomadz-embed ::-webkit-scrollbar-track { background: transparent !important; }
          .nomadz-embed ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3) !important; border-radius: 3px !important; }
          .nomadz-embed ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.45) !important; }
          .nomadz-embed, .nomadz-embed * { scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,0.3) transparent !important; }
          .nomadz-embed ::selection { background-color: revert !important; color: revert !important; }
          .nomadz-embed ::-moz-selection { background-color: revert !important; color: revert !important; }
        }
      `}</style>

      <Map
        key={projection}
        ref={mapRef}
        initialViewState={{ longitude: 20, latitude: 20, zoom: 2 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        projection={projectionConfig}
        attributionControl={false}
        cursor={pinDropMode ? 'crosshair' : undefined}
        onClick={(e) => {
          if (pinDropMode && locationMode) {
            setUserLocation({ lat: e.lngLat.lat, lng: e.lngLat.lng });
            setUserLocationSource('pin');
            setPinDropMode(false);
            resumeRotationAfter.current = Date.now() + 15000;
          }
        }}
        // @ts-expect-error fog is a valid maplibre-gl prop not typed in react-map-gl
        fog={{
          color: '#080A0C',
          'high-color': '#0a0f18',
          'space-color': '#020406',
          'star-intensity': 0.4,
        } as any}
        onDragStart={() => {
          isInteractingRef.current = true;
          resumeRotationAfter.current = Date.now() + 5000;
        }}
        onDragEnd={() => {
          isInteractingRef.current = false;
        }}
        onMoveStart={() => { isInteractingRef.current = true; }}
        onMoveEnd={() => {
          isInteractingRef.current = false;
          resumeRotationAfter.current = Date.now() + 5000;
        }}
        onZoomStart={() => { isInteractingRef.current = true; }}
        onZoomEnd={() => {
          isInteractingRef.current = false;
          resumeRotationAfter.current = Date.now() + 5000;
        }}
      >
        {mainEvents.map(event => {
          // Hide the selected event's marker when zoomed in to avoid overlap
          if (selectedEvent && event.id === selectedEvent.id) return null;

          const color = getMarkerColor(event);
          const size = getMarkerSize(event.tier);
          const isCurrent = event.is_current;
          const sideCount = sideEventCounts[event.parent_event_id || ''] || sideEventCounts[event.id] || 0;
          const hasHex = sideCount > 0;

          // Hexagon size scales with tier
          const hexSize = hasHex ? (size === 6 ? 24 : size === 5 ? 22 : 20) : size;

          const pixelOffset = mainEventPixelOffsets[event.id];
          return (
            <Marker
              key={event.id}
              longitude={event.lng}
              latitude={event.lat}
              anchor="center"
              offset={pixelOffset}
              onClick={e => {
                e.originalEvent.stopPropagation();
                if (mapRef.current) {
                  mapRef.current.flyTo({
                    center: [event.lng, event.lat],
                    zoom: 10,
                    duration: 1500,
                  });
                  resumeRotationAfter.current = Date.now() + 10000;
                }
                setSelectedEvent(event);
                setViewfinderTab(null);
                setViewfinderSearch('');
              }}
            >
              <div
                onMouseEnter={() => {
                  isHoveringMarkerRef.current = true;
                  setHoveredEvent(event);
                  // Project lat/lng to screen coordinates for the overlay tooltip
                  if (mapRef.current) {
                    const pos = mapRef.current.project([event.lng, event.lat]);
                    setHoveredScreenPos({ x: pos.x, y: pos.y });
                  }
                }}
                onMouseLeave={() => {
                  isHoveringMarkerRef.current = false;
                  resumeRotationAfter.current = Date.now() + 7000;
                  setHoveredEvent(null);
                  setHoveredScreenPos(null);
                }}
              >
                {hasHex ? (
                  // Hexagon marker for events with side events
                  <div
                    className={isCurrent ? 'nomadz-pulse' : ''}
                    style={{ cursor: 'pointer', width: hexSize, height: hexSize }}
                  >
                    <svg
                      width={hexSize}
                      height={hexSize}
                      viewBox="0 0 32 32"
                      style={{ display: 'block', filter: `drop-shadow(0 0 6px ${color})` }}
                    >
                      <polygon
                        points="16,2 28,9 28,23 16,30 4,23 4,9"
                        fill={`${color}22`}
                        stroke={color}
                        strokeWidth="2"
                      />
                      <text
                        x="16"
                        y="21"
                        textAnchor="middle"
                        fontSize="12"
                        fontWeight="700"
                        fontFamily="'Space Grotesk', sans-serif"
                        fill={color}
                      >
                        {sideCount}
                      </text>
                    </svg>
                  </div>
                ) : (
                  // Plain dot for events without side events
                  <div
                    className={isCurrent ? 'nomadz-pulse' : ''}
                    style={{
                      width: size,
                      height: size,
                      borderRadius: '50%',
                      background: color,
                      boxShadow: `0 0 ${size * 2}px ${color}, 0 0 ${size * 4}px ${color}40`,
                      cursor: 'pointer',
                      transition: 'transform 0.15s',
                    }}
                  />
                )}
              </div>
            </Marker>
          );
        })}

        {/* Side event location markers — colored dots based on status */}
        {locationMode && selectedEvent && filteredSideEventsWithDistance
          .filter(se => hasVenueInfo(se as EventMarker))
          .map(se => {
            const isHovered = hoveredSideEventId === se.id;
            const color = se.is_past ? N.red : se.is_current ? N.blue : N.cyan;
            const isResolved = hasResolvedLocation(se as EventMarker);
            const coords = isResolved
              ? getEffectiveCoords(se as EventMarker)
              : getDisplayCoords(se as EventMarker);
            const isInRoute = routeStops.includes(se.id);
            const isFailed = geocodeFailedIds.has(se.id);
            // Don't show dot if stop marker will show in its place
            if (isInRoute) return null;
            const baseSize = isHovered ? 13 : 9;
            return (
              <Marker key={`side-${se.id}`} longitude={coords.lng} latitude={coords.lat} anchor="center">
                <div
                  onMouseEnter={() => {
                    markerTriggerRef.current = true;
                    setHoveredSideEventId(se.id);
                    if (mapRef.current) {
                      const pos = mapRef.current.project([coords.lng, coords.lat]);
                      setHoveredSideScreenPos({ x: pos.x, y: pos.y });
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredSideEventId(null);
                    setHoveredSideScreenPos(null);
                  }}
                  onClick={() => {
                    // Desktop: click marker to add/remove from route
                    // Skip if touch already handled this interaction
                    if (touchHandledRef.current) { touchHandledRef.current = false; return; }
                    if (isResolved && userLocation) {
                      toggleRouteStop(se.id);
                    }
                  }}
                  onTouchStart={() => {
                    touchHandledRef.current = true;
                    longPressTriggeredRef.current = false;
                    longPressTimerRef.current = setTimeout(() => {
                      longPressTriggeredRef.current = true;
                      // Long-press: add to route
                      if (isResolved && userLocation) {
                        toggleRouteStop(se.id);
                      }
                    }, 500);
                  }}
                  onTouchEnd={() => {
                    if (longPressTimerRef.current) {
                      clearTimeout(longPressTimerRef.current);
                      longPressTimerRef.current = null;
                    }
                    if (!longPressTriggeredRef.current) {
                      // Short tap: show tooltip + scroll to card
                      markerTriggerRef.current = true;
                      setHoveredSideEventId(prev => prev === se.id ? null : se.id);
                      if (mapRef.current) {
                        const pos = mapRef.current.project([coords.lng, coords.lat]);
                        setHoveredSideScreenPos({ x: pos.x, y: pos.y });
                      }
                    }
                  }}
                  onTouchMove={() => {
                    // Cancel long-press on drag
                    if (longPressTimerRef.current) {
                      clearTimeout(longPressTimerRef.current);
                      longPressTimerRef.current = null;
                    }
                  }}
                  style={{
                    width: Math.max(baseSize, 24),
                    height: Math.max(baseSize, 24),
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                  }}
                >
                  <div style={{
                    width: baseSize,
                    height: baseSize,
                    borderRadius: '50%',
                    background: isResolved
                      ? (isHovered ? color : `${color}cc`)
                      : 'transparent',
                    border: isResolved
                      ? 'none'
                      : `2px solid ${isFailed ? `${color}55` : (isHovered ? color : `${color}99`)}`,
                    boxShadow: isHovered
                      ? `0 0 12px ${color}, 0 0 24px ${color}60`
                      : `0 0 8px ${color}50`,
                    transition: 'all 0.2s ease',
                    animation: (isResolved || isFailed) ? 'none' : 'nomadz-ring-pulse 2s ease-in-out infinite',
                    pointerEvents: 'none',
                  }} />
                </div>
              </Marker>
            );
          })}

        {/* User location marker — blue pulsing dot */}
        {locationMode && userLocation && (
          <Marker longitude={userLocation.lng} latitude={userLocation.lat} anchor="center">
            <div style={{ position: 'relative', width: 16, height: 16 }}>
              <div style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: N.blue,
                border: '3px solid #FFFFFF',
                boxShadow: `0 0 12px ${N.blue}, 0 0 24px ${N.blue}40`,
              }} />
              <div className="nomadz-pulse" style={{
                position: 'absolute',
                top: -6,
                left: -6,
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: `2px solid ${N.blue}40`,
              }} />
            </div>
          </Marker>
        )}

        {/* Multi-stop route line on map */}
        {locationMode && multiStopRoute?.geometry && (
          <Source
            id="multi-route"
            type="geojson"
            data={{
              type: 'Feature' as const,
              properties: {},
              geometry: multiStopRoute.geometry,
            }}
          >
            <Layer
              id="multi-route-glow"
              type="line"
              paint={{
                'line-color': N.blue,
                'line-width': 10,
                'line-opacity': 0.15,
              }}
            />
            <Layer
              id="multi-route-line"
              type="line"
              paint={{
                'line-color': N.blue,
                'line-width': 4,
                'line-opacity': 0.85,
              }}
            />
          </Source>
        )}

        {/* Individual hover route line */}
        {locationMode && hoveredRouteGeometry && (
          <Source
            id="hover-route"
            type="geojson"
            data={{
              type: 'Feature' as const,
              properties: {},
              geometry: hoveredRouteGeometry,
            }}
          >
            <Layer
              id="hover-route-glow"
              type="line"
              paint={{
                'line-color': N.cyan,
                'line-width': 8,
                'line-opacity': 0.12,
              }}
            />
            <Layer
              id="hover-route-line"
              type="line"
              paint={{
                'line-color': N.cyan,
                'line-width': 3,
                'line-opacity': 0.7,
                'line-dasharray': [2, 1.5],
              }}
            />
          </Source>
        )}

        {/* Numbered stop markers on map */}
        {locationMode && routeStops.map((stopId, index) => {
          const stopEvent = filteredSideEventsWithDistance.find(e => e.id === stopId);
          if (!stopEvent || !hasResolvedLocation(stopEvent as EventMarker)) return null;
          const stopCoords = getEffectiveCoords(stopEvent as EventMarker);
          return (
            <Marker key={`stop-${stopId}`} longitude={stopCoords.lng} latitude={stopCoords.lat} anchor="center">
              <div style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: N.blue,
                border: '2px solid #FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: '#FFFFFF',
                fontFamily: "'Space Grotesk', sans-serif",
                boxShadow: `0 0 10px ${N.blue}, 0 0 20px ${N.blue}40`,
                zIndex: 10,
              }}>
                {index + 1}
              </div>
            </Marker>
          );
        })}
      </Map>

      {/* Pin drop banner */}
      {pinDropMode && (
        <div style={{
          position: 'absolute',
          top: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 16px',
          background: 'rgba(10,12,14,0.9)',
          border: `1px solid ${N.border}`,
          borderRadius: 8,
          color: N.textDim,
          fontSize: 12,
          fontFamily: "'Space Grotesk', sans-serif",
          whiteSpace: 'nowrap',
          zIndex: 400,
          pointerEvents: 'none',
          letterSpacing: 0.5,
        }}>
          Click the map to drop your pin
        </div>
      )}

      {/* Hover tooltip — rendered outside Map to avoid marker stacking context issues */}
      {hoveredEvent && hoveredScreenPos && (
        <div style={{
          position: 'absolute',
          left: hoveredScreenPos.x,
          top: hoveredScreenPos.y,
          transform: 'translate(-50%, -100%)',
          marginTop: -16,
          padding: '8px 12px',
          background: N.bgPanel,
          border: `1px solid ${N.border}`,
          borderRadius: 6,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          fontFamily: "'Space Grotesk', sans-serif",
          zIndex: 10000,
          minWidth: 140,
        }}>
          <div style={{ color: N.text, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
            {hoveredEvent.name}
          </div>
          <div style={{ color: N.textDim, fontSize: 11 }}>
            {formatDate(hoveredEvent.start_date)}
          </div>
          {(hoveredEvent.city || hoveredEvent.country) && (
            <div style={{ color: N.textMuted, fontSize: 11 }}>
              {[hoveredEvent.city, hoveredEvent.country].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Side event hover tooltip */}
      {hoveredSideEventId && hoveredSideScreenPos && (() => {
        const sideEvent = sideEvents.find(e => e.id === hoveredSideEventId);
        if (!sideEvent) return null;
        const rd = routeDistances[sideEvent.id];
        return (
          <div style={{
            position: 'absolute',
            left: hoveredSideScreenPos.x,
            top: hoveredSideScreenPos.y,
            transform: 'translate(-50%, -100%)',
            marginTop: -12,
            padding: '8px 12px',
            background: N.bgPanel,
            border: `1px solid ${N.border}`,
            borderRadius: 6,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            fontFamily: "'Space Grotesk', sans-serif",
            zIndex: 10000,
            minWidth: 160,
            maxWidth: 280,
          }}>
            <div style={{ color: N.text, fontSize: 12, fontWeight: 600, marginBottom: 2, whiteSpace: 'normal' }}>
              {sideEvent.name}
            </div>
            <div style={{ color: N.textDim, fontSize: 11 }}>
              {formatDate(sideEvent.start_date)}
              {sideEvent.event_time ? ` · ${sideEvent.event_time}` : ''}
            </div>
            {sideEvent.venue_name && sideEvent.venue_name !== 'TBA' && (
              <div style={{ color: N.textMuted, fontSize: 11 }}>{sideEvent.venue_name}</div>
            )}
            {rd && (
              <div style={{ color: N.blue, fontSize: 10, fontWeight: 600, marginTop: 2, letterSpacing: 0.3 }}>
                {formatDistance(rd.km)} · {formatDuration(estimateDuration(rd.km))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Loading */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: `${N.bg}cc`, fontFamily: "'Space Grotesk', sans-serif",
          color: N.text, fontSize: 14, letterSpacing: 2,
        }}>
          LOADING...
        </div>
      )}

      {/* Viewfinder — top right (hidden when detail panel is open) */}
      {!selectedEvent && (
        <div style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 450,
          fontFamily: "'Space Grotesk', sans-serif",
          width: isMobile ? 'calc(100vw - 32px)' : 340,
        }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex',
            background: 'rgba(10,12,14,0.9)',
            border: `1px solid ${N.border}`,
            borderRadius: viewfinderTab ? '8px 8px 0 0' : 8,
            overflow: 'hidden',
          }}>
            {(['upcoming', 'search'] as const).map(tab => {
              const isActive = viewfinderTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    if (viewfinderTab === tab) {
                      setViewfinderTab(null);
                      setViewfinderSearch('');
                    } else {
                      setViewfinderTab(tab);
                      if (tab === 'upcoming') setViewfinderSearch('');
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "'Space Grotesk', sans-serif",
                    letterSpacing: 1.5,
                    border: 'none',
                    cursor: 'pointer',
                    background: isActive ? '#FFFFFF' : 'transparent',
                    color: isActive ? '#000' : N.textDim,
                    transition: 'all 0.2s',
                    textTransform: 'uppercase',
                  }}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Dropdown */}
          {viewfinderTab && (
            <div style={{
              background: 'rgba(10,12,14,0.95)',
              border: `1px solid ${N.border}`,
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              maxHeight: isMobile ? '50vh' : 350,
              overflowY: 'auto',
            }}>
              {/* Search input */}
              {viewfinderTab === 'search' && (
                <div style={{ padding: '10px 12px 6px', borderBottom: `1px solid ${N.border}` }}>
                  <input
                    type="text"
                    placeholder="Search events..."
                    value={viewfinderSearch}
                    onChange={e => setViewfinderSearch(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 12,
                      fontFamily: "'Space Grotesk', sans-serif",
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${N.border}`,
                      borderRadius: 6,
                      color: N.text,
                      outline: 'none',
                      letterSpacing: 0.5,
                    }}
                  />
                </div>
              )}

              {/* Event list */}
              {(() => {
                const list = viewfinderTab === 'upcoming' ? upcomingEvents : viewfinderResults;
                if (list.length === 0) {
                  return (
                    <div style={{
                      padding: '24px 16px',
                      textAlign: 'center',
                      color: N.textMuted,
                      fontSize: 12,
                    }}>
                      {viewfinderTab === 'search' && !viewfinderSearch.trim()
                        ? 'Type to search events...'
                        : viewfinderTab === 'upcoming'
                          ? 'No upcoming events in the next 60 days'
                          : 'No events found'}
                    </div>
                  );
                }
                return list.map(event => (
                  <div
                    key={event.id}
                    onClick={() => handleViewfinderSelect(event)}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(80,216,216,0.06)';
                      (e.currentTarget as HTMLElement).style.borderLeft = `2px solid ${N.cyan}`;
                      (e.currentTarget as HTMLElement).style.paddingLeft = '10px';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                      (e.currentTarget as HTMLElement).style.borderLeft = '2px solid transparent';
                      (e.currentTarget as HTMLElement).style.paddingLeft = '10px';
                    }}
                    style={{
                      padding: '10px 12px 10px 10px',
                      cursor: 'pointer',
                      borderBottom: `1px solid ${N.border}`,
                      borderLeft: '2px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ color: N.text, fontSize: 12, fontWeight: 600, marginBottom: 3, lineHeight: 1.3 }}>
                      {event.name}
                    </div>
                    <div style={{ color: N.textDim, fontSize: 11, marginBottom: 2 }}>
                      {formatDate(event.start_date)}
                      {(event.city || event.country) && (
                        <span style={{ color: N.textMuted }}>
                          {' · '}{[event.city, event.country].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                    {event.tags && event.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                        {event.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            style={{
                              padding: '2px 6px',
                              fontSize: 9,
                              fontWeight: 600,
                              letterSpacing: 0.5,
                              background: 'rgba(255,255,255,0.06)',
                              border: `1px solid ${N.border}`,
                              borderRadius: 4,
                              color: N.textMuted,
                              textTransform: 'uppercase',
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* Controls — top right (or top right minus panel space on desktop) */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 400,
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        {/* Map/Globe pill toggle */}
        <div style={{
          display: 'flex',
          background: 'rgba(10,12,14,0.9)',
          border: `1px solid ${N.border}`,
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          {(['2d', 'globe'] as const).map(mode => {
            const isActive = projection === mode;
            return (
              <button
                key={mode}
                onClick={() => setProjection(mode)}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: 1,
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? '#FFFFFF' : 'transparent',
                  color: isActive ? '#000' : N.textDim,
                  transition: 'all 0.2s',
                }}
              >
                {mode === '2d' ? 'MAP' : 'GLOBE'}
              </button>
            );
          })}
        </div>

        {/* Labels toggle */}
        <button
          onClick={() => setShowLabels(v => !v)}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: 1,
            border: `1px solid ${N.border}`,
            borderRadius: 8,
            cursor: 'pointer',
            background: showLabels ? '#FFFFFF' : 'rgba(10,12,14,0.9)',
            color: showLabels ? '#000' : N.textDim,
            transition: 'all 0.2s',
          }}
        >
          LABELS {showLabels ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Legend — bottom left */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        display: 'flex',
        gap: 16,
        background: 'rgba(10,12,14,0.85)',
        border: `1px solid ${N.border}`,
        borderRadius: 8,
        padding: '8px 12px',
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 11,
        zIndex: 400,
      }}>
        {[
          { label: '< 30 Days', color: N.cyan },
          { label: '> 30 Days', color: '#FFFFFF' },
          { label: 'Now', color: N.blue },
          { label: 'Past', color: N.red },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, color: N.textDim }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
            {label}
          </div>
        ))}
      </div>

      {/* Powered by attribution */}
      <div style={{
        position: 'absolute', bottom: 8, right: 12,
        color: N.textMuted, fontSize: 9, fontFamily: "'Space Grotesk', sans-serif",
        letterSpacing: '0.5px', opacity: 0.6,
        zIndex: 400,
      }}>
        Powered by{' '}
        <a
          href="https://t.me/market_watching"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: N.textMuted, textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          Market Watching
        </a>
      </div>

      {/* Detail Panel */}
      {selectedEvent && (
        <div className="nomadz-panel" style={panelStyle}>
          {/* Panel header */}
          <div style={{
            padding: '16px 20px 12px',
            borderBottom: `1px solid ${N.border}`,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              {/* Event type badge */}
              {selectedEvent.event_type && (
                <div style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.08)',
                  border: `1px solid ${N.border}`,
                  color: N.cyan,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}>
                  {selectedEvent.event_type}
                </div>
              )}
              <div style={{ color: N.text, fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
                {selectedEvent.name}
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedEvent(null);
                if (mapRef.current) {
                  mapRef.current.flyTo({
                    center: [20, 20],
                    zoom: 2,
                    duration: 1500,
                  });
                }
              }}
              style={{
                background: 'none',
                border: `1px solid ${N.border}`,
                borderRadius: 6,
                color: N.textMuted,
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          {/* Event info */}
          <div style={{ padding: '16px 20px' }}>
            {/* Dates */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ color: N.textMuted, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                Date
              </div>
              <div style={{ color: N.text, fontSize: 13 }}>
                {formatDate(selectedEvent.start_date)}
                {selectedEvent.end_date && selectedEvent.end_date !== selectedEvent.start_date
                  ? ` — ${formatDate(selectedEvent.end_date)}`
                  : ''}
              </div>
              {selectedEvent.event_time && (
                <div style={{ color: N.textDim, fontSize: 12, marginTop: 2 }}>{selectedEvent.event_time}</div>
              )}
            </div>

            {/* Location */}
            {(selectedEvent.venue_name || selectedEvent.city || selectedEvent.country) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: N.textMuted, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Location
                </div>
                {selectedEvent.venue_name && (
                  <div style={{ color: N.text, fontSize: 13 }}>{selectedEvent.venue_name}</div>
                )}
                {selectedEvent.venue_address && (
                  <div style={{ color: N.textDim, fontSize: 12 }}>{selectedEvent.venue_address}</div>
                )}
                {(selectedEvent.city || selectedEvent.country) && (
                  <div style={{ color: N.textDim, fontSize: 12 }}>
                    {[selectedEvent.city, selectedEvent.country].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            {selectedEvent.description && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: N.textMuted, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                  About
                </div>
                <div style={{ color: N.textDim, fontSize: 13, lineHeight: 1.6 }}>
                  {selectedEvent.description.length > 300
                    ? `${selectedEvent.description.slice(0, 300)}...`
                    : selectedEvent.description}
                </div>
              </div>
            )}

            {/* Tags */}
            {selectedEvent.tags && selectedEvent.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedEvent.tags.map(tag => (
                  <span key={tag} style={{
                    padding: '2px 8px',
                    border: `1px solid ${N.border}`,
                    borderRadius: 6,
                    color: N.textDim,
                    fontSize: 11,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Sticky filter bar + side events */}
          {sideEvents.length > 0 && (
            <>
              <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                background: N.bgPanel,
                borderTop: `1px solid ${N.border}`,
                borderBottom: `1px solid ${N.border}`,
                padding: '12px 20px 8px',
              }}>
                {/* Header with count + clear */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}>
                  <div style={{ color: N.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Side Events ({filteredSideEvents.length}{hasActiveFilters ? ` / ${sideEvents.length}` : ''})
                  </div>
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      style={{
                        background: 'none',
                        border: `1px solid ${N.border}`,
                        borderRadius: 4,
                        color: N.textMuted,
                        cursor: 'pointer',
                        padding: '2px 8px',
                        fontSize: 10,
                        fontFamily: "'Space Grotesk', sans-serif",
                        letterSpacing: 0.5,
                      }}
                    >
                      CLEAR
                    </button>
                  )}
                </div>

                {/* Search */}
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={N.textMuted} strokeWidth="2"
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search events..."
                    style={{
                      width: '100%',
                      padding: '8px 10px 8px 32px',
                      background: 'rgba(255,255,255,0.05)',
                      border: `1px solid ${N.border}`,
                      borderRadius: 6,
                      color: N.text,
                      fontSize: 12,
                      fontFamily: "'Space Grotesk', sans-serif",
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Date chips */}
                <div
                  className="nomadz-datechips"
                  style={{
                    display: 'flex',
                    gap: 4,
                    overflowX: 'auto',
                    paddingBottom: 4,
                    marginBottom: 8,
                    scrollbarWidth: 'none',
                  }}
                >
                  {sideEventDates.map(date => {
                    const isSelected = selectedDates.has(date);
                    const d = new Date(date + 'T00:00:00');
                    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    return (
                      <button
                        key={date}
                        onClick={() => {
                          setSelectedDates(prev => {
                            const next = new Set(prev);
                            if (next.has(date)) next.delete(date);
                            else next.add(date);
                            return next;
                          });
                        }}
                        style={{
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: "'Space Grotesk', sans-serif",
                          border: `1px solid ${isSelected ? 'transparent' : N.border}`,
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: isSelected ? '#FFFFFF' : 'transparent',
                          color: isSelected ? '#000' : N.textDim,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          transition: 'all 0.15s',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Time range slider */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}>
                    <span style={{ color: N.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                      Time
                    </span>
                    <span style={{ color: N.textDim, fontSize: 11 }}>
                      {formatHour(timeRangeStart)} – {formatHour(timeRangeEnd)}
                    </span>
                  </div>
                  <div style={{ position: 'relative', height: 20 }}>
                    {/* Track background */}
                    <div style={{
                      position: 'absolute',
                      top: 8,
                      left: 0,
                      right: 0,
                      height: 4,
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: 2,
                    }} />
                    {/* Active range highlight */}
                    <div style={{
                      position: 'absolute',
                      top: 8,
                      left: `${(timeRangeStart / 24) * 100}%`,
                      right: `${100 - (timeRangeEnd / 24) * 100}%`,
                      height: 4,
                      background: 'linear-gradient(90deg, #3B82D9, #50D8D8, #4DEBB5)',
                      borderRadius: 2,
                    }} />
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={1}
                      value={timeRangeStart}
                      onChange={e => {
                        const v = Number(e.target.value);
                        if (v < timeRangeEnd) setTimeRangeStart(v);
                      }}
                      className="nomadz-slider"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: 20,
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        background: 'transparent',
                        pointerEvents: 'none',
                        zIndex: 3,
                      }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={1}
                      value={timeRangeEnd}
                      onChange={e => {
                        const v = Number(e.target.value);
                        if (v > timeRangeStart) setTimeRangeEnd(v);
                      }}
                      className="nomadz-slider"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: 20,
                        WebkitAppearance: 'none',
                        appearance: 'none',
                        background: 'transparent',
                        pointerEvents: 'none',
                        zIndex: 4,
                      }}
                    />
                  </div>
                </div>

                {/* Location bar */}
                <div style={{ marginTop: 8, borderTop: `1px solid ${N.border}`, paddingTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {/* FIND ROUTES toggle */}
                    <button
                      onClick={() => {
                        const next = !locationMode;
                        setLocationMode(next);
                        if (next) {
                          // Auto-fit map to show all side events with venue info
                          const locatable = sideEvents.filter(se => hasVenueInfo(se));
                          if (locatable.length > 0 && mapRef.current) {
                            let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
                            locatable.forEach(se => {
                              const c = hasResolvedLocation(se)
                                ? getEffectiveCoords(se)
                                : getDisplayCoords(se);
                              if (c.lng < minLng) minLng = c.lng;
                              if (c.lng > maxLng) maxLng = c.lng;
                              if (c.lat < minLat) minLat = c.lat;
                              if (c.lat > maxLat) maxLat = c.lat;
                            });
                            mapRef.current.fitBounds(
                              [[minLng, minLat], [maxLng, maxLat]],
                              { padding: 60, duration: 1500, maxZoom: 14 }
                            );
                            resumeRotationAfter.current = Date.now() + 15000;
                          }
                        } else {
                          setUserLocation(null);
                          setUserLocationSource(null);
                          setPinDropMode(false);
                          setAddressQuery('');
                          setAddressResults([]);
                          setRouteDistances({});
                          setHoveredSideEventId(null);
                          setRouteStops([]);
                          setMultiStopRoute(null);
                        }
                      }}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: "'Space Grotesk', sans-serif",
                        border: `1px solid ${locationMode ? 'transparent' : N.border}`,
                        borderRadius: 4,
                        cursor: 'pointer',
                        background: locationMode ? '#FFFFFF' : 'transparent',
                        color: locationMode ? '#000' : N.textDim,
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s',
                      }}
                    >
                      FIND ROUTES
                    </button>

                    {locationMode && (
                      <>
                        {/* MY LOCATION button */}
                        <button
                          onClick={requestGeolocation}
                          disabled={geoLoading}
                          style={{
                            padding: '4px 8px',
                            fontSize: 10,
                            fontWeight: 600,
                            fontFamily: "'Space Grotesk', sans-serif",
                            border: `1px solid ${userLocationSource === 'gps' ? N.blue : N.border}`,
                            borderRadius: 4,
                            cursor: geoLoading ? 'wait' : 'pointer',
                            background: userLocationSource === 'gps' ? `${N.blue}22` : 'transparent',
                            color: userLocationSource === 'gps' ? N.blue : N.textDim,
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s',
                            opacity: geoLoading ? 0.6 : 1,
                          }}
                        >
                          {geoLoading ? 'LOCATING...' : 'MY LOCATION'}
                        </button>

                        {/* DROP PIN button */}
                        <button
                          onClick={() => setPinDropMode(!pinDropMode)}
                          style={{
                            padding: '4px 8px',
                            fontSize: 10,
                            fontWeight: 600,
                            fontFamily: "'Space Grotesk', sans-serif",
                            border: `1px solid ${pinDropMode ? N.blue : userLocationSource === 'pin' ? N.blue : N.border}`,
                            borderRadius: 4,
                            cursor: 'pointer',
                            background: pinDropMode ? `${N.blue}22` : userLocationSource === 'pin' ? `${N.blue}22` : 'transparent',
                            color: pinDropMode ? N.blue : userLocationSource === 'pin' ? N.blue : N.textDim,
                            whiteSpace: 'nowrap',
                            transition: 'all 0.15s',
                          }}
                        >
                          {pinDropMode ? 'PLACING...' : 'DROP PIN'}
                        </button>

                        {/* Clear location */}
                        {userLocation && (
                          <button
                            onClick={() => {
                              setUserLocation(null);
                              setUserLocationSource(null);
                              setRouteDistances({});
                              setRouteStops([]);
                              setMultiStopRoute(null);
                            }}
                            style={{
                              padding: '4px 6px',
                              fontSize: 10,
                              fontFamily: "'Space Grotesk', sans-serif",
                              border: `1px solid ${N.border}`,
                              borderRadius: 4,
                              cursor: 'pointer',
                              background: 'transparent',
                              color: N.textMuted,
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Geo error */}
                  {geoError && (
                    <div style={{ color: N.red, fontSize: 10, marginTop: 4 }}>{geoError}</div>
                  )}

                  {/* Address search */}
                  {locationMode && (
                    <div style={{ position: 'relative', marginTop: 6 }}>
                      <svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={N.textMuted} strokeWidth="2.5"
                        style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                      >
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                        <circle cx="12" cy="9" r="2.5" />
                      </svg>
                      <input
                        type="text"
                        value={addressQuery}
                        onChange={e => setAddressQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') searchAddress(addressQuery); }}
                        placeholder="Search address..."
                        style={{
                          width: '100%',
                          padding: '6px 8px 6px 26px',
                          background: 'rgba(255,255,255,0.05)',
                          border: `1px solid ${N.border}`,
                          borderRadius: 6,
                          color: N.text,
                          fontSize: 11,
                          fontFamily: "'Space Grotesk', sans-serif",
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      {addressLoading && (
                        <div style={{ color: N.textMuted, fontSize: 10, marginTop: 4 }}>Searching...</div>
                      )}
                      {/* Address results dropdown */}
                      {addressResults.length > 0 && (
                        <div
                          className="nomadz-addr-results"
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            marginTop: 4,
                            background: N.bgPanel,
                            border: `1px solid ${N.border}`,
                            borderRadius: 6,
                            maxHeight: 160,
                            overflowY: 'auto',
                            zIndex: 20,
                          }}
                        >
                          {addressResults.map((r, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                setUserLocation({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
                                setUserLocationSource('search');
                                setAddressResults([]);
                                setAddressQuery(r.display_name.split(',').slice(0, 2).join(','));
                                if (mapRef.current) {
                                  mapRef.current.flyTo({
                                    center: [parseFloat(r.lon), parseFloat(r.lat)],
                                    zoom: 14,
                                    duration: 1500,
                                  });
                                }
                              }}
                              style={{
                                display: 'block',
                                width: '100%',
                                padding: '8px 10px',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: `1px solid ${N.border}`,
                                color: N.text,
                                fontSize: 11,
                                fontFamily: "'Space Grotesk', sans-serif",
                                textAlign: 'left',
                                cursor: 'pointer',
                                lineHeight: 1.3,
                              }}
                              onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.background = 'transparent';
                              }}
                            >
                              {r.display_name.length > 80 ? r.display_name.slice(0, 80) + '...' : r.display_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status line */}
                  {locationMode && userLocation && (
                    <div style={{ color: N.textMuted, fontSize: 10, marginTop: 4, letterSpacing: 0.3 }}>
                      Sorting by distance
                      {routeLoading ? ` · Loading routes (${routesFetched}/${routesTotal})...` : ''}
                      {geocodingProgress ? ` · Locating venues (${geocodingProgress.done}/${geocodingProgress.total})...` : ''}
                    </div>
                  )}
                  {locationMode && !userLocation && (
                    <div style={{ color: N.textMuted, fontSize: 10, marginTop: 4, letterSpacing: 0.3 }}>
                      {sideEvents.filter(se => hasVenueInfo(se)).length} events with known venues
                      {geocodingProgress ? ` · Locating venues (${geocodingProgress.done}/${geocodingProgress.total})...` : ' shown on map'}
                    </div>
                  )}
                </div>
              </div>

              {/* Multi-stop route summary bar */}
              {routeStops.length > 0 && (
                <div style={{
                  padding: '10px 20px',
                  background: `${N.blue}12`,
                  borderBottom: `1px solid ${N.blue}40`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ color: N.blue, fontSize: 10, fontWeight: 600, letterSpacing: 1 }}>
                      ROUTE ({routeStops.length} STOP{routeStops.length > 1 ? 'S' : ''})
                      {multiStopLoading ? ' · CALCULATING...' : ''}
                    </div>
                    <button
                      onClick={() => { setRouteStops([]); setMultiStopRoute(null); }}
                      style={{
                        background: 'none',
                        border: `1px solid ${N.blue}40`,
                        borderRadius: 4,
                        color: N.blue,
                        cursor: 'pointer',
                        padding: '2px 6px',
                        fontSize: 10,
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontWeight: 600,
                      }}
                    >
                      CLEAR
                    </button>
                  </div>
                  <Reorder.Group
                    axis="y"
                    values={routeStops}
                    onReorder={setRouteStops}
                    as="div"
                    style={{ listStyle: 'none', padding: 0, margin: 0 }}
                  >
                    {routeStops.map((stopId, i) => {
                      const stopEvent = filteredSideEventsWithDistance.find(e => e.id === stopId);
                      if (!stopEvent) return null;
                      const leg = multiStopRoute?.legs.find(l => l.to === stopId);
                      return (
                        <Reorder.Item
                          key={stopId}
                          value={stopId}
                          as="div"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                            cursor: 'grab', userSelect: 'none', padding: '4px 6px',
                            borderRadius: 4, background: 'transparent',
                            touchAction: 'none',
                          }}
                          whileDrag={{
                            scale: 1.03,
                            boxShadow: `0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px ${N.blue}60`,
                            background: N.bgPanel,
                            cursor: 'grabbing',
                            zIndex: 10,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="8" height="12" viewBox="0 0 8 12" style={{ opacity: 0.4, flexShrink: 0 }}>
                              <circle cx="2" cy="2" r="1" fill={N.textDim} />
                              <circle cx="6" cy="2" r="1" fill={N.textDim} />
                              <circle cx="2" cy="6" r="1" fill={N.textDim} />
                              <circle cx="6" cy="6" r="1" fill={N.textDim} />
                              <circle cx="2" cy="10" r="1" fill={N.textDim} />
                              <circle cx="6" cy="10" r="1" fill={N.textDim} />
                            </svg>
                            <div style={{
                              width: 18, height: 18, borderRadius: '50%',
                              background: N.blue, color: '#FFF',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700, flexShrink: 0,
                              fontFamily: "'Space Grotesk', sans-serif",
                            }}>
                              {i + 1}
                            </div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: N.text, fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {stopEvent.name}
                            </div>
                          </div>
                          {leg ? (
                            <div style={{ color: N.blue, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {formatDistance(leg.km)} · {formatDuration(estimateDuration(leg.km))}
                            </div>
                          ) : stopEvent.distance !== null ? (
                            <div style={{ color: N.textMuted, fontSize: 10, whiteSpace: 'nowrap' }}>
                              ~{formatDistance(stopEvent.distance)}
                            </div>
                          ) : null}
                        </Reorder.Item>
                      );
                    })}
                  </Reorder.Group>
                  {multiStopRoute && (
                    <div style={{
                      borderTop: `1px solid ${N.blue}30`,
                      marginTop: 6,
                      paddingTop: 6,
                      color: N.blue,
                      fontSize: 12,
                      fontWeight: 700,
                    }}>
                      Total: {formatDistance(multiStopRoute.totalKm)} · {formatDuration(estimateDuration(multiStopRoute.totalKm))} {MODE_LABELS[travelMode]}
                    </div>
                  )}
                </div>
              )}

              {/* Travel mode selector */}
              {locationMode && userLocation && (
                <div style={{ padding: '4px 20px 0', display: 'flex', alignItems: 'center', gap: 2 }}>
                  {([
                    { mode: 'car' as TravelMode, label: 'Drive', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 17h14M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1l2-3h8l2 3h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2M5 17v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1m8 0v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1" />
                        <circle cx="7.5" cy="13" r="1.5" />
                        <circle cx="16.5" cy="13" r="1.5" />
                      </svg>
                    )},
                    { mode: 'foot' as TravelMode, label: 'Walk', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="4.5" r="2" />
                        <path d="M13.5 8.5l2 3.5-3 1 1.5 5.5M10.5 8.5l-2 3.5 3 1-1.5 5.5" />
                      </svg>
                    )},
                    { mode: 'bike' as TravelMode, label: 'Bike', icon: (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="6" cy="17" r="3" />
                        <circle cx="18" cy="17" r="3" />
                        <path d="M6 17l3-7h4l2.5 4.5M12 10l-1.5-3h4" />
                      </svg>
                    )},
                  ]).map(({ mode, label, icon }) => (
                    <button
                      key={mode}
                      onClick={() => setTravelMode(mode)}
                      title={label}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 24, borderRadius: 4,
                        background: travelMode === mode ? `${N.blue}20` : 'transparent',
                        color: travelMode === mode ? N.blue : N.textMuted,
                        border: 'none', cursor: 'pointer', padding: 0,
                        transition: 'all 0.15s',
                      }}
                    >
                      {icon}
                    </button>
                  ))}
                  <span style={{ color: N.textMuted, fontSize: 9, marginLeft: 4, letterSpacing: 0.5 }}>
                    {MODE_LABELS[travelMode].toUpperCase()}
                  </span>
                </div>
              )}

              {/* Side event cards */}
              <div style={{ padding: '8px 20px 16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredSideEventsWithDistance.map(se => {
                    const isPast = se.is_past;
                    const hasLink = !!se.registration_url && !isPast;
                    const isCardHovered = hoveredSideEventId === se.id;
                    const routeData = routeDistances[se.id];
                    const hasLoc = hasVenueInfo(se as EventMarker);
                    const isResolved = hasResolvedLocation(se as EventMarker);
                    const isPending = isPendingGeocode(se as EventMarker);
                    const canShowRoute = locationMode && userLocation && hasLoc;
                    const stopIndex = routeStops.indexOf(se.id);
                    const isInRoute = stopIndex !== -1;
                    return (
                      <a
                        key={se.id}
                        id={`card-${se.id}`}
                        href={canShowRoute && (isResolved || isPending) ? undefined : hasLink ? se.registration_url! : undefined}
                        target={canShowRoute && (isResolved || isPending) ? undefined : hasLink ? '_blank' : undefined}
                        rel={canShowRoute && (isResolved || isPending) ? undefined : hasLink ? 'noopener noreferrer' : undefined}
                        onClick={e => {
                          if (canShowRoute && isResolved) {
                            e.preventDefault();
                            toggleRouteStop(se.id);
                          } else if (canShowRoute && isPending) {
                            e.preventDefault();
                          } else if (!hasLink) {
                            e.preventDefault();
                          }
                        }}
                        style={{
                          display: 'block',
                          padding: '8px 10px',
                          background: isInRoute
                            ? `${N.blue}15`
                            : isCardHovered ? 'rgba(80,216,216,0.06)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isInRoute ? N.blue : N.border}`,
                          borderRadius: 6,
                          textDecoration: 'none',
                          cursor: canShowRoute || hasLink ? 'pointer' : 'default',
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = N.cyan;
                          (e.currentTarget as HTMLElement).style.background = 'rgba(80,216,216,0.06)';
                          if (locationMode) { setHoveredSideEventId(se.id); setHoveredSideScreenPos(null); }
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = isInRoute ? N.blue : N.border;
                          (e.currentTarget as HTMLElement).style.background = isInRoute ? `${N.blue}15` : 'rgba(255,255,255,0.03)';
                          if (locationMode) { setHoveredSideEventId(null); setHoveredSideScreenPos(null); }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {isInRoute && (
                            <div style={{
                              width: 18, height: 18, borderRadius: '50%',
                              background: N.blue, color: '#FFF',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700, flexShrink: 0,
                              fontFamily: "'Space Grotesk', sans-serif",
                            }}>
                              {stopIndex + 1}
                            </div>
                          )}
                          <div style={{ color: isPast ? N.textMuted : N.text, fontSize: 12, fontWeight: 600 }}>{se.name}</div>
                        </div>
                        <div style={{ color: N.textMuted, fontSize: 11, marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>
                            {formatDate(se.start_date)}
                            {se.event_time ? ` · ${se.event_time}` : ''}
                            {se.venue_name ? ` · ${se.venue_name}` : ''}
                          </span>
                          {locationMode && userLocation && hasLoc && (
                            isPending ? (
                              <span style={{ color: N.textMuted, fontSize: 10, fontStyle: 'italic', whiteSpace: 'nowrap', marginLeft: 8 }}>
                                Locating...
                              </span>
                            ) : isResolved ? (
                              <span style={{ color: N.blue, fontWeight: 600, fontSize: 10, letterSpacing: 0.5, whiteSpace: 'nowrap', marginLeft: 8 }}>
                                {routeData
                                  ? `${formatDistance(routeData.km)} · ${formatDuration(estimateDuration(routeData.km))}`
                                  : se.distance !== null
                                    ? `~${formatDistance(se.distance)} · ~${formatDuration(estimateDuration(se.distance))}`
                                    : ''}
                              </span>
                            ) : se.distance !== null ? (
                              <span style={{ color: N.textMuted, fontSize: 10, whiteSpace: 'nowrap', marginLeft: 8 }}>
                                ~{formatDistance(se.distance)} (area)
                              </span>
                            ) : null
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                          {canShowRoute && isResolved ? (
                            <div style={{ fontSize: 10, letterSpacing: 0.5, color: isInRoute ? N.blue : '#FFFFFF', fontWeight: 600 }}>
                              {isInRoute ? `STOP ${stopIndex + 1} · REMOVE` : routeStops.length >= 10 ? 'MAX STOPS REACHED' : 'ADD TO ROUTE +'}
                            </div>
                          ) : canShowRoute && isPending ? (
                            <div style={{ fontSize: 10, letterSpacing: 0.5, color: N.textMuted, fontStyle: 'italic' }}>
                              Locating venue...
                            </div>
                          ) : locationMode && userLocation && !isResolved && !isPending ? (
                            <div style={{ fontSize: 10, letterSpacing: 0.5, color: N.textMuted, fontWeight: 500 }}>
                              No route info
                            </div>
                          ) : se.registration_url ? (
                            isPast ? (
                              <div style={{ fontSize: 10, letterSpacing: 0.5, color: N.textMuted, fontWeight: 600 }}>
                                PAST
                              </div>
                            ) : (
                              <div style={{
                                fontSize: 10,
                                letterSpacing: 0.5,
                                color: N.cyan,
                                fontWeight: 700,
                              }}>
                                RSVP →
                              </div>
                            )
                          ) : null}
                        </div>
                      </a>
                    );
                  })}
                  {filteredSideEventsWithDistance.length === 0 && hasActiveFilters && (
                    <div style={{
                      padding: '20px 0',
                      textAlign: 'center',
                      color: N.textMuted,
                      fontSize: 12,
                    }}>
                      No events match your filters
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* CTA */}
          <div style={{ padding: '0 20px 16px' }}>
            {selectedEvent.registration_url && (
              selectedEvent.is_past ? (
                <div
                  style={{
                    display: 'block',
                    padding: '12px 20px',
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    color: N.textMuted,
                    fontWeight: 700,
                    fontSize: 13,
                    textAlign: 'center',
                    letterSpacing: 0.5,
                    cursor: 'default',
                  }}
                >
                  Event Ended
                </div>
              ) : (
                <a
                  href={selectedEvent.registration_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    padding: '12px 20px',
                    background: '#FFFFFF',
                    borderRadius: 10,
                    color: '#000',
                    fontWeight: 700,
                    fontSize: 13,
                    textAlign: 'center',
                    textDecoration: 'none',
                    letterSpacing: 1,
                  }}
                >
                  Register →
                </a>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
