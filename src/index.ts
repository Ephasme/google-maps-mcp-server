import {
  geocode,
  directions,
  placesSearchText,
  placesSearchNearby,
  placesAutocomplete,
  getPlace,
} from './googleMaps.js';
import { protos as placesProtos } from '@googlemaps/places';
import { protos as routingProtos } from '@googlemaps/routing';
// Minimal, reliable one-liners without repetition elsewhere
type Suggestion = placesProtos.google.maps.places.v1.AutocompletePlacesResponse.ISuggestion;
type Place = placesProtos.google.maps.places.v1.IPlace;
type Route = routingProtos.google.maps.routing.v2.IRoute;
type RouteLeg = routingProtos.google.maps.routing.v2.IRouteLeg;
type Duration = routingProtos.google.protobuf.IDuration;
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';

const server = new McpServer(
  { name: 'google-maps-mcp-server', version: '0.1.0' },
  { capabilities: { tools: {}, logging: {} } },
);

// Geocode tool: resolves a human-readable address to coordinates.
server.registerTool(
  'geocode',
  {
    title: 'Geocode',
    description: 'Geocode an address to latitude/longitude using Google Maps Geocoding API.',
    inputSchema: {
      address: z
        .string()
        .describe(
          'The address or place to geocode. Accepts full street addresses, place names, or formatted queries (e.g., "1600 Amphitheatre Pkwy, Mountain View, CA" or "Eiffel Tower").',
        ),
    },
    outputSchema: {
      results: z.array(
        z.object({
          formatted_address: z.string(),
          place_id: z.string(),
          location: z.object({ lat: z.number(), lng: z.number() }),
        }),
      ),
      status: z.string(),
    },
  },
  async ({ address }) => {
    const data = await geocode(address);
    const structured = {
      results: data.results.map((r) => ({
        formatted_address: r.formatted_address,
        place_id: r.place_id,
        location: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
      })),
      status: data.status,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
      structuredContent: structured,
    };
  },
);

// Places (new) - Text search
server.registerTool(
  'places_search_text',
  {
    title: 'Places Search (Text)',
    description: 'Search for places using a free-text query via Google Maps Places API (new).',
    inputSchema: {
      query: z
        .string()
        .describe('Free‑text search query (e.g., "coffee near Paris", "bookstore 94103").'),
    },
    outputSchema: {
      results: z.array(
        z.object({
          id: z.string().optional(),
          display_name: z.string().optional(),
          formatted_address: z.string().optional(),
          location: z.object({ lat: z.number(), lng: z.number() }).optional(),
          rating: z.number().optional(),
          user_rating_count: z.number().optional(),
          primary_type: z.string().optional(),
        }),
      ),
      status: z.string(),
    },
  },
  async ({ query }) => {
    const resp = await placesSearchText(query);
    const results = (resp.places ?? []).map((p: Place) => ({
      id: p.id,
      display_name: p.displayName?.text,
      formatted_address: p.formattedAddress,
      location: p.location ? { lat: p.location.latitude!, lng: p.location.longitude! } : undefined,
      rating: p.rating,
      user_rating_count: p.userRatingCount,
      primary_type: p.primaryType,
    }));
    const structured = { results, status: results.length ? 'OK' : 'ZERO_RESULTS' };
    return { content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
  },
);

// Places (new) - Nearby search
server.registerTool(
  'places_search_nearby',
  {
    title: 'Places Search (Nearby)',
    description: 'Search for places near a location with radius and optional primary types.',
    inputSchema: {
      center_lat: z.number().describe('Center latitude in decimal degrees.'),
      center_lng: z.number().describe('Center longitude in decimal degrees.'),
      radius_meters: z.number().positive().describe('Search radius in meters.'),
      included_primary_types: z.array(z.string()).optional().describe('Optional list of primary place types to include.'),
      max_result_count: z.number().int().positive().optional().describe('Optional maximum number of results to return.'),
    },
    outputSchema: {
      results: z.array(
        z.object({
          id: z.string().optional(),
          display_name: z.string().optional(),
          formatted_address: z.string().optional(),
          location: z.object({ lat: z.number(), lng: z.number() }).optional(),
          rating: z.number().optional(),
          user_rating_count: z.number().optional(),
          primary_type: z.string().optional(),
        }),
      ),
      status: z.string(),
    },
  },
  async ({ center_lat, center_lng, radius_meters, included_primary_types, max_result_count }) => {
    const resp = await placesSearchNearby(
      { lat: center_lat, lng: center_lng },
      radius_meters,
      { includedPrimaryTypes: included_primary_types, maxResultCount: max_result_count },
    );
    const results = (resp.places ?? []).map((p: Place) => ({
      id: p.id,
      display_name: p.displayName?.text,
      formatted_address: p.formattedAddress,
      location: p.location ? { lat: p.location.latitude!, lng: p.location.longitude! } : undefined,
      rating: p.rating,
      user_rating_count: p.userRatingCount,
      primary_type: p.primaryType,
    }));
    const structured = { results, status: results.length ? 'OK' : 'ZERO_RESULTS' };
    return { content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
  },
);

// Places (new) - Autocomplete
server.registerTool(
  'places_autocomplete',
  {
    title: 'Places Autocomplete',
    description: 'Get place and query predictions for an input string with optional location bias.',
    inputSchema: {
      input: z.string().describe('User input string to autocomplete.'),
      bias_center_lat: z.number().optional().describe('Optional bias center latitude.'),
      bias_center_lng: z.number().optional().describe('Optional bias center longitude.'),
      bias_radius_meters: z.number().positive().optional().describe('Optional bias radius in meters.'),
    },
    outputSchema: {
      suggestions: z.array(
        z.object({
          kind: z.enum(['place', 'query']),
          text: z.string(),
          place_id: z.string().optional(),
          distance_meters: z.number().optional(),
        }),
      ),
    },
  },
  async ({ input, bias_center_lat, bias_center_lng, bias_radius_meters }) => {
    const resp = await placesAutocomplete(input, {
      biasCenter: bias_center_lat !== undefined && bias_center_lng !== undefined ? { lat: bias_center_lat, lng: bias_center_lng } : undefined,
      biasRadiusMeters: bias_radius_meters,
    });
    const suggestions = (resp.suggestions ?? []).map(
      (s: Suggestion) => {
        if (s.placePrediction) {
          return {
            kind: 'place' as const,
            text: s.placePrediction.text?.text ?? '',
            place_id: s.placePrediction.placeId,
            distance_meters: s.placePrediction.distanceMeters,
          };
        }
        return {
          kind: 'query' as const,
          text: s.queryPrediction?.text?.text ?? '',
        };
      },
    );
    const structured = { suggestions };
    return { content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
  },
);

// Places (new) - Get place details
server.registerTool(
  'places_get_place',
  {
    title: 'Places Get Place',
    description: 'Retrieve detailed place information for a given place_id.',
    inputSchema: {
      place_id: z
        .string()
        .describe('The place_id to look up. Use results from search or autocomplete.'),
    },
    outputSchema: {
      place: z.object({
        id: z.string().optional(),
        display_name: z.string().optional(),
        formatted_address: z.string().optional(),
        location: z.object({ lat: z.number(), lng: z.number() }).optional(),
        rating: z.number().optional(),
        user_rating_count: z.number().optional(),
        primary_type: z.string().optional(),
        phone: z.string().optional(),
        website_uri: z.string().optional(),
      }),
    },
  },
  async ({ place_id }) => {
    const p = await getPlace(place_id);
    const structured = {
      place: {
        id: p.id,
        display_name: p.displayName?.text,
        formatted_address: p.formattedAddress,
        location: p.location ? { lat: p.location.latitude!, lng: p.location.longitude! } : undefined,
        rating: p.rating,
        user_rating_count: p.userRatingCount,
        primary_type: p.primaryType,
        phone: p.internationalPhoneNumber,
        website_uri: p.websiteUri,
      },
    };
    return { content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
  },
);

// Directions tool: route between two locations.
server.registerTool(
  'directions',
  {
    title: 'Directions',
    description: 'Get directions between origin and destination using Google Maps Directions API.',
    inputSchema: {
      origin: z
        .string()
        .describe(
          'Route origin as a human‑readable address or place string (e.g., "San Francisco, CA" or "1600 Amphitheatre Pkwy, Mountain View, CA").',
        ),
      destination: z
        .string()
        .describe(
          'Route destination as a human‑readable address or place string (e.g., "Los Angeles, CA" or "1 Infinite Loop, Cupertino, CA").',
        ),
      mode: z
        .enum(['driving', 'walking', 'bicycling', 'transit'])
        .optional()
        .describe(
          'Transport mode. Defaults to "driving". Allowed values: driving, walking, bicycling, transit.',
        ),
    },
    outputSchema: {
      routes: z.array(
        z.object({
          distance_meters: z.number().optional(),
          duration_seconds: z.number().optional(),
          legs: z.array(
            z.object({
              start_location: z.object({ lat: z.number(), lng: z.number() }),
              end_location: z.object({ lat: z.number(), lng: z.number() }),
              distance_meters: z.number().optional(),
              duration_seconds: z.number().optional(),
            }),
          ),
        }),
      ),
      status: z.string(),
    },
  },
  async ({ origin, destination, mode }) => {
    const data = await directions(origin, destination, mode ?? 'driving');
    const structured = {
      routes: (data.routes ?? []).map(
        (route: Route) => ({
        distance_meters: route.distanceMeters,
        duration_seconds: durationToSeconds(route.duration ?? undefined),
        legs: (route.legs ?? []).map(
          (leg: RouteLeg) => ({
          start_location: {
            lat: leg.startLocation?.latLng?.latitude,
            lng: leg.startLocation?.latLng?.longitude,
          },
          end_location: {
            lat: leg.endLocation?.latLng?.latitude,
            lng: leg.endLocation?.latLng?.longitude,
          },
          distance_meters: leg.distanceMeters,
          duration_seconds: durationToSeconds(leg.duration ?? undefined),
        }),
        ),
      }),
      ),
      status: data?.routes && data.routes.length > 0 ? 'OK' : 'ZERO_RESULTS',
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
      structuredContent: structured,
    };
  },
);

function durationToSeconds(duration: Duration | string | undefined): number | undefined {
  if (!duration) return undefined;
  if (typeof duration === 'string') {
    const m = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(duration);
    return m ? Number(m[1]) : undefined;
  }
  const secondsRaw = duration.seconds ?? 0;
  const seconds = typeof secondsRaw === 'string' ? Number(secondsRaw) : (secondsRaw as number);
  const nanos = duration.nanos ?? 0;
  return seconds + nanos / 1e9;
}

// In-memory map of sessionId -> transport
const transports: Record<string, StreamableHTTPServerTransport> = {};

async function startHttpServer() {
  const app = Fastify({ logger: false });

  // POST /mcp: initialize or reuse session and handle client->server messages
  app.post('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport | undefined = sessionId ? transports[sessionId] : undefined;

    if (!transport) {
      // New session only allowed for initialize requests
      const body = request.body as unknown;
      if (!isInitializeRequest(body)) {
        reply.code(400).send({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        });
        return;
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport!;
        },
        // Consider enabling in production for security:
        // enableDnsRebindingProtection: true,
        // allowedHosts: ['127.0.0.1'],
      });
      transport.onclose = () => {
        const sid = transport?.sessionId;
        if (sid) delete transports[sid];
      };
      await server.connect(transport);
    }

    // Hand request off to transport using raw Node req/res
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, request.body as any);
  });

  // GET /mcp: server->client notifications (SSE)
  app.get('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    const transport = sessionId ? transports[sessionId] : undefined;
    if (!transport) {
      reply.code(400).send('Invalid or missing session ID');
      return;
    }
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw);
  });

  // DELETE /mcp: session termination
  app.delete('/mcp', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    const transport = sessionId ? transports[sessionId] : undefined;
    if (!transport) {
      reply.code(400).send('Invalid or missing session ID');
      return;
    }
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw);
  });

  const port = config.port;
  await app.listen({ port, host: '0.0.0.0' });
}

startHttpServer().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
