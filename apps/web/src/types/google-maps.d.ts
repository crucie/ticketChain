/** Minimal Google Maps typings used by the location picker. */
declare namespace google.maps {
  class Map {
    constructor(mapDiv: HTMLElement, opts?: MapOptions);
    setCenter(latLng: LatLng | LatLngLiteral): void;
    setZoom(zoom: number): void;
    panTo(latLng: LatLng | LatLngLiteral): void;
    addListener(eventName: string, handler: (...args: unknown[]) => void): MapsEventListener;
  }

  class Marker {
    constructor(opts?: MarkerOptions);
    setPosition(latLng: LatLng | LatLngLiteral | null): void;
    setMap(map: Map | null): void;
    getPosition(): LatLng | null | undefined;
    addListener(eventName: string, handler: (...args: unknown[]) => void): MapsEventListener;
  }

  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }

  class Geocoder {
    geocode(
      request: GeocoderRequest,
      callback: (results: GeocoderResult[] | null, status: string) => void
    ): void;
  }

  interface MapsEventListener {
    remove(): void;
  }

  interface MapOptions {
    center?: LatLng | LatLngLiteral;
    zoom?: number;
    mapTypeControl?: boolean;
    streetViewControl?: boolean;
    fullscreenControl?: boolean;
    clickableIcons?: boolean;
  }

  interface MarkerOptions {
    map?: Map;
    position?: LatLng | LatLngLiteral;
    draggable?: boolean;
    title?: string;
  }

  interface LatLngLiteral {
    lat: number;
    lng: number;
  }

  interface GeocoderRequest {
    location?: LatLng | LatLngLiteral;
    address?: string;
  }

  interface GeocoderAddressComponent {
    long_name: string;
    short_name: string;
    types: string[];
  }

  interface GeocoderResult {
    address_components: GeocoderAddressComponent[];
    formatted_address: string;
    geometry: { location: LatLng };
    place_id: string;
  }

  interface MapMouseEvent {
    latLng: LatLng | null;
  }

  namespace places {
    class Autocomplete {
      constructor(inputField: HTMLInputElement, opts?: AutocompleteOptions);
      getPlace(): PlaceResult;
      addListener(eventName: string, handler: () => void): MapsEventListener;
      setFields(fields: string[]): void;
    }

    interface AutocompleteOptions {
      fields?: string[];
      types?: string[];
    }

    interface PlaceResult {
      name?: string;
      formatted_address?: string;
      address_components?: GeocoderAddressComponent[];
      geometry?: { location?: LatLng };
      place_id?: string;
    }
  }

  namespace event {
    function clearInstanceListeners(instance: object): void;
  }
}

interface Window {
  google: typeof google;
}

declare namespace google {
  const maps: typeof google.maps;
}
