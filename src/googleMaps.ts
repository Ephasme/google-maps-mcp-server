import {
  Client,
  GeocodeResponseData,
  TextSearchResponseData,
} from '@googlemaps/google-maps-services-js';
import { RoutesClient, protos as routingProtos } from '@googlemaps/routing';
import { PlacesClient, protos as placesProtos } from '@googlemaps/places';
type ComputeRoutesRequest = routingProtos.google.maps.routing.v2.IComputeRoutesRequest;
type ComputeRoutesResponse = routingProtos.google.maps.routing.v2.IComputeRoutesResponse;
const RouteTravelMode = routingProtos.google.maps.routing.v2.RouteTravelMode;

// Short aliases for Places v1 protobuf types to avoid long, repeated paths
type SearchTextResponse = placesProtos.google.maps.places.v1.ISearchTextResponse;
type SearchNearbyResponse = placesProtos.google.maps.places.v1.ISearchNearbyResponse;
type AutocompletePlacesResponse = placesProtos.google.maps.places.v1.IAutocompletePlacesResponse;
type PlaceT = placesProtos.google.maps.places.v1.IPlace;
type SearchTextRequest = placesProtos.google.maps.places.v1.ISearchTextRequest;
type SearchNearbyRequest = placesProtos.google.maps.places.v1.ISearchNearbyRequest;
type AutocompletePlacesRequest = placesProtos.google.maps.places.v1.IAutocompletePlacesRequest;
type GetPlaceRequest = placesProtos.google.maps.places.v1.IGetPlaceRequest;

export type LatLng = { lat: number; lng: number };

const client = new Client({});
const placesClient = new PlacesClient({ fallback: true });

function assertApiKey(apiKey?: string): string {
  if (!apiKey) {
    throw new Error('Missing GOOGLE_MAPS_API_KEY environment variable');
  }
  return apiKey;
}

type DirectionsMode = 'driving' | 'walking' | 'bicycling' | 'transit';
const TRAVEL_MODE_MAP: Record<
  DirectionsMode,
  (typeof RouteTravelMode)[keyof typeof RouteTravelMode]
> = {
  driving: RouteTravelMode.DRIVE,
  walking: RouteTravelMode.WALK,
  bicycling: RouteTravelMode.BICYCLE,
  transit: RouteTravelMode.TRANSIT,
};

export async function geocode(
  apiKey: string | undefined,
  address: string,
): Promise<GeocodeResponseData> {
  const key = assertApiKey(apiKey);
  const res = await client.geocode({
    params: { address, key },
    timeout: 10000,
  });
  return res.data;
}

export async function searchPlaces(
  apiKey: string | undefined,
  query: string,
): Promise<TextSearchResponseData> {
  const key = assertApiKey(apiKey);
  const res = await client.textSearch({
    params: { query, key },
    timeout: 10000,
  });
  return res.data;
}

export async function directions(
  apiKey: string | undefined,
  origin: string,
  destination: string,
  mode: DirectionsMode = 'driving',
): Promise<ComputeRoutesResponse> {
  const key = assertApiKey(apiKey);
  const routing = new RoutesClient({ fallback: true });
  const request: ComputeRoutesRequest = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode: TRAVEL_MODE_MAP[mode],
  };
  const fieldMask = [
    'routes.distanceMeters',
    'routes.duration',
    'routes.legs.startLocation',
    'routes.legs.endLocation',
    'routes.legs.distanceMeters',
    'routes.legs.duration',
  ].join(',');

  const [response] = await routing.computeRoutes(request, {
    otherArgs: {
      headers: {
        'X-Goog-FieldMask': fieldMask,
        'X-Goog-Api-Key': key,
      },
    },
  });
  return response;
}

export async function placesSearchText(
  apiKey: string | undefined,
  textQuery: string,
): Promise<SearchTextResponse> {
  const key = assertApiKey(apiKey);
  const req: SearchTextRequest = { textQuery };
  const [resp] = await placesClient.searchText(req, {
    otherArgs: {
      headers: {
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.rating',
          'places.userRatingCount',
          'places.primaryType',
        ].join(','),
        'X-Goog-Api-Key': key,
      },
    },
  });
  return resp;
}

export async function placesSearchNearby(
  apiKey: string | undefined,
  center: { lat: number; lng: number },
  radiusMeters: number,
  opts?: { includedPrimaryTypes?: string[]; maxResultCount?: number },
): Promise<SearchNearbyResponse> {
  const key = assertApiKey(apiKey);
  const req: SearchNearbyRequest = {
    maxResultCount: opts?.maxResultCount,
    includedPrimaryTypes: opts?.includedPrimaryTypes,
    locationRestriction: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: radiusMeters,
      },
    },
  };
  const [resp] = await placesClient.searchNearby(req, {
    otherArgs: {
      headers: {
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.rating',
          'places.userRatingCount',
          'places.primaryType',
        ].join(','),
        'X-Goog-Api-Key': key,
      },
    },
  });
  return resp;
}

export async function placesAutocomplete(
  apiKey: string | undefined,
  input: string,
  opts?: { biasCenter?: { lat: number; lng: number }; biasRadiusMeters?: number },
): Promise<AutocompletePlacesResponse> {
  const key = assertApiKey(apiKey);
  const req: AutocompletePlacesRequest = {
    input,
    locationBias:
      opts?.biasCenter && opts?.biasRadiusMeters
        ? {
            circle: {
              center: { latitude: opts.biasCenter.lat, longitude: opts.biasCenter.lng },
              radius: opts.biasRadiusMeters,
            },
          }
        : undefined,
  };
  const [resp] = await placesClient.autocompletePlaces(req, {
    otherArgs: {
      headers: {
        'X-Goog-FieldMask': [
          'suggestions.placePrediction.placeId',
          'suggestions.placePrediction.text',
          'suggestions.placePrediction.distanceMeters',
          'suggestions.queryPrediction.text',
        ].join(','),
        'X-Goog-Api-Key': key,
      },
    },
  });
  return resp;
}

export async function getPlace(apiKey: string | undefined, placeId: string): Promise<PlaceT> {
  const key = assertApiKey(apiKey);
  const name = placeId.startsWith('places/') ? placeId : `places/${placeId}`;
  const req: GetPlaceRequest = { name };
  const [place] = await placesClient.getPlace(req, {
    otherArgs: {
      headers: {
        'X-Goog-FieldMask': [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'rating',
          'userRatingCount',
          'primaryType',
          'types',
          'internationalPhoneNumber',
          'websiteUri',
        ].join(','),
        'X-Goog-Api-Key': key,
      },
    },
  });
  return place;
}
