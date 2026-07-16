export type LiveCoachLocationLike = Pick<Location, "protocol" | "hostname" | "host" | "port">;

export function glassesLiveCoachWsUrlForLocation(locationLike: LiveCoachLocationLike) {
  const protocol = locationLike.protocol === "https:" ? "wss:" : "ws:";
  const host = locationLike.host || (locationLike.port ? `${locationLike.hostname}:${locationLike.port}` : locationLike.hostname);
  return `${protocol}//${host}/api/live-coach/ws`;
}
