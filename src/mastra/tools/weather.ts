import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

interface GeocodeResult {
  results?: Array<{
    latitude: number;
    longitude: number;
    name: string;
    country?: string;
    admin1?: string;
  }>;
}

interface ForecastResult {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
  };
}

/**
 * Get the current weather for a location. Uses the free Open-Meteo API
 * (no API key required): geocodes the place name, then fetches current conditions.
 */
export const weatherTool = createTool({
  id: 'get_weather',
  description:
    'Get the current weather for a location (temperature, conditions, humidity, wind).',
  inputSchema: z.object({
    location: z
      .string()
      .describe('City or place name, e.g. "London" or "San Francisco, CA"'),
  }),
  outputSchema: z.object({
    location: z.string(),
    temperature: z.number().describe('Temperature in °C'),
    feelsLike: z.number().describe('Apparent temperature in °C'),
    humidity: z.number().describe('Relative humidity %'),
    windSpeed: z.number().describe('Wind speed in km/h'),
    conditions: z.string(),
  }),
  execute: async ({ location }) => {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      location,
    )}&count=1`;
    const geo = (await (await fetch(geoUrl)).json()) as GeocodeResult;
    const place = geo.results?.[0];
    if (!place) {
      throw new Error(`Location "${location}" not found.`);
    }

    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code`;
    const data = (await (await fetch(forecastUrl)).json()) as ForecastResult;
    const c = data.current;

    const label = [place.name, place.admin1, place.country]
      .filter(Boolean)
      .join(', ');

    return {
      location: label,
      temperature: c.temperature_2m,
      feelsLike: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      windSpeed: c.wind_speed_10m,
      conditions: WMO_DESCRIPTIONS[c.weather_code] ?? 'Unknown',
    };
  },
});
