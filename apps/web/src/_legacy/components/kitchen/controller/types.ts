import type { Dispatch, SetStateAction } from "react";
import type { useKitchenDemoData } from "./useKitchenDemoData";

export type KitchenDemoView = "guided" | "protocols" | "run" | "tools" | "video";
export type KitchenDemoData = ReturnType<typeof useKitchenDemoData>["data"];
export type KitchenDemoRefresh = ReturnType<typeof useKitchenDemoData>["refresh"];
export type StateSetter<T> = Dispatch<SetStateAction<T>>;
