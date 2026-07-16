/**
 * Protocol catalog and persistence calls for Kitchen workflows.
 */

import { deleteJson } from "../core";
import { kitchenGet, kitchenPost } from "./transport";
import type { KitchenProtocolSummary } from "./types";

export const kitchenProtocols = () =>
  kitchenGet<{ protocols: KitchenProtocolSummary[] }>("protocols");

export const kitchenProtocol = (id: string) => kitchenGet<any>(`protocols/${id}`);

export const kitchenSaveProtocol = (protocol: any) =>
  kitchenPost<{ success: boolean; id: string; filepath: string }>("protocols", protocol);

export const kitchenDeleteProtocol = (id: string) =>
  deleteJson<{ success: boolean; id: string }>(`/api/kitchen/protocols/${id}`);

export const kitchenListModes = () => kitchenGet<{ modes: string[] }>("modes");

