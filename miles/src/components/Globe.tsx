'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import createGlobe from 'cobe';
import { motion, AnimatePresence } from 'framer-motion';
import { Reorder } from 'framer-motion';

// ── Types ────────────────────────────────────────────────────────────────────

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

type TravelMode = 'car' | 'foot' | 'bike';

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TRAVEL_SPEEDS: Record<TravelMode, number> = { car: 30, foot: 5, bike: 15 };

// ── Utility ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
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
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
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

function getCountryFlag(country: string | null): string {
  if (!country) return '🌍';
  const map: Record<string, string> = {
    'United States': '🇺🇸', 'USA': '🇺🇸', 'US': '🇺🇸',
    'United Kingdom': '🇬🇧', 'UK': '🇬🇧', 'England': '🇬🇧',
    'Germany': '🇩🇪', 'France': '🇫🇷', 'Japan': '🇯🇵',
    'South Korea': '🇰🇷', 'Korea': '🇰🇷',
    'Singapore': '🇸🇬',
    'United Arab Emirates': '🇦🇪', 'UAE': '🇦🇪',
    'Netherlands': '🇳🇱', 'Switzerland': '🇨🇭',
    'Canada': '🇨🇦', 'Australia': '🇦🇺',
    'Thailand': '🇹🇭', 'Vietnam': '🇻🇳',
    'China': '🇨🇳', 'Hong Kong': '🇭🇰', 'Taiwan': '🇹🇼',
    'India': '🇮🇳', 'Indonesia': '🇮🇩', 'Malaysia': '🇲🇾',
    'Philippines': '🇵🇭', 'Spain': '🇪🇸', 'Italy': '🇮🇹',
    'Portugal': '🇵🇹', 'Brazil': '🇧🇷', 'Argentina': '🇦🇷',
    'Mexico': '🇲🇽', 'Turkey': '🇹🇷', 'Poland': '🇵🇱',
    'Czech Republic': '🇨🇿', 'Czechia': '🇨🇿', 'Georgia': '🇬🇪',
    'Ukraine': '🇺🇦', 'Russia': '🇷🇺', 'Saudi Arabia': '🇸🇦',
    'Nigeria': '🇳🇬', 'South Africa': '🇿🇦', 'Kenya': '🇰🇪',
    'Israel': '🇮🇱', 'Greece': '🇬🇷', 'Austria': '🇦🇹',
    'Belgium': '🇧🇪', 'Denmark': '🇩🇰', 'Sweden': '🇸🇪',
    'Norway': '🇳🇴', 'Finland': '🇫🇮', 'Ireland': '🇮🇪',
    'New Zealand': '🇳🇿', 'Colombia': '🇨🇴', 'Chile': '🇨🇱',
    'Peru': '🇵🇪', 'Panama': '🇵🇦', 'Puerto Rico': '🇵🇷',
    'Malta': '🇲🇹', 'Cyprus': '🇨🇾', 'Estonia': '🇪🇪',
    'Lithuania': '🇱🇹', 'Latvia': '🇱🇻', 'Croatia': '🇭🇷',
    'Serbia': '🇷🇸', 'Romania': '🇷🇴', 'Hungary': '🇭🇺',
    'Slovakia': '🇸🇰', 'Slovenia': '🇸🇮', 'Bulgaria': '🇧🇬',
    'Kazakhstan': '🇰🇿', 'Bahrain': '🇧🇭', 'Kuwait': '🇰🇼',
    'Qatar': '🇶🇦', 'El Salvador': '🇸🇻', 'Guatemala': '🇬🇹',
    'Costa Rica': '🇨🇷', 'Jamaica': '🇯🇲', 'Egypt': '🇪🇬',
    'Morocco': '🇲🇦', 'Tunisia': '🇹🇳', 'Rwanda': '🇷🇼',
    'Ghana': '🇬🇭', 'Ethiopia': '🇪🇹', 'Tanzania': '🇹🇿',
    'Ecuador': '🇪🇨', 'Venezuela': '🇻🇪', 'Bolivia': '🇧🇴',
    'Paraguay': '🇵🇾', 'Uruguay': '🇺🇾', 'Honduras': '🇭🇳',
    'Nicaragua': '🇳🇮', 'Bahamas': '🇧🇸', 'Cayman Islands': '🇰🇾',
    'Luxembourg': '🇱🇺', 'Iceland': '🇮🇸', 'Albania': '🇦🇱',
    'North Macedonia': '🇲🇰', 'Bosnia': '🇧🇦', 'Montenegro': '🇲🇪',
    'Kosovo': '🇽🇰', 'Uzbekistan': '🇺🇿', 'Azerbaijan': '🇦🇿',
    'Armenia': '🇦🇲', 'Belarus': '🇧🇾', 'Moldova': '🇲🇩',
    'Kyrgyzstan': '🇰🇬',
  };
  const trimmed = country.trim();
  if (map[trimmed]) return map[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === lower) return v;
  }
  return '🌍';
}

function hasSpecificLocation(event: EventMarker, mainEvent?: EventMarker | null): boolean {
  const isTBA = !event.venue_name || event.venue_name === 'TBA';
  if (isTBA) return false;
  if (mainEvent) {
    const TOL = 0.001;
    if (Math.abs(event.lat - mainEvent.lat) < TOL && Math.abs(event.lng - mainEvent.lng) < TOL) return false;
  }
  return true;
}

function hasVenueAddress(event: EventMarker): boolean {
  return !!event.venue_address && event.venue_address.trim().length > 0 && event.venue_address !== 'TBA';
}

function latLngToXYZ(lat: number, lng: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return [
    -(Math.sin(phi) * Math.cos(theta)),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ];
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function Globe({ initialEvents = [] }: { initialEvents?: EventMarker[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const phiRef = useRef(0);
  const thetaRef = useRef(0.3);
  const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);
  const rotatingRef = useRef(true);
  const resumeAfterRef = useRef<number | null>(null);

  const theme = 'dark' as const;
  const stickerLayerRef = useRef<HTMLDivElement>(null);
  const stickerRafRef = useRef<number>(0);
  const selectedEventIdRef = useRef<string | null>(null);

  const [events, setEvents] = useState<EventMarker[]>(initialEvents);
  const [loading, setLoading] = useState(initialEvents.length === 0);
  const [selectedEvent, setSelectedEvent] = useState<EventMarker | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [globeSize, setGlobeSize] = useState(600);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Viewfinder
  const [viewfinderTab, setViewfinderTab] = useState<'upcoming' | 'search' | null>(null);
  const [viewfinderSearch, setViewfinderSearch] = useState('');

  // Filters (side events panel)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [timeRangeStart, setTimeRangeStart] = useState(0);
  const [timeRangeEnd, setTimeRangeEnd] = useState(24);

  // Location mode
  const [travelMode, setTravelMode] = useState<TravelMode>('car');
  const [locationMode, setLocationMode] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userLocationSource, setUserLocationSource] = useState<'gps' | 'pin' | 'search' | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pinDropMode, setPinDropMode] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressResults, setAddressResults] = useState<NominatimResult[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [routeDistances, setRouteDistances] = useState<Record<string, { km: number; duration: number }>>({});
  const [routeLoading, setRouteLoading] = useState(false);
  const [routesFetched, setRoutesFetched] = useState(0);
  const [routesTotal, setRoutesTotal] = useState(0);
  const [routeStops, setRouteStops] = useState<string[]>([]);
  const [multiStopRoute, setMultiStopRoute] = useState<{
    legs: Array<{ from: string; to: string; km: number; duration: number }>;
    totalKm: number;
    totalDuration: number;
  } | null>(null);
  const [multiStopLoading, setMultiStopLoading] = useState(false);
  const [geocodedCoords, setGeocodedCoords] = useState<Record<string, { lat: number; lng: number }>>({});
  const [geocodingProgress, setGeocodingProgress] = useState<{ done: number; total: number } | null>(null);
  const [geocodeFailedIds, setGeocodeFailedIds] = useState<Set<string>>(new Set());
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);

  // ── Theme (dark-only) ─────────────────────────────────────────────────────

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const T = useMemo(() => ({
    bg: theme === 'dark' ? '#080A0C' : '#f5f4f0',
    bgPanel: theme === 'dark' ? 'rgba(10,12,14,0.97)' : 'rgba(245,244,240,0.97)',
    bgInput: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    text: theme === 'dark' ? '#ffffff' : '#0d0d0d',
    textDim: theme === 'dark' ? 'rgba(255,255,255,0.6)' : 'rgba(13,13,13,0.6)',
    textMuted: theme === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(13,13,13,0.35)',
    border: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    accent: theme === 'dark' ? '#50D8D8' : '#1a6b8a',
    accent2: theme === 'dark' ? '#50B1D8' : '#1a8a6b',
    red: theme === 'dark' ? '#FF6B6B' : '#c0392b',
    accentGlow: theme === 'dark' ? 'rgba(80,216,216,0.25)' : 'rgba(26,107,138,0.2)',
  }), [theme]);

  // ── Responsive ────────────────────────────────────────────────────────────

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsMobile(w < 768);
      setContainerSize({ w, h });
      const minDim = Math.min(w, h);
      setGlobeSize(Math.round(minDim * (w < 768 ? 1.1 : 1.2)));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Events are passed as initialEvents prop (server-side fetched)

  // ── Derived Data ──────────────────────────────────────────────────────────

  const mainEvents = useMemo(() => events.filter(e => !e.is_side_event), [events]);

  const sideEvents = useMemo(() => {
    if (!selectedEvent || selectedEvent.is_side_event) return [];
    const parentId = selectedEvent.parent_event_id;
    if (!parentId) return [];
    return events
      .filter(e => e.is_side_event && e.parent_event_id === parentId)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }, [selectedEvent, events]);

  const sideEventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => {
      if (e.is_side_event && e.parent_event_id)
        counts[e.parent_event_id] = (counts[e.parent_event_id] || 0) + 1;
    });
    return counts;
  }, [events]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 60);
    return mainEvents
      .filter(e => { const s = new Date(e.start_date); return s >= now && s <= cutoff; })
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }, [mainEvents]);

  const viewfinderResults = useMemo(() => {
    if (!viewfinderSearch.trim()) return mainEvents;
    const q = viewfinderSearch.toLowerCase().trim();
    return mainEvents.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.city || '').toLowerCase().includes(q) ||
      (e.country || '').toLowerCase().includes(q) ||
      (e.tags || []).join(' ').toLowerCase().includes(q)
    );
  }, [mainEvents, viewfinderSearch]);

  const sideEventDates = useMemo(() => {
    return [...new Set(sideEvents.map(e => e.start_date))].sort();
  }, [sideEvents]);

  const filteredSideEvents = useMemo(() => {
    let result = sideEvents;
    if (searchQuery) result = result.filter(e => e.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (selectedDates.size > 0) result = result.filter(e => selectedDates.has(e.start_date));
    if (timeRangeStart !== 0 || timeRangeEnd !== 24) {
      result = result.filter(e => {
        const hour = parseStartHour(e.event_time);
        if (hour === null) return true;
        return hour >= timeRangeStart && hour <= timeRangeEnd;
      });
    }
    return result;
  }, [sideEvents, searchQuery, selectedDates, timeRangeStart, timeRangeEnd]);

  const jitterOffsets = useMemo(() => {
    const offsets: Record<string, { lat: number; lng: number }> = {};
    sideEvents.forEach(se => {
      let hash = 0;
      for (let i = 0; i < se.id.length; i++) { hash = ((hash << 5) - hash) + se.id.charCodeAt(i); hash |= 0; }
      offsets[se.id] = {
        lat: (((hash & 0xFF) / 255) * 2 - 1) * 0.002,
        lng: ((((hash >> 8) & 0xFF) / 255) * 2 - 1) * 0.002,
      };
    }, []);
    return offsets;
  }, [sideEvents]);

  const getEffectiveCoords = useCallback((event: EventMarker) => {
    return geocodedCoords[event.id] || { lat: event.lat, lng: event.lng };
  }, [geocodedCoords]);

  const getDisplayCoords = useCallback((event: EventMarker) => {
    if (geocodedCoords[event.id]) return geocodedCoords[event.id];
    if (hasSpecificLocation(event, selectedEvent)) return { lat: event.lat, lng: event.lng };
    if (selectedEvent && jitterOffsets[event.id]) {
      return { lat: selectedEvent.lat + jitterOffsets[event.id].lat, lng: selectedEvent.lng + jitterOffsets[event.id].lng };
    }
    return { lat: event.lat, lng: event.lng };
  }, [geocodedCoords, selectedEvent, jitterOffsets]);

  const hasResolvedLocation = useCallback((event: EventMarker) => {
    if (geocodedCoords[event.id]) return true;
    return hasSpecificLocation(event, selectedEvent);
  }, [geocodedCoords, selectedEvent]);

  const hasVenueInfo = useCallback((event: EventMarker) => {
    if (geocodedCoords[event.id]) return true;
    if (hasSpecificLocation(event, selectedEvent)) return true;
    return hasVenueAddress(event) || (!!event.venue_name && event.venue_name !== 'TBA');
  }, [geocodedCoords, selectedEvent]);

  const isPendingGeocode = useCallback((event: EventMarker) => {
    if (geocodedCoords[event.id]) return false;
    if (geocodeFailedIds.has(event.id)) return false;
    if (hasSpecificLocation(event, selectedEvent)) return false;
    return hasVenueAddress(event);
  }, [geocodedCoords, geocodeFailedIds, selectedEvent]);

  const estimateDuration = useCallback((km: number) => (km / TRAVEL_SPEEDS[travelMode]) * 3600, [travelMode]);

  const filteredSideEventsWithDistance = useMemo(() => {
    let sorted;
    if (!userLocation) {
      sorted = filteredSideEvents.map(e => ({ ...e, distance: null as number | null }));
    } else {
      const withDist = filteredSideEvents.map(e => {
        const coords = getEffectiveCoords(e);
        return { ...e, distance: haversineKm(userLocation.lat, userLocation.lng, coords.lat, coords.lng) };
      });
      if (locationMode) {
        sorted = withDist.sort((a, b) => {
          const aR = hasResolvedLocation(a as EventMarker) ? 0 : isPendingGeocode(a as EventMarker) ? 1 : 2;
          const bR = hasResolvedLocation(b as EventMarker) ? 0 : isPendingGeocode(b as EventMarker) ? 1 : 2;
          if (aR !== bR) return aR - bR;
          return (a.distance ?? Infinity) - (b.distance ?? Infinity);
        });
      } else {
        sorted = withDist.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      }
    }
    if (routeStops.length > 0) {
      const inRoute = sorted.filter(e => routeStops.includes(e.id));
      const notInRoute = sorted.filter(e => !routeStops.includes(e.id));
      inRoute.sort((a, b) => routeStops.indexOf(a.id) - routeStops.indexOf(b.id));
      return [...inRoute, ...notInRoute];
    }
    return sorted;
  }, [filteredSideEvents, userLocation, locationMode, getEffectiveCoords, hasResolvedLocation, isPendingGeocode, routeStops]);

  // ── Reset filters on event change ─────────────────────────────────────────

  useEffect(() => {
    setSearchQuery(''); setSelectedDates(new Set()); setTimeRangeStart(0); setTimeRangeEnd(24);
    setLocationMode(false); setUserLocation(null); setUserLocationSource(null); setGeoError(null);
    setPinDropMode(false); setAddressQuery(''); setAddressResults([]);
    setRouteDistances({}); setRouteLoading(false); setRoutesFetched(0); setRoutesTotal(0);
    setRouteStops([]); setMultiStopRoute(null); setMultiStopLoading(false);
    setGeocodedCoords({}); setGeocodingProgress(null); setGeocodeFailedIds(new Set());
  }, [selectedEvent?.id]);

  // ── Globe Markers (COBE markers) ─────────────────────────────────────────

  const globeMarkers = useMemo(() => {
    return mainEvents
      .filter(e => e.is_past)
      .map(e => ({ location: [e.lat, e.lng] as [number, number], size: 0.04 }));
  }, [mainEvents]);

  // ── COBE Globe ────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || globeSize === 0) return;
    if (globeRef.current) {
      globeRef.current.destroy();
      globeRef.current = null;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const physW = globeSize * dpr;
    const physH = globeSize * dpr;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || !canvasRef.current) return;
      globeRef.current = createGlobe(canvasRef.current, {
        devicePixelRatio: dpr,
        width: physW,
        height: physH,
        phi: phiRef.current,
        theta: thetaRef.current,
        dark: 1,
        diffuse: 1.2,
        mapSamples: 16000,
        mapBrightness: 6,
        baseColor: [0.15, 0.18, 0.22],
        markerColor: [1, 0.35, 0.35],
        glowColor: [0.06, 0.08, 0.1],
        markers: [],
        onRender(state) {
          const now = Date.now();
          const paused = resumeAfterRef.current !== null && now < resumeAfterRef.current;
          if (!pointerInteracting.current && rotatingRef.current && !paused && !selectedEventIdRef.current) {
            phiRef.current += 0.003;
          }
          state.phi = phiRef.current;
          state.theta = thetaRef.current;
          state.width = physW;
          state.height = physH;
        },
      });
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      globeRef.current?.destroy();
      globeRef.current = null;
    };
  }, [globeSize]);

  // ── Sticker Marker RAF (de-cluttered, selection-aware) ───────────────────

  useEffect(() => {
    const update = () => {
      const layer = stickerLayerRef.current;
      const canvas = canvasRef.current;
      if (layer && canvas) {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w > 0) {
          const cx = w / 2;
          const cy = h / 2;
          const r = w / 2;
          const phi = phiRef.current;
          const theta = thetaRef.current;
          const cosP = Math.cos(phi), sinP = Math.sin(phi);
          const cosT = Math.cos(theta), sinT = Math.sin(theta);
          const selectedId = selectedEventIdRef.current;

          const cards: { el: HTMLElement; sx: number; sy: number; priority: number }[] = [];
          const els = layer.querySelectorAll<HTMLElement>('[data-lat]');

          els.forEach(el => {
            const eventId = el.dataset.eventId || '';
            if (selectedId && eventId !== selectedId) {
              el.style.opacity = '0';
              return;
            }
            const lat = parseFloat(el.dataset.lat!);
            const lng = parseFloat(el.dataset.lng!);
            const [ex, ey, ez] = latLngToXYZ(lat, lng);
            const rx = ex * cosP + ez * sinP;
            const rz = -ex * sinP + ez * cosP;
            const ry2 = ey * cosT - rz * sinT;
            const rz2 = ey * sinT + rz * cosT;
            if (rz2 < 0.08) {
              el.style.opacity = '0';
              return;
            }
            const sx = cx + rx * r;
            const sy = cy - ry2 * r;
            el.style.left = sx + 'px';
            el.style.top = sy + 'px';
            el.style.pointerEvents = 'none';
            if (el.dataset.type === 'past') {
              // Past dots: always show, no de-clutter
              el.style.opacity = '1';
            } else {
              cards.push({ el, sx, sy, priority: parseInt(el.dataset.priority || '1') });
            }
          });

          // De-clutter speech-bubble cards only
          cards.sort((a, b) => b.priority - a.priority);
          const SW = 168, SH = 54;
          const shown: { sx: number; sy: number }[] = [];
          cards.forEach(({ el, sx, sy }) => {
            const overlaps = shown.some(v => Math.abs(v.sx - sx) < SW && Math.abs(v.sy - sy) < SH);
            el.style.opacity = overlaps ? '0' : '1';
            if (!overlaps) shown.push({ sx, sy });
          });
        }
      }
      stickerRafRef.current = requestAnimationFrame(update);
    };
    stickerRafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(stickerRafRef.current);
  }, []);

  // ── Sync selected event ref + freeze rotation ─────────────────────────────

  useEffect(() => {
    selectedEventIdRef.current = selectedEvent?.id ?? null;
    if (selectedEvent) {
      rotatingRef.current = false;
      resumeAfterRef.current = null;
    } else {
      setTimeout(() => { rotatingRef.current = true; }, 400);
    }
  }, [selectedEvent]);

  // ── Globe Navigation ──────────────────────────────────────────────────────

  const flyToEvent = useCallback((event: EventMarker) => {
    const targetPhi = (270 - event.lng) * (Math.PI / 180);
    const targetTheta = event.lat * (Math.PI / 180);

    const startPhi = phiRef.current;
    const startTheta = thetaRef.current;
    const startTime = Date.now();
    const duration = 1200;

    rotatingRef.current = false;
    resumeAfterRef.current = Date.now() + 8000;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      let dPhi = targetPhi - startPhi;
      // Always take the short arc
      while (dPhi > Math.PI) dPhi -= 2 * Math.PI;
      while (dPhi < -Math.PI) dPhi += 2 * Math.PI;

      phiRef.current = startPhi + dPhi * ease;
      thetaRef.current = startTheta + (targetTheta - startTheta) * ease;

      if (t < 1) requestAnimationFrame(animate);
      else {
        setTimeout(() => { rotatingRef.current = true; }, 8000);
      }
    };
    requestAnimationFrame(animate);
  }, []);

  // ── Pointer/Touch Controls ────────────────────────────────────────────────

  const phiBaseRef = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = e.clientX;
    phiBaseRef.current = phiRef.current;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    rotatingRef.current = false;
    resumeAfterRef.current = null;
  }, []);

  const onPointerUp = useCallback(() => {
    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    resumeAfterRef.current = Date.now() + 4000;
    setTimeout(() => { rotatingRef.current = true; }, 4000);
  }, []);

  const onPointerOut = useCallback(() => {
    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    resumeAfterRef.current = Date.now() + 3000;
    setTimeout(() => { rotatingRef.current = true; }, 3000);
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (pointerInteracting.current !== null) {
      const delta = e.clientX - pointerInteracting.current;
      phiRef.current = phiBaseRef.current + delta / 150;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (pointerInteracting.current !== null && e.touches[0]) {
      const delta = e.touches[0].clientX - pointerInteracting.current;
      phiRef.current = phiBaseRef.current + delta / 150;
    }
  }, []);

  // ── Globe Marker Click Detection ──────────────────────────────────────────

  const handleGlobeClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const r = rect.width / 2;

    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy > r * r) return;

    // Project each event onto screen space and find closest click
    let closest: EventMarker | null = null;
    let closestDist = 30; // px threshold

    for (const event of mainEvents) {
      const [ex, ey, ez] = latLngToXYZ(event.lat, event.lng);
      // Rotate by current phi
      const phi = phiRef.current;
      const theta = thetaRef.current;

      const cosP = Math.cos(phi), sinP = Math.sin(phi);
      const cosT = Math.cos(theta), sinT = Math.sin(theta);

      // Apply phi rotation (around Y axis)
      const rx = ex * cosP + ez * sinP;
      const rz = -ex * sinP + ez * cosP;
      // Apply theta rotation (around X axis)
      const ry2 = ey * cosT - rz * sinT;
      const rz2 = ey * sinT + rz * cosT;
      const rx2 = rx;

      if (rz2 < 0) continue; // behind globe

      const sx = cx + rx2 * r;
      const sy = cy - ry2 * r;
      const dist = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2);

      if (dist < closestDist) {
        closestDist = dist;
        closest = event;
      }
    }

    if (closest) {
      setSelectedEvent(closest);
      setViewfinderTab(null);
      flyToEvent(closest);
    }
  }, [mainEvents, flyToEvent]);

  // ── Geocoding ─────────────────────────────────────────────────────────────

  const geocodeAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!locationMode || !selectedEvent) return;
    const needsGeocoding = sideEvents.filter(se =>
      !geocodedCoords[se.id] && !geocodeFailedIds.has(se.id) &&
      !hasSpecificLocation(se, selectedEvent) && hasVenueAddress(se)
    );
    if (needsGeocoding.length === 0) return;

    if (geocodeAbortRef.current) geocodeAbortRef.current.abort();
    const controller = new AbortController();
    geocodeAbortRef.current = controller;
    setGeocodingProgress({ done: 0, total: needsGeocoding.length });

    let cancelled = false;
    (async () => {
      for (const event of needsGeocoding) {
        if (cancelled) break;
        try {
          const addr = event.venue_address!;
          const city = event.city || '';
          const query = city && !addr.toLowerCase().includes(city.toLowerCase()) ? `${addr}, ${city}` : addr;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
            { signal: controller.signal, headers: { Accept: 'application/json' } }
          );
          const data = await res.json();
          if (data?.[0]) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            if (!isNaN(lat) && !isNaN(lng)) setGeocodedCoords(prev => ({ ...prev, [event.id]: { lat, lng } }));
            else setGeocodeFailedIds(prev => new Set(prev).add(event.id));
          } else {
            setGeocodeFailedIds(prev => new Set(prev).add(event.id));
          }
          if (!cancelled) setGeocodingProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null);
          await new Promise(r => setTimeout(r, 1100));
        } catch {
          if (cancelled) break;
          setGeocodeFailedIds(prev => new Set(prev).add(event.id));
        }
      }
      if (!cancelled) setGeocodingProgress(null);
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [locationMode, selectedEvent, sideEvents]);

  // ── Route Fetching ────────────────────────────────────────────────────────

  const routeAbortRef = useRef<AbortController | null>(null);
  const fetchedRouteIdsRef = useRef<Set<string>>(new Set());
  const prevUserLocRef = useRef<string | null>(null);

  useEffect(() => {
    const locKey = userLocation ? `${userLocation.lat},${userLocation.lng}` : null;
    if (!locationMode || !userLocation) {
      setRouteDistances({}); fetchedRouteIdsRef.current = new Set(); prevUserLocRef.current = null; return;
    }
    if (locKey !== prevUserLocRef.current) {
      fetchedRouteIdsRef.current = new Set(); setRouteDistances({}); setRoutesFetched(0); setRoutesTotal(0);
      prevUserLocRef.current = locKey;
    }
    const locatable = filteredSideEvents.filter(e => hasResolvedLocation(e) && !fetchedRouteIdsRef.current.has(e.id));
    if (locatable.length === 0) { setRouteLoading(false); return; }
    if (routeAbortRef.current) routeAbortRef.current.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    setRouteLoading(true);
    setRoutesTotal(fetchedRouteIdsRef.current.size + locatable.length);

    let cancelled = false;
    (async () => {
      for (const event of locatable) {
        if (cancelled || fetchedRouteIdsRef.current.has(event.id)) continue;
        try {
          const coords = getEffectiveCoords(event);
          const url = `https://router.project-osrm.org/route/v1/foot/${userLocation.lng},${userLocation.lat};${coords.lng},${coords.lat}?overview=false`;
          const res = await fetch(url, { signal: controller.signal });
          const data = await res.json();
          if (data.routes?.[0]) {
            const route = data.routes[0];
            fetchedRouteIdsRef.current.add(event.id);
            setRouteDistances(prev => ({ ...prev, [event.id]: { km: route.distance / 1000, duration: route.duration } }));
          } else {
            fetchedRouteIdsRef.current.add(event.id);
          }
          if (!cancelled) setRoutesFetched(fetchedRouteIdsRef.current.size);
          await new Promise(r => setTimeout(r, 1000));
        } catch { if (cancelled) break; }
      }
      if (!cancelled) setRouteLoading(false);
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [locationMode, userLocation, filteredSideEvents, geocodedCoords]);

  // ── Multi-stop route ──────────────────────────────────────────────────────

  const multiRouteAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!userLocation || routeStops.length === 0) { setMultiStopRoute(null); return; }
    const stopEvents = routeStops
      .map(id => filteredSideEventsWithDistance.find(e => e.id === id))
      .filter((e): e is NonNullable<typeof e> => !!e && hasResolvedLocation(e as EventMarker));
    if (stopEvents.length === 0) { setMultiStopRoute(null); return; }
    if (multiRouteAbortRef.current) multiRouteAbortRef.current.abort();
    const controller = new AbortController();
    multiRouteAbortRef.current = controller;
    setMultiStopLoading(true);
    const coordStr = [
      `${userLocation.lng},${userLocation.lat}`,
      ...stopEvents.map(e => { const ec = getEffectiveCoords(e as EventMarker); return `${ec.lng},${ec.lat}`; }),
    ].join(';');
    fetch(`https://router.project-osrm.org/route/v1/foot/${coordStr}?overview=false&steps=false`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        if (data.routes?.[0]) {
          const route = data.routes[0];
          const legs = route.legs.map((leg: { distance: number; duration: number }, i: number) => ({
            from: i === 0 ? 'user' : stopEvents[i - 1].id,
            to: stopEvents[i].id,
            km: leg.distance / 1000,
            duration: leg.duration,
          }));
          setMultiStopRoute({ legs, totalKm: route.distance / 1000, totalDuration: route.duration });
        }
        setMultiStopLoading(false);
      })
      .catch(() => { if (!controller.signal.aborted) setMultiStopLoading(false); });
    return () => controller.abort();
  }, [routeStops, userLocation, filteredSideEventsWithDistance, geocodedCoords]);

  // ── Toggle route stop ─────────────────────────────────────────────────────

  const toggleRouteStop = useCallback((eventId: string) => {
    setRouteStops(prev => {
      if (prev.includes(eventId)) return prev.filter(id => id !== eventId);
      if (prev.length >= 10) return prev;
      return [...prev, eventId];
    });
  }, []);

  // ── Address Search ────────────────────────────────────────────────────────

  const searchAddress = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setAddressLoading(true);
    setAddressResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`,
        { headers: { Accept: 'application/json' } }
      );
      const data: NominatimResult[] = await res.json();
      setAddressResults(data);
    } catch { setAddressResults([]); }
    setAddressLoading(false);
  }, []);

  // ── Geolocation ───────────────────────────────────────────────────────────

  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) { setGeoError('Geolocation not supported'); return; }
    setGeoLoading(true); setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        if (selectedEvent) {
          const dist = haversineKm(userLat, userLng, selectedEvent.lat, selectedEvent.lng);
          if (dist > 50) {
            setGeoError(`Your location is ${Math.round(dist)}km away. Input a nearby address.`);
            setGeoLoading(false); return;
          }
        }
        setUserLocation({ lat: userLat, lng: userLng });
        setUserLocationSource('gps');
        setGeoLoading(false);
      },
      err => {
        setGeoError(err.code === 1 ? 'Location access denied' : err.code === 2 ? 'Location unavailable' : 'Request timed out');
        setGeoLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, [selectedEvent]);

  // ── ESC navigation ────────────────────────────────────────────────────────

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (addressResults.length > 0) { setAddressResults([]); return; }
      if (pinDropMode) { setPinDropMode(false); return; }
      if (routeStops.length > 0) { setRouteStops([]); setMultiStopRoute(null); return; }
      if (locationMode) {
        setLocationMode(false); setUserLocation(null); setUserLocationSource(null); setPinDropMode(false);
        setAddressQuery(''); setAddressResults([]); setRouteDistances({}); setRouteStops([]); setMultiStopRoute(null);
        return;
      }
      if (selectedEvent) { setSelectedEvent(null); phiRef.current = 0; thetaRef.current = 0.3; return; }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [addressResults.length, pinDropMode, routeStops.length, locationMode, selectedEvent]);

  // ── Marker color helper ───────────────────────────────────────────────────

  const getEventStatusColor = useCallback((event: EventMarker) => {
    if (event.is_past) return T.red;
    if (event.is_current) return T.accent2;
    const daysAway = (new Date(event.start_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysAway <= 30) return T.accent;
    return T.text;
  }, [T]);

  // ── Render ────────────────────────────────────────────────────────────────

  const panelStyle = useMemo(() => ({
    background: T.bgPanel,
    border: `1px solid ${T.border}`,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  } as React.CSSProperties), [T]);

  const hasActiveFilters = searchQuery !== '' || selectedDates.size > 0 || timeRangeStart !== 0 || timeRangeEnd !== 24;

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: T.bg, fontFamily: "'Inter', 'Space Grotesk', system-ui, sans-serif" }}
    >
      {/* ── Globe Canvas ── */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: selectedEvent ? 'translate(-50%, -50%) scale(1.28)' : 'translate(-50%, -50%)',
        transition: selectedEvent
          ? 'transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) 1.1s'
          : 'transform 0.5s ease-out',
        width: globeSize,
        height: globeSize,
        pointerEvents: selectedEvent ? 'none' : 'auto',
      }}>
        <canvas
          ref={canvasRef}
          style={{
            width: globeSize,
            height: globeSize,
            cursor: 'grab',
            display: 'block',
          }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerOut={onPointerOut}
          onMouseMove={onMouseMove}
          onTouchMove={onTouchMove}
          onClick={handleGlobeClick}
        />

        {/* ── Sticker overlay for live/upcoming events ── */}
        <div
          ref={stickerLayerRef}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
        >
          {mainEvents.filter(e => !e.is_past).map(e => {
            const daysAway = (new Date(e.start_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
            const priority = e.is_current ? 3 : daysAway <= 30 ? 2 : 1;
            return (
            <div
              key={e.id}
              data-lat={e.lat}
              data-lng={e.lng}
              data-event-id={e.id}
              data-priority={priority}
              data-type="card"
              style={{
                position: 'absolute',
                width: 0, height: 0,
                opacity: 0,
                transition: 'opacity 0.15s',
              }}
            >
              <div style={{
                position: 'absolute',
                bottom: 9,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(255,255,255,0.97)',
                borderRadius: 7,
                padding: '4px 9px 4px 6px',
                whiteSpace: 'nowrap',
                boxShadow: e.is_current
                  ? '0 2px 14px rgba(80,216,216,0.5), 0 1px 4px rgba(0,0,0,0.3)'
                  : '0 2px 10px rgba(0,0,0,0.4)',
                border: e.is_current
                  ? '1.5px solid rgba(80,216,216,0.8)'
                  : '1px solid rgba(220,220,220,0.6)',
              }}>
                <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>
                  {getCountryFlag(e.country)}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#111',
                  maxWidth: 115, overflow: 'hidden', textOverflow: 'ellipsis',
                  letterSpacing: '0.01em',
                }}>
                  {e.name.length > 25 ? e.name.slice(0, 23) + '…' : e.name}
                </span>
                {/* Inverted triangle arrow pointer */}
                <div style={{
                  position: 'absolute',
                  bottom: -7,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0, height: 0,
                  borderLeft: '7px solid transparent',
                  borderRight: '7px solid transparent',
                  borderTop: '7px solid rgba(255,255,255,0.97)',
                }} />
              </div>
            </div>
            ); })}
        </div>
      </div>

      {/* ── Header Bar ── */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        {/* Logo / Wordmark */}
        <div style={{
          ...panelStyle,
          borderRadius: 10,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <div style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${T.accent}, ${T.accent2})`,
            boxShadow: `0 0 12px ${T.accentGlow}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2" opacity="0.9" />
              <ellipse cx="12" cy="12" rx="4" ry="9" stroke="white" strokeWidth="1.5" opacity="0.7" />
              <line x1="3" y1="12" x2="21" y2="12" stroke="white" strokeWidth="1.5" opacity="0.7" />
            </svg>
          </div>
          <span style={{ color: T.text, fontSize: 14, fontWeight: 700, letterSpacing: '0.02em' }}>Miles</span>
        </div>

      </div>

      {/* ── Viewfinder (top right — hidden when event panel open) ── */}
      <AnimatePresence>
        {!selectedEvent && (
          <motion.div
            key="viewfinder"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              zIndex: 450,
              width: isMobile ? 'calc(100vw - 100px)' : 300,
            }}
          >
            {/* Tab bar */}
            <div style={{
              ...panelStyle,
              borderRadius: viewfinderTab ? '10px 10px 0 0' : 10,
              overflow: 'hidden',
              display: 'flex',
            }}>
              {(['upcoming', 'search'] as const).map(tab => {
                const isActive = viewfinderTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setViewfinderTab(viewfinderTab === tab ? null : tab)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      background: isActive ? T.accent : 'transparent',
                      border: 'none',
                      color: isActive ? (theme === 'dark' ? '#000' : '#fff') : T.textDim,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {tab === 'upcoming' ? 'UPCOMING' : 'SEARCH'}
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {viewfinderTab && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ ...panelStyle, borderRadius: '0 0 10px 10px', overflow: 'hidden' }}
                >
                  <div style={{ padding: '10px 12px', borderTop: `1px solid ${T.border}` }}>
                    {viewfinderTab === 'search' && (
                      <div style={{ position: 'relative', marginBottom: 8 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2"
                          style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                          autoFocus
                          type="text"
                          value={viewfinderSearch}
                          onChange={e => setViewfinderSearch(e.target.value)}
                          placeholder="Search events, cities..."
                          style={{
                            width: '100%', padding: '7px 10px 7px 30px',
                            background: T.bgInput, border: `1px solid ${T.border}`,
                            borderRadius: 7, color: T.text, fontSize: 12,
                          }}
                        />
                      </div>
                    )}
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {(viewfinderTab === 'upcoming' ? upcomingEvents : viewfinderResults).map(event => (
                        <button
                          key={event.id}
                          onClick={() => {
                            setSelectedEvent(event);
                            setViewfinderTab(null);
                            setViewfinderSearch('');
                            flyToEvent(event);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            width: '100%', padding: '7px 0',
                            background: 'transparent', border: 'none',
                            borderBottom: `1px solid ${T.border}`,
                            cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <div style={{
                            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                            background: getEventStatusColor(event),
                            boxShadow: `0 0 6px ${getEventStatusColor(event)}80`,
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: T.text, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {event.name}
                            </div>
                            <div style={{ color: T.textMuted, fontSize: 10, marginTop: 1 }}>
                              {formatDateShort(event.start_date)}
                              {event.city ? ` · ${event.city}` : ''}
                            </div>
                          </div>
                        </button>
                      ))}
                      {(viewfinderTab === 'upcoming' ? upcomingEvents : viewfinderResults).length === 0 && (
                        <div style={{ color: T.textMuted, fontSize: 12, padding: '8px 0', textAlign: 'center' }}>
                          No events found
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Legend (bottom left) ── */}
      {!selectedEvent && (
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: 16,
          zIndex: 400,
          ...panelStyle,
          borderRadius: 10,
          padding: '10px 14px',
        }}>
          {[
            { label: 'Live now', color: T.accent2 },
            { label: 'Next 30 days', color: T.accent },
            { label: 'Upcoming', color: T.text },
            { label: 'Past', color: T.red },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: color,
                boxShadow: `0 0 6px ${color}80`,
              }} />
              <span style={{ color: T.textDim, fontSize: 10, fontWeight: 500, letterSpacing: '0.03em' }}>{label}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 4, paddingTop: 6, color: T.textMuted, fontSize: 10 }}>
            Click globe to select event
          </div>
        </div>
      )}

      {/* ── Event Detail Panel ── */}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div
            key="detail-panel"
            initial={isMobile ? { y: '100%' } : { x: '100%', opacity: 0 }}
            animate={isMobile ? { y: 0 } : { x: 0, opacity: 1 }}
            exit={isMobile ? { y: '100%' } : { x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            style={{
              position: 'absolute',
              ...(isMobile
                ? { bottom: 0, left: 0, right: 0, maxHeight: '72vh', borderRadius: '18px 18px 0 0' }
                : { top: 0, right: 0, width: 372, height: '100%', borderRadius: 0 }),
              ...panelStyle,
              overflowY: 'auto',
              zIndex: 500,
            }}
          >
            {/* Close */}
            <div style={{
              position: 'sticky',
              top: 0,
              padding: '14px 16px 10px',
              borderBottom: `1px solid ${T.border}`,
              background: T.bgPanel,
              backdropFilter: 'blur(20px)',
              zIndex: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: getEventStatusColor(selectedEvent),
                  boxShadow: `0 0 8px ${getEventStatusColor(selectedEvent)}`,
                  ...(selectedEvent.is_current ? { animation: 'miles-pulse 1.5s ease-in-out infinite' } : {}),
                }} />
                <span style={{ color: T.textMuted, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {selectedEvent.is_past ? 'Past' : selectedEvent.is_current ? 'Live Now' : 'Upcoming'}
                </span>
              </div>
              <button
                onClick={() => { setSelectedEvent(null); phiRef.current = 0; thetaRef.current = 0.3; }}
                style={{
                  background: T.bgInput, border: `1px solid ${T.border}`,
                  borderRadius: 7, color: T.textDim, cursor: 'pointer',
                  padding: '5px 10px', fontSize: 11, fontWeight: 600,
                }}
              >
                ✕ ESC
              </button>
            </div>

            {/* Event info */}
            <div style={{ padding: '16px 16px 8px' }}>
              <h2 style={{ color: T.text, fontSize: 18, fontWeight: 700, margin: '0 0 6px', lineHeight: 1.25 }}>
                {selectedEvent.name}
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {selectedEvent.event_type && (
                  <span style={{
                    padding: '3px 8px', borderRadius: 4,
                    background: T.bgInput, color: T.textDim,
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>{selectedEvent.event_type}</span>
                )}
                {selectedEvent.tier && (
                  <span style={{
                    padding: '3px 8px', borderRadius: 4,
                    background: `${T.accent}18`,
                    border: `1px solid ${T.accent}40`,
                    color: T.accent, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>{selectedEvent.tier}</span>
                )}
              </div>

              {/* Date / Location */}
              <div style={{ marginBottom: 12 }}>
                <Row icon="📅" value={`${formatDate(selectedEvent.start_date)}${selectedEvent.end_date && selectedEvent.end_date !== selectedEvent.start_date ? ` – ${formatDate(selectedEvent.end_date)}` : ''}`} T={T} />
                {(selectedEvent.city || selectedEvent.country) && (
                  <Row icon="📍" value={[selectedEvent.city, selectedEvent.country].filter(Boolean).join(', ')} T={T} />
                )}
                {selectedEvent.venue_name && selectedEvent.venue_name !== 'TBA' && (
                  <Row icon="🏛" value={selectedEvent.venue_name} T={T} />
                )}
                {selectedEvent.event_time && (
                  <Row icon="🕐" value={selectedEvent.event_time} T={T} />
                )}
              </div>

              {/* Description */}
              {selectedEvent.description && (
                <p style={{
                  color: T.textDim, fontSize: 12, lineHeight: 1.6,
                  margin: '0 0 12px', borderTop: `1px solid ${T.border}`, paddingTop: 12,
                }}>
                  {selectedEvent.description.slice(0, 240)}
                  {selectedEvent.description.length > 240 ? '...' : ''}
                </p>
              )}

              {/* Tags */}
              {selectedEvent.tags && selectedEvent.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                  {selectedEvent.tags.map(tag => (
                    <span key={tag} style={{
                      padding: '2px 7px', borderRadius: 4,
                      background: T.bgInput, color: T.textMuted,
                      fontSize: 10, fontWeight: 500,
                    }}>#{tag}</span>
                  ))}
                </div>
              )}

              {/* Register link */}
              {selectedEvent.registration_url && (
                <a
                  href={selectedEvent.registration_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '10px',
                    background: `linear-gradient(135deg, ${T.accent}, ${T.accent2})`,
                    borderRadius: 9,
                    color: theme === 'dark' ? '#000' : '#fff',
                    fontWeight: 700,
                    fontSize: 13,
                    textDecoration: 'none',
                    letterSpacing: '0.04em',
                    marginBottom: 16,
                    boxShadow: `0 4px 16px ${T.accentGlow}`,
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}
                >
                  Register →
                </a>
              )}
            </div>

            {/* ── Side Events Section ── */}
            {sideEvents.length > 0 && (
              <div style={{ borderTop: `1px solid ${T.border}`, padding: '12px 16px' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
                }}>
                  <div style={{ color: T.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em' }}>
                    SIDE EVENTS · {sideEvents.length}
                  </div>
                  {hasActiveFilters && (
                    <button
                      onClick={() => { setSearchQuery(''); setSelectedDates(new Set()); setTimeRangeStart(0); setTimeRangeEnd(24); }}
                      style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: 10, letterSpacing: '0.05em' }}
                    >
                      CLEAR
                    </button>
                  )}
                </div>

                {/* Search */}
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2"
                    style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search side events..."
                    style={{
                      width: '100%', padding: '7px 10px 7px 29px',
                      background: T.bgInput, border: `1px solid ${T.border}`,
                      borderRadius: 7, color: T.text, fontSize: 12,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Date chips */}
                <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4, marginBottom: 8, scrollbarWidth: 'none' }}>
                  {sideEventDates.map(date => {
                    const isSelected = selectedDates.has(date);
                    return (
                      <button
                        key={date}
                        onClick={() => setSelectedDates(prev => { const n = new Set(prev); if (n.has(date)) n.delete(date); else n.add(date); return n; })}
                        style={{
                          padding: '3px 9px', fontSize: 10, fontWeight: 600,
                          border: `1px solid ${isSelected ? 'transparent' : T.border}`,
                          borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                          background: isSelected ? T.accent : 'transparent',
                          color: isSelected ? (theme === 'dark' ? '#000' : '#fff') : T.textDim,
                          transition: 'all 0.15s',
                        }}
                      >
                        {formatDateShort(date)}
                      </button>
                    );
                  })}
                </div>

                {/* Time range */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: T.textMuted, fontSize: 10, letterSpacing: '0.06em' }}>TIME</span>
                    <span style={{ color: T.textDim, fontSize: 11 }}>{formatHour(timeRangeStart)} – {formatHour(timeRangeEnd)}</span>
                  </div>
                  <div style={{ position: 'relative', height: 18 }}>
                    <div style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 4, background: T.bgInput, borderRadius: 2 }} />
                    <div style={{
                      position: 'absolute', top: 7,
                      left: `${(timeRangeStart / 24) * 100}%`,
                      right: `${100 - (timeRangeEnd / 24) * 100}%`,
                      height: 4,
                      background: `linear-gradient(90deg, ${T.accent2}, ${T.accent})`,
                      borderRadius: 2,
                    }} />
                    {['start', 'end'].map(which => (
                      <input key={which} type="range" min={0} max={24} step={1}
                        value={which === 'start' ? timeRangeStart : timeRangeEnd}
                        onChange={e => {
                          const v = Number(e.target.value);
                          if (which === 'start' && v < timeRangeEnd) setTimeRangeStart(v);
                          if (which === 'end' && v > timeRangeStart) setTimeRangeEnd(v);
                        }}
                        className="miles-slider"
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 18, WebkitAppearance: 'none', appearance: 'none', background: 'transparent', pointerEvents: 'none', zIndex: which === 'end' ? 4 : 3 }}
                      />
                    ))}
                  </div>
                </div>

                {/* Location mode */}
                <LocationControls
                  T={T} theme={theme}
                  locationMode={locationMode} setLocationMode={setLocationMode}
                  userLocation={userLocation} setUserLocation={setUserLocation}
                  userLocationSource={userLocationSource} setUserLocationSource={setUserLocationSource}
                  geoLoading={geoLoading} geoError={geoError}
                  pinDropMode={pinDropMode} setPinDropMode={setPinDropMode}
                  addressQuery={addressQuery} setAddressQuery={setAddressQuery}
                  addressResults={addressResults} setAddressResults={setAddressResults}
                  addressLoading={addressLoading}
                  routeLoading={routeLoading} routesFetched={routesFetched} routesTotal={routesTotal}
                  geocodingProgress={geocodingProgress}
                  sideEvents={sideEvents}
                  hasVenueInfo={hasVenueInfo}
                  requestGeolocation={requestGeolocation}
                  searchAddress={searchAddress}
                  setRouteDistances={setRouteDistances}
                  setRouteStops={setRouteStops}
                  setMultiStopRoute={setMultiStopRoute}
                  selectedEvent={selectedEvent}
                />

                {/* Multi-stop summary */}
                {routeStops.length > 0 && (
                  <div style={{
                    marginTop: 10, padding: '10px 12px',
                    background: `${T.accent2}12`,
                    border: `1px solid ${T.accent2}30`,
                    borderRadius: 9,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ color: T.accent2, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>
                        ROUTE ({routeStops.length} STOP{routeStops.length > 1 ? 'S' : ''})
                        {multiStopLoading ? ' · CALCULATING...' : ''}
                      </span>
                      <button
                        onClick={() => { setRouteStops([]); setMultiStopRoute(null); }}
                        style={{
                          background: 'none', border: `1px solid ${T.accent2}40`,
                          borderRadius: 4, color: T.accent2, cursor: 'pointer',
                          padding: '2px 7px', fontSize: 10, fontWeight: 600,
                        }}
                      >
                        CLEAR
                      </button>
                    </div>
                    <Reorder.Group axis="y" values={routeStops} onReorder={setRouteStops} as="div"
                      style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {routeStops.map((stopId, i) => {
                        const stopEvent = filteredSideEventsWithDistance.find(e => e.id === stopId);
                        if (!stopEvent) return null;
                        const leg = multiStopRoute?.legs.find(l => l.to === stopId);
                        return (
                          <Reorder.Item key={stopId} value={stopId} as="div"
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
                            whileDrag={{ scale: 1.02, background: T.bgPanel, zIndex: 10, boxShadow: `0 4px 16px rgba(0,0,0,0.3)` }}>
                            <svg width="8" height="10" viewBox="0 0 8 10" style={{ opacity: 0.4, flexShrink: 0 }}>
                              {[2, 5, 8].map(cy => [<circle key={`l${cy}`} cx="2" cy={cy} r="1" fill={T.textDim} />, <circle key={`r${cy}`} cx="6" cy={cy} r="1" fill={T.textDim} />]).flat()}
                            </svg>
                            <div style={{ width: 18, height: 18, borderRadius: '50%', background: T.accent2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: theme === 'dark' ? '#000' : '#fff', flexShrink: 0 }}>
                              {i + 1}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: T.text, fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stopEvent.name}</div>
                              {leg && <div style={{ color: T.accent2, fontSize: 10 }}>{formatDistance(leg.km)} · {formatDuration(estimateDuration(leg.km))}</div>}
                            </div>
                            <button onClick={() => toggleRouteStop(stopId)} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}>✕</button>
                          </Reorder.Item>
                        );
                      })}
                    </Reorder.Group>
                    {multiStopRoute && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.accent2}20`, color: T.accent2, fontSize: 11, fontWeight: 600 }}>
                        Total: {formatDistance(multiStopRoute.totalKm)} · {formatDuration(estimateDuration(multiStopRoute.totalKm))}
                      </div>
                    )}
                    {/* Travel mode */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                      {(['car', 'foot', 'bike'] as TravelMode[]).map(mode => (
                        <button key={mode} onClick={() => setTravelMode(mode)} style={{
                          flex: 1, padding: '4px', fontSize: 10, fontWeight: 600,
                          border: `1px solid ${travelMode === mode ? T.accent2 : T.border}`,
                          borderRadius: 5, cursor: 'pointer',
                          background: travelMode === mode ? `${T.accent2}20` : 'transparent',
                          color: travelMode === mode ? T.accent2 : T.textMuted,
                        }}>
                          {mode === 'car' ? '🚗' : mode === 'foot' ? '🚶' : '🚲'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Side event cards */}
                <div style={{ marginTop: 10 }}>
                  {filteredSideEventsWithDistance.map(event => {
                    const rd = routeDistances[event.id];
                    const isInRoute = routeStops.includes(event.id);
                    const statusColor = getEventStatusColor(event as EventMarker);
                    const isHovered = hoveredMarker === event.id;

                    return (
                      <motion.div
                        key={event.id}
                        id={`card-${event.id}`}
                        className="miles-fade-in"
                        onMouseEnter={() => setHoveredMarker(event.id)}
                        onMouseLeave={() => setHoveredMarker(null)}
                        style={{
                          padding: '10px 12px',
                          marginBottom: 6,
                          borderRadius: 9,
                          border: `1px solid ${isInRoute ? `${T.accent2}50` : isHovered ? T.border : `${T.border}80`}`,
                          background: isInRoute
                            ? `${T.accent2}10`
                            : isHovered ? T.bgInput : 'transparent',
                          cursor: locationMode && userLocation && hasResolvedLocation(event as EventMarker) ? 'pointer' : 'default',
                          transition: 'border-color 0.2s, background 0.2s',
                        }}
                        onClick={() => {
                          if (locationMode && userLocation && hasResolvedLocation(event as EventMarker)) {
                            toggleRouteStop(event.id);
                          }
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                              <div style={{
                                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                background: statusColor,
                                boxShadow: `0 0 5px ${statusColor}80`,
                              }} />
                              <span style={{ color: T.text, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {event.name}
                              </span>
                            </div>
                            <div style={{ color: T.textMuted, fontSize: 10, paddingLeft: 11 }}>
                              {formatDateShort(event.start_date)}
                              {event.event_time ? ` · ${event.event_time}` : ''}
                            </div>
                            {event.venue_name && event.venue_name !== 'TBA' && (
                              <div style={{ color: T.textMuted, fontSize: 10, paddingLeft: 11, marginTop: 1 }}>
                                {event.venue_name}
                              </div>
                            )}
                            {rd && (
                              <div style={{ color: T.accent2, fontSize: 10, fontWeight: 600, paddingLeft: 11, marginTop: 3 }}>
                                {formatDistance(rd.km)} · {formatDuration(estimateDuration(rd.km))} {travelMode === 'car' ? 'drive' : travelMode === 'foot' ? 'walk' : 'bike'}
                              </div>
                            )}
                          </div>
                          {locationMode && userLocation && hasResolvedLocation(event as EventMarker) && (
                            <div style={{
                              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                              background: isInRoute ? T.accent2 : T.bgInput,
                              border: `1.5px solid ${isInRoute ? T.accent2 : T.border}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700,
                              color: isInRoute ? (theme === 'dark' ? '#000' : '#fff') : T.textMuted,
                              transition: 'all 0.2s',
                            }}>
                              {isInRoute ? (routeStops.indexOf(event.id) + 1) : '+'}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                  {filteredSideEventsWithDistance.length === 0 && (
                    <div style={{ color: T.textMuted, fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
                      No side events match filters
                    </div>
                  )}
                </div>
              </div>
            )}

            {sideEvents.length === 0 && !loading && (
              <div style={{ padding: '0 16px 20px', color: T.textMuted, fontSize: 12, textAlign: 'center' }}>
                No side events for this conference
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading Screen ── */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: T.bg, zIndex: 9999,
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              border: `2px solid ${T.border}`,
              borderTop: `2px solid ${T.accent}`,
              animation: 'miles-spin-slow 1s linear infinite',
              marginBottom: 16,
            }} />
            <div style={{ color: T.textDim, fontSize: 12, fontWeight: 600, letterSpacing: '0.12em' }}>MILES</div>
            <div style={{ color: T.textMuted, fontSize: 10, marginTop: 4, letterSpacing: '0.08em' }}>Loading events...</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Row({ icon, value, T }: { icon: string; value: string; T: Record<string, string> }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 5 }}>
      <span style={{ fontSize: 12, flexShrink: 0, opacity: 0.7 }}>{icon}</span>
      <span style={{ color: T.textDim, fontSize: 12, lineHeight: 1.5 }}>{value}</span>
    </div>
  );
}

function LocationControls({
  T, theme,
  locationMode, setLocationMode,
  userLocation, setUserLocation,
  userLocationSource, setUserLocationSource,
  geoLoading, geoError,
  pinDropMode, setPinDropMode,
  addressQuery, setAddressQuery,
  addressResults, setAddressResults,
  addressLoading,
  routeLoading, routesFetched, routesTotal,
  geocodingProgress,
  sideEvents,
  hasVenueInfo,
  requestGeolocation,
  searchAddress,
  setRouteDistances,
  setRouteStops,
  setMultiStopRoute,
  selectedEvent,
}: {
  T: Record<string, string>;
  theme: Theme;
  locationMode: boolean;
  setLocationMode: (v: boolean) => void;
  userLocation: { lat: number; lng: number } | null;
  setUserLocation: (v: { lat: number; lng: number } | null) => void;
  userLocationSource: string | null;
  setUserLocationSource: (v: 'gps' | 'pin' | 'search' | null) => void;
  geoLoading: boolean;
  geoError: string | null;
  pinDropMode: boolean;
  setPinDropMode: (v: boolean) => void;
  addressQuery: string;
  setAddressQuery: (v: string) => void;
  addressResults: NominatimResult[];
  setAddressResults: (v: NominatimResult[]) => void;
  addressLoading: boolean;
  routeLoading: boolean;
  routesFetched: number;
  routesTotal: number;
  geocodingProgress: { done: number; total: number } | null;
  sideEvents: EventMarker[];
  hasVenueInfo: (e: EventMarker) => boolean;
  requestGeolocation: () => void;
  searchAddress: (q: string) => void;
  setRouteDistances: (v: Record<string, { km: number; duration: number }>) => void;
  setRouteStops: (v: string[]) => void;
  setMultiStopRoute: (v: null) => void;
  selectedEvent: EventMarker | null;
}) {
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 4 }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <ChipButton
          active={locationMode}
          onClick={() => {
            const next = !locationMode;
            setLocationMode(next);
            if (!next) {
              setUserLocation(null); setUserLocationSource(null); setPinDropMode(false);
              setAddressQuery(''); setAddressResults([]); setRouteDistances({}); setRouteStops([]); setMultiStopRoute(null);
            }
          }}
          T={T} theme={theme} label="FIND ROUTES"
        />
        {locationMode && (
          <>
            <ChipButton
              active={userLocationSource === 'gps'}
              onClick={requestGeolocation}
              disabled={geoLoading}
              T={T} theme={theme}
              label={geoLoading ? 'LOCATING...' : 'MY LOCATION'}
              color="accent2"
            />
            <ChipButton
              active={pinDropMode || userLocationSource === 'pin'}
              onClick={() => setPinDropMode(!pinDropMode)}
              T={T} theme={theme}
              label={pinDropMode ? 'PLACING...' : 'DROP PIN'}
              color="accent2"
            />
            {userLocation && (
              <button
                onClick={() => { setUserLocation(null); setUserLocationSource(null); setRouteDistances({}); setRouteStops([]); setMultiStopRoute(null); }}
                style={{
                  padding: '3px 8px', fontSize: 10, border: `1px solid ${T.border}`,
                  borderRadius: 4, cursor: 'pointer', background: 'transparent', color: T.textMuted,
                }}
              >✕</button>
            )}
          </>
        )}
      </div>
      {geoError && <div style={{ color: T.red, fontSize: 10, marginTop: 5 }}>{geoError}</div>}
      {locationMode && (
        <div style={{ position: 'relative', marginTop: 7 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2.5"
            style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
            <circle cx="12" cy="9" r="2.5" />
          </svg>
          <input
            type="text" value={addressQuery}
            onChange={e => setAddressQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') searchAddress(addressQuery); }}
            placeholder="Search address..."
            style={{
              width: '100%', padding: '6px 8px 6px 26px',
              background: T.bgInput, border: `1px solid ${T.border}`,
              borderRadius: 7, color: T.text, fontSize: 11, boxSizing: 'border-box',
            }}
          />
          {addressResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
              background: T.bgPanel, border: `1px solid ${T.border}`,
              borderRadius: 7, maxHeight: 160, overflowY: 'auto', zIndex: 20,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}>
              {addressResults.map((r, i) => (
                <button key={i}
                  onClick={() => {
                    setUserLocation({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
                    setUserLocationSource('search');
                    setAddressResults([]);
                    setAddressQuery(r.display_name.split(',').slice(0, 2).join(','));
                  }}
                  style={{
                    display: 'block', width: '100%', padding: '8px 10px',
                    background: 'transparent', border: 'none', borderBottom: `1px solid ${T.border}`,
                    color: T.text, fontSize: 11, textAlign: 'left', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.bgInput; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {r.display_name.length > 80 ? r.display_name.slice(0, 80) + '...' : r.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {locationMode && (
        <div style={{ color: T.textMuted, fontSize: 10, marginTop: 5 }}>
          {userLocation
            ? `Sorting by distance${routeLoading ? ` · Routes (${routesFetched}/${routesTotal})...` : ''}${geocodingProgress ? ` · Venues (${geocodingProgress.done}/${geocodingProgress.total})...` : ''}`
            : `${sideEvents.filter(e => hasVenueInfo(e)).length} events with known venues${geocodingProgress ? ` · Locating (${geocodingProgress.done}/${geocodingProgress.total})...` : ''}`
          }
        </div>
      )}
    </div>
  );
}

function ChipButton({
  label, active, onClick, disabled, T, theme, color = 'accent',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  T: Record<string, string>;
  theme: Theme;
  color?: 'accent' | 'accent2';
}) {
  const activeColor = T[color];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '4px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
        border: `1px solid ${active ? activeColor : T.border}`,
        borderRadius: 5, cursor: disabled ? 'wait' : 'pointer',
        background: active ? `${activeColor}20` : 'transparent',
        color: active ? activeColor : T.textDim,
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}
