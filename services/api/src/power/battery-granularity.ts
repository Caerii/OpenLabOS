/** Battery SOC granularity helpers — UI % vs coulomb µAh. */

export function socFractionalPercent(chargeCounterUah: number | null, chargeFullUah: number | null): number | null {
  if (chargeCounterUah === null || chargeFullUah === null || chargeFullUah <= 0) return null;
  return Math.round((chargeCounterUah / chargeFullUah) * 10000) / 100;
}

export type BatteryGranularityInfo = {
  /** Integer UI SOC (sysfs capacity / dumpsys level). Often 1% steps; TTS may round to 10%. */
  levelPercent: number | null;
  /** Sub-percent SOC from µAh coulomb counter. */
  socFractionalPercent: number | null;
  chargeCounterUah: number | null;
  chargeFullUah: number | null;
};

export function describeBatteryGranularity(b: BatteryGranularityInfo): string {
  const parts = [
    `uiLevel=${b.levelPercent ?? "?"}%`,
    `coulombSoc=${b.socFractionalPercent ?? "?"}%`,
    `charge=${b.chargeCounterUah ?? "?"}µAh/${b.chargeFullUah ?? "?"}µAh`,
  ];
  return parts.join(" ");
}
