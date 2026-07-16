/**
 * Transport helpers for the Kitchen API namespace.
 *
 * Keeping URL construction here prevents components and feature modules from
 * duplicating `/api/kitchen` paths or HTTP verb details.
 */

import { postJson, request } from "../core";

export const kitchenGet = <T>(path: string) => request<T>(`/api/kitchen/${path}`);
export const kitchenPost = <T>(path: string, body?: unknown) => postJson<T>(`/api/kitchen/${path}`, body);
export const kitchenRunPost = <T>(path: string, body?: unknown) => kitchenPost<T>(`run/${path}`, body);
export const kitchenOperatorPost = <T>(path: string, body?: unknown) => kitchenPost<T>(`operator/${path}`, body);
export const kitchenHandsFreePost = <T>(path: string, body?: unknown) => kitchenPost<T>(`hands-free/${path}`, body);
export const kitchenAnalyzePost = <T>(path: string, body?: unknown) => kitchenPost<T>(`analyze/${path}`, body);
