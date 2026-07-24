const SCRIPT_ID = 'ticketchain-google-maps';

let loadPromise: Promise<void> | null = null;

export function getGoogleMapsApiKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key || undefined;
}

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser'));
  }

  if (window.google?.maps?.places) {
    return Promise.resolve();
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set'));
  }

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.google?.maps) resolve();
        else reject(new Error('Google Maps failed to initialize'));
      });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')));
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
    script.onload = () => {
      if (window.google?.maps) resolve();
      else reject(new Error('Google Maps failed to initialize'));
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Maps script'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function addressComponent(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  type: string
): string {
  return components?.find((c) => c.types.includes(type))?.long_name ?? '';
}

export function parsePlaceResult(place: google.maps.places.PlaceResult): {
  venueName: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
} | null {
  const loc = place.geometry?.location;
  if (!loc) return null;

  const components = place.address_components;
  const city =
    addressComponent(components, 'locality') ||
    addressComponent(components, 'administrative_area_level_2') ||
    addressComponent(components, 'administrative_area_level_1') ||
    '';
  const country = addressComponent(components, 'country');
  const venueName =
    place.name && place.formatted_address && place.name !== place.formatted_address
      ? place.name
      : place.formatted_address || place.name || '';

  return {
    venueName,
    city,
    country,
    latitude: loc.lat(),
    longitude: loc.lng(),
  };
}
