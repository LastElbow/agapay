import apiClient from '@/api/client';

type RouterLike = {
  replace: (...args: any[]) => void;
};

export type AuthRole = 'Patient' | 'PhysicalTherapist' | null;

function isTherapistOnboardingComplete(user: any): boolean {
  return (
    user?.isTherapistOnboardingComplete ??
    user?.IsTherapistOnboardingComplete ??
    false
  );
}

export async function navigateAfterAuth({
  router,
  role,
  user,
}: {
  router: RouterLike;
  role: AuthRole;
  user: any;
}): Promise<void> {
  if (role === 'Patient') {
    return;
  }

  if (role === 'PhysicalTherapist') {
    if (isTherapistOnboardingComplete(user)) {
      router.replace('/(therapist)/(tabs)');
      return;
    }

    try {
      const statusRes = await apiClient.get('/api/Onboarding/therapist/verification-status');
      const status: string | undefined = statusRes.data?.status;

      if (!status) {
        router.replace('/(therapist)/onboarding/info-consent');
        return;
      }

      if (status === 'Verified') {
        router.replace('/(therapist)/onboarding/step1');
        return;
      }

      router.replace('/(therapist)/(tabs)');
    } catch (error) {
      console.warn('Failed to load therapist verification status', error);
      router.replace('/(therapist)/onboarding/info-consent');
    }
    return;
  }
}
