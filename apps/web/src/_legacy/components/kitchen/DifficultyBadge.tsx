import { Badge, type BadgeColor } from "../ui";

const COLOR: Record<string, BadgeColor> = { beginner: "green", intermediate: "yellow" };

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return <Badge color={COLOR[difficulty] ?? "red"}>{difficulty}</Badge>;
}
