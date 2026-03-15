function parseInWorldDate(value: string): Date | null {
  const isoDateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    const year = Number(isoDateOnly[1]);
    const monthIndex = Number(isoDateOnly[2]) - 1;
    const day = Number(isoDateOnly[3]);
    return new Date(year, monthIndex, day);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function formatIsoDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(iso));
}

export function formatInWorldDate(value: string): string {
  const parsed = parseInWorldDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(parsed);
}

export function formatShortInWorldDate(value: string): string {
  const parsed = parseInWorldDate(value);
  if (!parsed) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).format(parsed);
}
