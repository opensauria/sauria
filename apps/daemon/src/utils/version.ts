declare const SAURIA_VERSION: string;
declare const SAURIA_BUILD_HASH: string;

export function getVersion(): string {
  return SAURIA_VERSION;
}

export function getBuildHash(): string {
  return SAURIA_BUILD_HASH;
}
