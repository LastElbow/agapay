type NewSdkResult = {
  canceled: boolean;
  assets?: ({ uri?: string | null } | null)[];
};

type OldSdkResult = {
  cancelled?: boolean;
  uri?: string | null;
};

export function getImagePickerUri(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;

  const anyResult = result as any;

  // Newer SDKs: { canceled, assets: [{ uri }] }
  if ('canceled' in anyResult) {
    const r = anyResult as NewSdkResult;
    if (r.canceled) return undefined;
    const uri = r.assets && r.assets[0] && r.assets[0]?.uri;
    return uri || undefined;
  }

  // Older SDKs: { cancelled, uri }
  const old = anyResult as OldSdkResult;
  if (old.cancelled) return undefined;
  return old.uri || undefined;
}
