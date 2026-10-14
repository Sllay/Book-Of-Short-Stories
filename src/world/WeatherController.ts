export type WeatherSource = 'real' | 'simulated';

export interface WeatherSnapshot {
  readonly source: WeatherSource;
  readonly cloudCover: number;
  readonly rainIntensity: number;
  readonly thunderChance: number;
  readonly weatherCode: number | null;
}

interface OpenMeteoCurrent {
  readonly weather_code?: number;
  readonly cloud_cover?: number;
  readonly precipitation?: number;
  readonly rain?: number;
}

interface OpenMeteoResponse {
  readonly current?: OpenMeteoCurrent;
}

const REAL_WEATHER_REFRESH_MS = 15 * 60 * 1000;

export class WeatherController {
  private snapshot: WeatherSnapshot = simulateWeather(new Date());
  private lastRealRefreshAt = 0;
  private realWeatherEnabled = false;
  private latitude: number | null = null;
  private longitude: number | null = null;
  private refreshInFlight: Promise<void> | null = null;

  public constructor() {
    void this.tryEnableGrantedLocation();
  }

  public current(date = new Date()): WeatherSnapshot {
    const now = Date.now();
    if (this.realWeatherEnabled && now - this.lastRealRefreshAt >= REAL_WEATHER_REFRESH_MS) {
      void this.refreshRealWeather();
    }

    if (this.snapshot.source === 'real') return this.snapshot;
    this.snapshot = simulateWeather(date);
    return this.snapshot;
  }

  public refreshIfGranted(): void {
    if (this.realWeatherEnabled) {
      void this.refreshRealWeather();
      return;
    }
    void this.tryEnableGrantedLocation();
  }

  private async tryEnableGrantedLocation(): Promise<void> {
    if (!('geolocation' in navigator)) return;

    // Never prompt on startup. Real weather turns on automatically only when this
    // site already has location permission; otherwise the deterministic offline
    // simulation remains the default.
    try {
      if (!navigator.permissions) return;
      const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      if (status.state !== 'granted') return;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.latitude = position.coords.latitude;
          this.longitude = position.coords.longitude;
          this.realWeatherEnabled = true;
          void this.refreshRealWeather();
        },
        () => undefined,
        { enableHighAccuracy: false, maximumAge: REAL_WEATHER_REFRESH_MS, timeout: 4000 }
      );
    } catch {
      // Partial Permissions API implementations (notably older Safari builds) can
      // throw here. The reader simply keeps the offline weather model.
    }
  }

  private refreshRealWeather(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    if (this.latitude === null || this.longitude === null) return Promise.resolve();

    this.refreshInFlight = this.fetchRealWeather(this.latitude, this.longitude)
      .finally(() => {
        this.refreshInFlight = null;
      });
    return this.refreshInFlight;
  }

  private async fetchRealWeather(latitude: number, longitude: number): Promise<void> {
    try {
      const params = new URLSearchParams({
        latitude: latitude.toFixed(4),
        longitude: longitude.toFixed(4),
        current: 'weather_code,cloud_cover,precipitation,rain',
        timezone: 'auto'
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
        cache: 'no-store'
      });
      if (!response.ok) return;

      const data = await response.json() as OpenMeteoResponse;
      const current = data.current;
      if (!current) return;

      const code = Number.isFinite(current.weather_code) ? Number(current.weather_code) : 0;
      const cloudCover = clamp01((Number(current.cloud_cover) || 0) / 100);
      const precipitation = Math.max(0, Number(current.precipitation) || 0, Number(current.rain) || 0);
      const rainIntensity = clamp01(precipitation / 4 + rainCodeBoost(code));
      const thunderChance = isThunderCode(code) ? 0.92 : 0;

      this.snapshot = {
        source: 'real',
        cloudCover,
        rainIntensity,
        thunderChance,
        weatherCode: code
      };
      this.lastRealRefreshAt = Date.now();
    } catch {
      // Network is optional. A failure never interrupts reading.
    }
  }
}

function simulateWeather(date: Date): WeatherSnapshot {
  const dayKey = date.getFullYear() * 4096 + (date.getMonth() + 1) * 128 + date.getDate();
  const quarter = Math.floor((date.getHours() * 60 + date.getMinutes()) / 15);
  const broad = pseudoRandom(dayKey * 0.013 + Math.floor(quarter / 8) * 1.71);
  const local = pseudoRandom(dayKey * 0.037 + quarter * 0.63 + 4.2);
  const cloudCover = clamp01(0.08 + broad * 0.74 + (local - 0.5) * 0.18);
  const rainGate = pseudoRandom(dayKey * 0.071 + Math.floor(quarter / 4) * 2.33 + 8.1);
  const rainIntensity = rainGate > 0.83
    ? clamp01((rainGate - 0.83) * 4.6 * (0.5 + cloudCover * 0.75))
    : 0;
  const thunderChance = rainIntensity > 0.62
    ? clamp01((rainIntensity - 0.62) * 1.7)
    : 0;

  return {
    source: 'simulated',
    cloudCover,
    rainIntensity,
    thunderChance,
    weatherCode: null
  };
}

function rainCodeBoost(code: number): number {
  if (code >= 95) return 0.75;
  if (code >= 80) return 0.5;
  if (code >= 61) return 0.36;
  if (code >= 51) return 0.16;
  return 0;
}

function isThunderCode(code: number): boolean {
  return code === 95 || code === 96 || code === 99;
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
