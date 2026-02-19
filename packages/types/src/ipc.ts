/**
 * IPC wire protocol types — daemon <-> desktop communication.
 */

export interface IpcRequest {
  readonly id: number;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export interface IpcResponse {
  readonly id: number;
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
}
