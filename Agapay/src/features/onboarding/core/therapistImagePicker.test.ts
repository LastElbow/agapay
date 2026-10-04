import { getImagePickerUri } from '@/src/features/onboarding/core/therapistImagePicker';

describe('getImagePickerUri', () => {
  it('handles new SDK shape', () => {
    expect(getImagePickerUri({ canceled: true, assets: [{ uri: 'x' }] })).toBeUndefined();
    expect(getImagePickerUri({ canceled: false, assets: [] })).toBeUndefined();
    expect(getImagePickerUri({ canceled: false, assets: [{ uri: 'file://a.jpg' }] })).toBe('file://a.jpg');
  });

  it('handles old SDK shape', () => {
    expect(getImagePickerUri({ cancelled: true, uri: 'file://x.jpg' })).toBeUndefined();
    expect(getImagePickerUri({ cancelled: false, uri: 'file://x.jpg' })).toBe('file://x.jpg');
  });

  it('returns undefined for non-objects', () => {
    expect(getImagePickerUri(null)).toBeUndefined();
    expect(getImagePickerUri('x')).toBeUndefined();
  });
});
