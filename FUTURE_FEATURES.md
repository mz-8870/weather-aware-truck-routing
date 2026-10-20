# Future features

These are deliberately out of scope for this version. Each item says why it matters and roughly how it fits the current design.

## Planning

- **Full hours-of-service model.** Today's HOS toggle covers the 30-minute break and the 11-hour/10-hour cycle. Still missing:
  - the 14-hour on-duty window
  - the 60/70-hour weekly limits with a 34-hour restart
  - sleeper-berth splits
  - the driver's remaining hours at departure as an input
- **Stops at real places.** Breaks and rests are placed where the driving clock runs out. They could snap to the nearest truck stop or rest area along the route (TomTom Search along a route, category "truck stop"), shifting the ETAs to match.
- **Multi-stop trips.** Pickups and drops between origin and destination, using TomTom waypoints.

## Data and alerts

- **Severe-weather alerts.** Overlay NWS alerts (winter storm, high wind and flood warnings) on the corridor and add them to a checkpoint's reasons.
- **Road conditions and closures.** State DOT 511 feeds and TomTom traffic incidents for chain laws, closures and bridge wind restrictions.
- **Visibility and ice.** Classify fog/visibility and freezing rain (Open-Meteo has both), with thresholds agreed like the current ones.
- **Re-plan notifications.** Save a trip and get notified when a newer forecast changes its risk or recommendation.

## Platform

- **Shared cache.** The weather cache is in memory, one per serverless instance. A shared Redis (Vercel KV or Upstash) with a ~1 hour TTL, matching Open-Meteo's update cadence, would let instances share readings. It would also stay under Open-Meteo's ~600 locations/minute free tier for long or repeated trips.
- **Cached place names.** HOS stop names make one TomTom reverse-geocode call per stop. Caching by rounded position would cut that.
- **Commercial weather and routing tiers.** Higher rate limits, plus a forecast source with probabilities, would allow confidence bands on the risk.
- **Accounts and saved fleets.** Saved trucks (weight, axles, hazmat class) and trip history.
- **Hazmat and dimensions.** Pass TomTom's `vehicleLoadType`, height, width and length for restricted roads and tunnels.

## Experience

- **Keyboard access to checkpoint details on the map.** The checkpoint list could open the same details and highlight the point on the map.
- **Route labels on the map** ("Route A/B/C" tags, as in the Pencil design) and a highlighted active checkpoint.
- **Offline-ready PWA** for drivers with patchy coverage, keeping the last plan.
- **Localization** beyond US English and the imperial/metric toggle.
