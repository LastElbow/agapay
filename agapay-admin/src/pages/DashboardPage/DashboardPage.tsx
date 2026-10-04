import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  fetchSubmissions,
  fetchSubmissionByTherapist,
  verifySubmissionByTherapist,
  mockSubmissions,
  fetchLicensePreviewUrl,
} from "../../api/submissionsService";
import type { Submission } from "../../api/submissionsService";
import {
  Topbar,
  SubmissionList,
  SubmissionDetail,
  LicensePreviewModal,
  ConfirmationModal,
  RejectionReasonModal,
  LoadingState,
  useToast,
} from "../../components/dashboard";

function Dashboard() {
  const { user, logout } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] =
    useState<Submission | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const toast = useToast();
  const [confirmAcceptOpen, setConfirmAcceptOpen] = useState(false);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  // error is surfaced via toast; keep local state removed

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      // quick check: if there's no stored auth token, show a clear error
      // Use sessionStorage to match AuthContext (prevents auto-login in new tabs)
      const token = sessionStorage.getItem("authToken");
      if (!token) {
        setSubmissions(mockSubmissions());
        // show error as toast
        // delay to allow provider to mount if present
        setTimeout(
          () =>
            toast.push({
              type: "error",
              message:
                "No auth token found. Please sign in to fetch real submissions.",
            }),
          0
        );
        setLoading(false);
        return;
      }
      try {
        const data = await fetchSubmissions();
        if (!mounted) return;
        setSubmissions(data);
      } catch (err: unknown) {
        // fallback to mock data when API isn't available
        if (!mounted) return;
        setSubmissions(mockSubmissions());
        const msg = err instanceof Error ? ` — ${err.message}` : "";
        const text = `Could not load submissions from API${msg} — showing mock data.`;
        setTimeout(() => toast.push({ type: "error", message: text }), 0);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [toast]);

  // fetch details when a submission is selected
  useEffect(() => {
    if (!selectedId) {
      setSelectedSubmission(null);
      setPreviewUrl(null);
      return;
    }

    let mounted = true;
    const loadDetail = async () => {
      try {
        const detail = await fetchSubmissionByTherapist(selectedId);
        if (!mounted) return;
        setSelectedSubmission(detail);
        setPreviewUrl(detail.licensePreviewUrl || null);
        console.debug("[Dashboard] loaded submission detail", detail);
      } catch {
        if (!mounted) return;
        setSelectedSubmission(null);
        setPreviewUrl(null);
        setTimeout(
          () =>
            toast.push({
              type: "error",
              message: "Failed to load submission details",
            }),
          0
        );
      }
    };

    loadDetail();
    return () => {
      mounted = false;
    };
  }, [selectedId, toast]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Topbar userName={user ? user.firstName : "Admin"} onLogout={logout} />

      <main className="flex-1 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
            {loading && <LoadingState />}
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-8rem)]">
                {/* Left Column: List */}
                <div className="lg:col-span-4 h-full overflow-hidden flex flex-col bg-white rounded-xl shadow-sm border border-gray-200">
                     <SubmissionList
                        submissions={submissions}
                        selectedSubmission={selectedSubmission}
                        onSelectSubmission={(submission) => setSelectedId(submission.id)}
                        />
                </div>

                {/* Right Column: Details */}
                <div className="lg:col-span-8 h-full overflow-hidden flex flex-col bg-white rounded-xl shadow-sm border border-gray-200">
                     <SubmissionDetail
                        submission={selectedSubmission}
                        onAccept={() => setConfirmAcceptOpen(true)}
                        onReject={() => {
                            setConfirmRejectOpen(true);
                        }}
                        onViewLicense={async () => {
                            const id = selectedId ?? selectedSubmission?.id;
                            if (!id) {
                            toast.push({
                                type: "error",
                                message: "No submission selected",
                            });
                            return;
                            }

                            const cached = previewUrl ?? selectedSubmission?.licensePreviewUrl ?? null;
                            if (cached) {
                            setPreviewUrl(cached);
                            setPreviewOpen(true);
                            } else {
                            setPreviewOpen(true);
                            }

                            setPreviewLoading(true);

                            try {
                            const freshUrl = await fetchLicensePreviewUrl(id);
                            if (freshUrl) {
                                setPreviewUrl(freshUrl);
                            } else if (!cached) {
                                toast.push({
                                type: "error",
                                message: "License image unavailable",
                                });
                            }
                            } catch (e) {
                            console.debug(
                                "[Dashboard] failed to load license preview",
                                e
                            );
                            if (!cached) {
                                toast.push({
                                type: "error",
                                message: "Unable to load license image",
                                });
                            }
                            } finally {
                            setPreviewLoading(false);
                            }
                        }}
                    />
                </div>
            </div>
        </div>
      </main>

      <LicensePreviewModal
        isOpen={previewOpen}
        imageUrl={previewUrl}
        isLoading={previewLoading}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewUrl(null);
          setPreviewLoading(false);
        }}
      />

      <ConfirmationModal
        isOpen={confirmAcceptOpen}
        title="Confirm Approval"
        message={`Are you sure you want to approve the submission from ${selectedSubmission?.therapistName}?`}
        confirmText="Confirm Approval"
        cancelText="Cancel"
        onConfirm={async () => {
          if (!selectedSubmission) return;
          const approvedId = selectedSubmission.id;
          setConfirmAcceptOpen(false);
          setLoading(true);
          try {
            await verifySubmissionByTherapist(
              approvedId,
              true,
              null
            );
            // Remove the approved submission from the list
            const list = await fetchSubmissions();
            setSubmissions(list);
            // Clear the selected submission
            setSelectedId(null);
            setSelectedSubmission(null);
            toast.push({ type: "success", message: "Submission approved and removed from list" });
          } catch (err: unknown) {
            toast.push({
              type: "error",
              message: "Failed to accept submission",
            });
            console.debug("verify error", err);
          } finally {
            setLoading(false);
          }
        }}
        onCancel={() => setConfirmAcceptOpen(false)}
        type="success"
      />

      <RejectionReasonModal
        isOpen={confirmRejectOpen}
        onConfirm={async (reason: string) => {
          if (!selectedSubmission) return;
          const rejectedId = selectedSubmission.id;
          setConfirmRejectOpen(false);
          setLoading(true);
          try {
            await verifySubmissionByTherapist(
              rejectedId,
              false,
              reason
            );
            // Remove the rejected submission from the list
            const list = await fetchSubmissions();
            setSubmissions(list);
            // Clear the selected submission
            setSelectedId(null);
            setSelectedSubmission(null);
            toast.push({ type: "success", message: "Submission rejected and removed from list" });
          } catch (err: unknown) {
            toast.push({
              type: "error",
              message: "Failed to reject submission",
            });
            console.debug("verify error", err);
          } finally {
            setLoading(false);
          }
        }}
        onCancel={() => setConfirmRejectOpen(false)}
      />
    </div>
  );
}

export default Dashboard;
