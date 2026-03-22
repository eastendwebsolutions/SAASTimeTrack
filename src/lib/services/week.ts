import { endOfWeek, startOfWeek } from "date-fns";

export function getWeekBounds(input: Date) {
  return {
    start: startOfWeek(input, { weekStartsOn: 1 }),
    end: endOfWeek(input, { weekStartsOn: 1 }),
  };
}
