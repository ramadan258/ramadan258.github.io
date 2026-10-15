export const trackingStart = '2026-10-16';
export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const trackingTimeZone = localTimeZone();
export const inTrackingPeriod = value => value?.trackingPeriod === trackingStart;
