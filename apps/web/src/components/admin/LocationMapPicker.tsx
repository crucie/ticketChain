'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPinned, Search } from 'lucide-react';
import {
  getGoogleMapsApiKey,
  loadGoogleMaps,
  parsePlaceResult,
} from '@/lib/google-maps';

export interface PickedLocation {
  venueName: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface LocationMapPickerProps {
  latitude: number | null;
  longitude: number | null;
  onPick: (location: PickedLocation) => void;
}

const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209 }; // New Delhi
const DEFAULT_ZOOM = 12;
const PICKED_ZOOM = 16;

export function LocationMapPicker({ latitude, longitude, onPick }: LocationMapPickerProps) {
  const apiKey = getGoogleMapsApiKey();
  const mapHostRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open || !apiKey) return;

    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];

    async function init() {
      setLoading(true);
      setError(null);
      try {
        await loadGoogleMaps();
        if (cancelled || !mapHostRef.current) return;

        const center =
          latitude != null && longitude != null
            ? { lat: latitude, lng: longitude }
            : DEFAULT_CENTER;

        const map = new google.maps.Map(mapHostRef.current, {
          center,
          zoom: latitude != null && longitude != null ? PICKED_ZOOM : DEFAULT_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        mapRef.current = map;
        geocoderRef.current = new google.maps.Geocoder();

        const marker = new google.maps.Marker({
          map,
          position: latitude != null && longitude != null ? center : undefined,
          draggable: true,
          title: 'Event location',
        });
        markerRef.current = marker;

        listeners.push(
          map.addListener('click', (event: unknown) => {
            const e = event as google.maps.MapMouseEvent;
            if (!e.latLng) return;
            void applyLatLng(e.latLng.lat(), e.latLng.lng());
          })
        );

        listeners.push(
          marker.addListener('dragend', () => {
            const pos = marker.getPosition();
            if (!pos) return;
            void applyLatLng(pos.lat(), pos.lng());
          })
        );

        if (searchInputRef.current) {
          const autocomplete = new google.maps.places.Autocomplete(searchInputRef.current, {
            fields: ['name', 'formatted_address', 'address_components', 'geometry'],
          });
          listeners.push(
            autocomplete.addListener('place_changed', () => {
              const place = autocomplete.getPlace();
              const parsed = parsePlaceResult(place);
              if (!parsed) {
                setError('Could not resolve that place — try another search.');
                return;
              }
              setMarker(parsed.latitude, parsed.longitude);
              onPick(parsed);
              setError(null);
            })
          );
        }

        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load Google Maps');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
      for (const listener of listeners) listener.remove();
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      mapRef.current = null;
      geocoderRef.current = null;
      setReady(false);
    };
    // Re-init only when opening the map; coords are applied via setMarker in handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, apiKey]);

  useEffect(() => {
    if (!ready || latitude == null || longitude == null) return;
    setMarker(latitude, longitude);
  }, [ready, latitude, longitude]);

  function setMarker(lat: number, lng: number) {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const position = { lat, lng };
    marker.setPosition(position);
    map.panTo(position);
    map.setZoom(PICKED_ZOOM);
  }

  async function applyLatLng(lat: number, lng: number) {
    setMarker(lat, lng);
    const geocoder = geocoderRef.current;
    if (!geocoder) {
      onPick({
        venueName: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        city: '',
        country: '',
        latitude: lat,
        longitude: lng,
      });
      return;
    }

    await new Promise<void>((resolve) => {
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status !== 'OK' || !results?.[0]) {
          onPick({
            venueName: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            city: '',
            country: '',
            latitude: lat,
            longitude: lng,
          });
          resolve();
          return;
        }

        const parsed = parsePlaceResult({
          name: results[0].formatted_address,
          formatted_address: results[0].formatted_address,
          address_components: results[0].address_components,
          geometry: { location: results[0].geometry.location },
        });

        onPick(
          parsed ?? {
            venueName: results[0].formatted_address,
            city: '',
            country: '',
            latitude: lat,
            longitude: lng,
          }
        );
        resolve();
      });
    });
  }

  if (!apiKey) {
    return (
      <p className="text-[11px] text-silver leading-relaxed pl-7">
        Set <span className="font-mono text-graphite">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> to
        pick the venue on Google Maps (Maps JavaScript API + Places API).
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 pl-7">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-graphite hover:text-ink transition-colors"
        >
          <MapPinned className="w-3.5 h-3.5" aria-hidden />
          {open ? 'Hide map' : 'Pick on map'}
        </button>
        {latitude != null && longitude != null && (
          <span className="text-[10px] font-mono text-silver truncate">
            {latitude.toFixed(5)}, {longitude.toFixed(5)}
          </span>
        )}
      </div>

      {open && (
        <div className="rounded-lg border border-mist overflow-hidden bg-mist/10">
          <div className="relative px-3 py-2 border-b border-mist">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-silver pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search for a place or address…"
              className="w-full pl-7 pr-2 py-1.5 text-sm bg-transparent border-0 text-ink placeholder:text-silver/60 focus:outline-none focus:ring-0"
              autoComplete="off"
            />
          </div>

          <div className="relative h-56 sm:h-64 bg-mist/30">
            <div ref={mapHostRef} className="absolute inset-0" />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-paper/70 z-10">
                <Loader2 className="w-5 h-5 animate-spin text-graphite" />
              </div>
            )}
          </div>

          <p className="px-3 py-2 text-[10px] text-silver">
            Search a place, or click / drag the pin on the map.
          </p>

          {error && (
            <p className="px-3 pb-2 text-[11px] text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
