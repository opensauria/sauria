import { invoke } from '@tauri-apps/api/core';

export function integrationsConnect(
  id: string,
  credentials: Record<string, string>,
): Promise<void> {
  return invoke('integrations_connect', { id, credentials });
}

export function integrationsDisconnect(id: string): Promise<void> {
  return invoke('integrations_disconnect', { id });
}

export function startIntegrationOauth(params: {
  integrationId: string;
  providerName: string;
  mcpUrl: string;
  authUrl: string | null;
  tokenUrl: string | null;
  scopes: string | null;
}): Promise<void> {
  return invoke('start_integration_oauth', params);
}

export function startProxyOauth(params: {
  integrationId: string;
  providerName: string;
  proxyUrl: string;
  providerKey: string;
}): Promise<void> {
  return invoke('start_proxy_oauth', params);
}

export function getAuthProxyUrl(): Promise<string> {
  return invoke<string>('get_auth_proxy_url');
}

export interface ConnectedInstanceInfo {
  readonly instanceId: string;
  readonly integrationId: string;
  readonly label: string;
  readonly tools: readonly { readonly name: string }[];
  readonly connectedAt: string;
}

export function integrationsListInstances(integrationId: string): Promise<ConnectedInstanceInfo[]> {
  return invoke<ConnectedInstanceInfo[]>('integrations_list_instances', { integrationId });
}

export function integrationsConnectInstance(params: {
  instanceId: string;
  integrationId: string;
  label: string;
  credentials: Record<string, string>;
}): Promise<void> {
  return invoke('integrations_connect_instance', params);
}

export function integrationsDisconnectInstance(instanceId: string): Promise<void> {
  return invoke('integrations_disconnect_instance', { instanceId });
}
