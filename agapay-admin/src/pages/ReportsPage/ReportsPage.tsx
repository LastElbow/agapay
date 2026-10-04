import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import {
    fetchReports,
    fetchReportStats,
    updateReportStatus,
    updateReportPriority,
    updateReportNotes,
    fetchUserDetails,
    fetchUserReportHistory,
    warnUser,
    suspendUser,
    banUser,
    restoreUser,
    modifySuspension
} from "../../api/reportsService";
import type { Report, ReportStatus, ReportPriority, ReportStats, UserDetails, UserReportHistory, ReportFilters } from "../../api/reportsService";
import { Topbar, useToast } from "../../components/dashboard";

type ActionModalType = "warn" | "suspend" | "ban" | null;

function ReportsPage() {
    const { user, logout } = useAuth();
    const [reports, setReports] = useState<Report[]>([]);
    const [selectedReport, setSelectedReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const toast = useToast();

    // Stats
    const [stats, setStats] = useState<ReportStats | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>("all");
    const [priorityFilter, setPriorityFilter] = useState<"all" | ReportPriority>("all");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [fromDate, setFromDate] = useState<string>("");
    const [toDate, setToDate] = useState<string>("");
    const [sortBy, setSortBy] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

    // User action states
    const [actionModal, setActionModal] = useState<ActionModalType>(null);
    const [actionReason, setActionReason] = useState("");
    const [suspendDuration, setSuspendDuration] = useState("7days");
    const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
    const [loadingUserDetails, setLoadingUserDetails] = useState(false);
    const [executingAction, setExecutingAction] = useState(false);

    // User report history
    const [userReportHistory, setUserReportHistory] = useState<UserReportHistory[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Admin notes
    const [editingNotes, setEditingNotes] = useState(false);
    const [notesValue, setNotesValue] = useState("");
    const [savingNotes, setSavingNotes] = useState(false);

    // Resolution modal
    const [showResolutionModal, setShowResolutionModal] = useState(false);
    const [resolutionSummary, setResolutionSummary] = useState("");

    // Edit suspension modal
    const [showEditSuspensionModal, setShowEditSuspensionModal] = useState(false);
    const [newSuspensionDuration, setNewSuspensionDuration] = useState("7days");

    // Get unique categories for filter dropdown
    const categories = useMemo(() => {
        const cats = new Set(reports.map(r => r.category || "General"));
        return Array.from(cats).sort();
    }, [reports]);

    useEffect(() => {
        loadReports();
        loadStats();
    }, []);

    // Reload reports when filters change
    useEffect(() => {
        const debounce = setTimeout(() => {
            loadReports();
        }, 300);
        return () => clearTimeout(debounce);
    }, [searchQuery, statusFilter, priorityFilter, categoryFilter, fromDate, toDate, sortBy, sortOrder]);

    // Load user details and history when report is selected
    useEffect(() => {
        if (selectedReport) {
            loadUserDetails(selectedReport.reportedUserId);
            loadUserReportHistory(selectedReport.reportedUserId);
            setNotesValue(selectedReport.adminNotes || "");
            setEditingNotes(false);
        } else {
            setUserDetails(null);
            setUserReportHistory([]);
            setNotesValue("");
        }
    }, [selectedReport]);

    const loadStats = async () => {
        setLoadingStats(true);
        try {
            const data = await fetchReportStats();
            setStats(data);
        } catch (err) {
            console.error("Failed to load stats", err);
        } finally {
            setLoadingStats(false);
        }
    };

    const loadReports = async () => {
        setLoading(true);
        try {
            const filters: ReportFilters = {
                search: searchQuery || undefined,
                status: statusFilter !== "all" ? statusFilter : undefined,
                priority: priorityFilter !== "all" ? priorityFilter : undefined,
                category: categoryFilter !== "all" ? categoryFilter : undefined,
                fromDate: fromDate || undefined,
                toDate: toDate || undefined,
                sortBy,
                sortOrder
            };
            const data = await fetchReports(filters);
            setReports(data);
        } catch (err) {
            toast.push({ type: "error", message: "Failed to load reports" });
        } finally {
            setLoading(false);
        }
    };

    const loadUserDetails = async (userId: string) => {
        setLoadingUserDetails(true);
        try {
            const details = await fetchUserDetails(userId);
            setUserDetails(details);
        } catch (err) {
            setUserDetails(null);
        } finally {
            setLoadingUserDetails(false);
        }
    };

    const loadUserReportHistory = async (userId: string) => {
        setLoadingHistory(true);
        try {
            const history = await fetchUserReportHistory(userId);
            setUserReportHistory(history);
        } catch (err) {
            setUserReportHistory([]);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleStatusUpdate = async (id: number, status: ReportStatus, summary?: string) => {
        setUpdating(true);
        try {
            await updateReportStatus(id, status, summary);
            toast.push({ type: "success", message: `Report marked as ${status}` });

            // Refresh data
            await loadReports();
            await loadStats();

            if (selectedReport?.id === id) {
                setSelectedReport({ ...selectedReport, status, reviewedAt: new Date().toISOString(), resolutionSummary: summary || null });
            }

            setShowResolutionModal(false);
            setResolutionSummary("");
        } catch (err) {
            toast.push({ type: "error", message: "Failed to update report status" });
        } finally {
            setUpdating(false);
        }
    };

    const handlePriorityUpdate = async (id: number, priority: ReportPriority) => {
        try {
            await updateReportPriority(id, priority);
            toast.push({ type: "success", message: `Priority updated to ${priority}` });

            // Update local state
            setReports(prev => prev.map(r => r.id === id ? { ...r, priority } : r));
            if (selectedReport?.id === id) {
                setSelectedReport({ ...selectedReport, priority });
            }
            await loadStats();
        } catch (err) {
            toast.push({ type: "error", message: "Failed to update priority" });
        }
    };

    const handleSaveNotes = async () => {
        if (!selectedReport) return;
        setSavingNotes(true);
        try {
            await updateReportNotes(selectedReport.id, notesValue);
            toast.push({ type: "success", message: "Notes saved" });

            setReports(prev => prev.map(r => r.id === selectedReport.id ? { ...r, adminNotes: notesValue } : r));
            setSelectedReport({ ...selectedReport, adminNotes: notesValue });
            setEditingNotes(false);
        } catch (err) {
            toast.push({ type: "error", message: "Failed to save notes" });
        } finally {
            setSavingNotes(false);
        }
    };

    const handleUserAction = async () => {
        if (!selectedReport || !actionModal) return;

        setExecutingAction(true);
        const userId = selectedReport.reportedUserId;

        try {
            switch (actionModal) {
                case "warn":
                    const warnResult = await warnUser(userId, actionReason);
                    if (warnResult.autoSuspended) {
                        toast.push({
                            type: "warning",
                            message: `Warning #${warnResult.warningCount} issued - User automatically suspended (reached 3 warnings)`
                        });
                    } else {
                        toast.push({
                            type: "success",
                            message: `Warning #${warnResult.warningCount} issued to user`
                        });
                    }
                    break;
                case "suspend":
                    await suspendUser(userId, actionReason, suspendDuration);
                    toast.push({ type: "success", message: "User account suspended" });
                    break;
                case "ban":
                    await banUser(userId, actionReason);
                    toast.push({ type: "success", message: "User account banned permanently" });
                    break;
            }

            // Reload user details
            await loadUserDetails(userId);

            // Close modal and reset
            setActionModal(null);
            setActionReason("");
            setSuspendDuration("7days");
        } catch (err) {
            toast.push({ type: "error", message: `Failed to ${actionModal} user` });
        } finally {
            setExecutingAction(false);
        }
    };

    const handleRestoreUser = async () => {
        if (!selectedReport) return;

        setExecutingAction(true);
        try {
            await restoreUser(selectedReport.reportedUserId);
            toast.push({ type: "success", message: "User account restored" });
            await loadUserDetails(selectedReport.reportedUserId);
        } catch (err) {
            toast.push({ type: "error", message: "Failed to restore user account" });
        } finally {
            setExecutingAction(false);
        }
    };

    const handleModifySuspension = async () => {
        if (!selectedReport) return;

        setExecutingAction(true);
        try {
            await modifySuspension(selectedReport.reportedUserId, newSuspensionDuration);

            if (newSuspensionDuration === "lift") {
                toast.push({ type: "success", message: "Suspension lifted successfully" });
            } else {
                toast.push({ type: "success", message: "Suspension duration modified" });
            }

            await loadUserDetails(selectedReport.reportedUserId);
            setShowEditSuspensionModal(false);
            setNewSuspensionDuration("7days");
        } catch (err) {
            toast.push({ type: "error", message: "Failed to modify suspension" });
        } finally {
            setExecutingAction(false);
        }
    };

    const clearFilters = () => {
        setSearchQuery("");
        setStatusFilter("all");
        setPriorityFilter("all");
        setCategoryFilter("all");
        setFromDate("");
        setToDate("");
        setSortBy("createdAt");
        setSortOrder("desc");
    };

    const statusCounts = useMemo(() => ({
        all: reports.length,
        New: reports.filter((r) => r.status === "New").length,
        Reviewing: reports.filter((r) => r.status === "Reviewing").length,
        Resolved: reports.filter((r) => r.status === "Resolved").length,
        Dismissed: reports.filter((r) => r.status === "Dismissed").length,
    }), [reports]);

    const getStatusBadgeColor = (status: ReportStatus | string) => {
        switch (status) {
            case "New":
                return "bg-red-100 text-red-700";
            case "Reviewing":
                return "bg-amber-100 text-amber-700";
            case "Resolved":
                return "bg-green-100 text-green-700";
            case "Dismissed":
                return "bg-gray-100 text-gray-700";
            case "Active":
                return "bg-green-100 text-green-700";
            case "Suspended":
                return "bg-amber-100 text-amber-700";
            case "Banned":
                return "bg-red-100 text-red-700";
            default:
                return "bg-gray-100 text-gray-700";
        }
    };

    const getPriorityBadgeColor = (priority: ReportPriority | string) => {
        switch (priority) {
            case "Critical":
                return "bg-red-600 text-white";
            case "High":
                return "bg-orange-500 text-white";
            case "Medium":
                return "bg-blue-500 text-white";
            case "Low":
                return "bg-gray-400 text-white";
            default:
                return "bg-gray-400 text-white";
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <Topbar userName={user ? user.firstName : "Admin"} onLogout={logout} />

            <main className="flex-1 py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">User Reports</h1>
                        <p className="text-gray-500 mt-1">Review and manage user reports</p>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                            <div className="text-2xl font-bold text-gray-900">
                                {loadingStats ? "..." : stats?.totalReports || 0}
                            </div>
                            <div className="text-sm text-gray-500">Total Reports</div>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4">
                            <div className="text-2xl font-bold text-red-600">
                                {loadingStats ? "..." : stats?.newReports || 0}
                            </div>
                            <div className="text-sm text-gray-500">New</div>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-4">
                            <div className="text-2xl font-bold text-amber-600">
                                {loadingStats ? "..." : stats?.reviewingReports || 0}
                            </div>
                            <div className="text-sm text-gray-500">Reviewing</div>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-4">
                            <div className="text-2xl font-bold text-green-600">
                                {loadingStats ? "..." : stats?.resolvedReports || 0}
                            </div>
                            <div className="text-sm text-gray-500">Resolved</div>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-orange-200 p-4">
                            <div className="text-2xl font-bold text-orange-600">
                                {loadingStats ? "..." : stats?.criticalCount || 0}
                            </div>
                            <div className="text-sm text-gray-500">Critical</div>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-4">
                            <div className="text-2xl font-bold text-blue-600">
                                {loadingStats ? "..." : Math.round(stats?.averageResolutionTimeHours || 0)}h
                            </div>
                            <div className="text-sm text-gray-500">Avg Resolution</div>
                        </div>
                    </div>

                    {/* Search and Filters */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
                        <div className="flex flex-wrap gap-4 items-end">
                            {/* Search */}
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
                                <input
                                    type="text"
                                    placeholder="Search by name, email, or description..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                                />
                            </div>

                            {/* Priority Filter */}
                            <div className="w-32">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                                <select
                                    value={priorityFilter}
                                    onChange={(e) => setPriorityFilter(e.target.value as "all" | ReportPriority)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                                >
                                    <option value="all">All</option>
                                    <option value="Critical">Critical</option>
                                    <option value="High">High</option>
                                    <option value="Medium">Medium</option>
                                    <option value="Low">Low</option>
                                </select>
                            </div>

                            {/* Category Filter */}
                            <div className="w-36">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                                >
                                    <option value="all">All Categories</option>
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Date Range */}
                            <div className="w-36">
                                <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                                />
                            </div>
                            <div className="w-36">
                                <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                                />
                            </div>

                            {/* Sort */}
                            <div className="w-36">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Sort By</label>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                                >
                                    <option value="createdAt">Date</option>
                                    <option value="priority">Priority</option>
                                    <option value="status">Status</option>
                                    <option value="category">Category</option>
                                </select>
                            </div>
                            <div className="w-24">
                                <label className="block text-xs font-medium text-gray-500 mb-1">Order</label>
                                <select
                                    value={sortOrder}
                                    onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                                >
                                    <option value="desc">Newest</option>
                                    <option value="asc">Oldest</option>
                                </select>
                            </div>

                            {/* Clear Filters */}
                            <button
                                onClick={clearFilters}
                                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-24rem)]">
                        {/* Left Column: List */}
                        <div className="lg:col-span-4 h-full overflow-hidden flex flex-col bg-white rounded-xl shadow-sm border border-gray-200">
                            <div className="p-4 border-b border-gray-200">
                                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                                    Reports <span className="text-gray-500 font-normal">({reports.length})</span>
                                </h2>

                                {/* Status Filter Tabs */}
                                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                                    {(["all", "New", "Reviewing", "Resolved", "Dismissed"] as const).map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => setStatusFilter(status)}
                                            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${statusFilter === status
                                                ? "bg-white text-gray-900 shadow-sm"
                                                : "text-gray-600 hover:text-gray-900"
                                                }`}
                                        >
                                            {status === "all" ? "All" : status}
                                            <span className={`ml-1 ${statusFilter === status ? "text-gray-500" : "text-gray-400"}`}>
                                                ({statusCounts[status]})
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto">
                                {loading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                                    </div>
                                ) : reports.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500">
                                        <p>No reports found</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {reports.map((report) => (
                                            <div
                                                key={report.id}
                                                onClick={() => setSelectedReport(report)}
                                                className={`p-4 cursor-pointer transition-colors hover:bg-gray-50 ${selectedReport?.id === report.id
                                                    ? "bg-blue-50 border-l-4 border-emerald-600 pl-3"
                                                    : "border-l-4 border-transparent"
                                                    }`}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1 min-w-0 pr-4">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h3 className="text-sm font-semibold text-gray-900 truncate">
                                                                {report.reportedName}
                                                            </h3>
                                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${getPriorityBadgeColor(report.priority)}`}>
                                                                {report.priority}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-0.5">
                                                            Reported by: {report.reporterName}
                                                        </p>
                                                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                                                            {report.notes || "No description"}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                        <span
                                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(report.status)}`}
                                                        >
                                                            {report.status}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400">
                                                            {new Date(report.createdAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Column: Details */}
                        <div className="lg:col-span-8 h-full overflow-hidden flex flex-col bg-white rounded-xl shadow-sm border border-gray-200">
                            {selectedReport ? (
                                <div className="flex flex-col h-full">
                                    {/* Header */}
                                    <div className="p-6 border-b border-gray-200 flex justify-between items-start">
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900">Report Details</h2>
                                            <p className="text-sm text-gray-500 mt-1">Report #{selectedReport.id}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {/* Priority Selector */}
                                            <select
                                                value={selectedReport.priority}
                                                onChange={(e) => handlePriorityUpdate(selectedReport.id, e.target.value as ReportPriority)}
                                                className={`px-3 py-1 rounded-lg text-sm font-medium border-0 cursor-pointer ${getPriorityBadgeColor(selectedReport.priority)}`}
                                            >
                                                <option value="Low">Low</option>
                                                <option value="Medium">Medium</option>
                                                <option value="High">High</option>
                                                <option value="Critical">Critical</option>
                                            </select>
                                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(selectedReport.status)}`}>
                                                {selectedReport.status}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 overflow-y-auto p-6">
                                        <div className="grid grid-cols-2 gap-6 mb-6">
                                            <div>
                                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                                    Reported User
                                                </h3>
                                                <p className="text-base font-medium text-gray-900">{selectedReport.reportedName}</p>
                                                <p className="text-sm text-gray-500">{selectedReport.reportedEmail || "No email"}</p>
                                            </div>
                                            <div>
                                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                                    Reporter
                                                </h3>
                                                <p className="text-base font-medium text-gray-900">{selectedReport.reporterName}</p>
                                                <p className="text-sm text-gray-500">{selectedReport.reporterEmail || "No email"}</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-6 mb-6">
                                            <div>
                                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                                    Submitted At
                                                </h3>
                                                <p className="text-base text-gray-900">
                                                    {new Date(selectedReport.createdAt).toLocaleString()}
                                                </p>
                                            </div>
                                            <div>
                                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                                    Category
                                                </h3>
                                                <p className="text-base text-gray-900">{selectedReport.category || "General"}</p>
                                            </div>
                                        </div>

                                        <div className="mb-6">
                                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                                Report Description
                                            </h3>
                                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                                <p className="text-base text-gray-900 whitespace-pre-wrap">
                                                    {selectedReport.notes || "No description provided"}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Admin Notes Section */}
                                        <div className="mb-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                                                    📝 Admin Notes (Internal)
                                                </h3>
                                                {!editingNotes && (
                                                    <button
                                                        onClick={() => setEditingNotes(true)}
                                                        className="text-xs text-amber-700 hover:text-amber-900"
                                                    >
                                                        {selectedReport.adminNotes ? "Edit" : "Add Notes"}
                                                    </button>
                                                )}
                                            </div>
                                            {editingNotes ? (
                                                <div>
                                                    <textarea
                                                        value={notesValue}
                                                        onChange={(e) => setNotesValue(e.target.value)}
                                                        placeholder="Add internal notes about this report..."
                                                        rows={3}
                                                        className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none text-sm"
                                                    />
                                                    <div className="flex gap-2 mt-2">
                                                        <button
                                                            onClick={handleSaveNotes}
                                                            disabled={savingNotes}
                                                            className="px-3 py-1 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:opacity-50"
                                                        >
                                                            {savingNotes ? "Saving..." : "Save"}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingNotes(false);
                                                                setNotesValue(selectedReport.adminNotes || "");
                                                            }}
                                                            className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-sm text-amber-900">
                                                    {selectedReport.adminNotes || "No notes added yet"}
                                                </p>
                                            )}
                                        </div>

                                        {/* User Account Status */}
                                        <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                                                Reported User Account Status
                                            </h3>
                                            {loadingUserDetails ? (
                                                <div className="flex items-center gap-2 text-gray-500">
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
                                                    <span className="text-sm">Loading...</span>
                                                </div>
                                            ) : userDetails ? (
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-sm text-gray-600">Status:</span>
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(userDetails.accountStatus)}`}>
                                                            {userDetails.accountStatus}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-sm text-gray-600">Warnings:</span>
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${userDetails.warningCount > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                                                            {userDetails.warningCount} warning{userDetails.warningCount !== 1 ? "s" : ""}
                                                        </span>
                                                    </div>
                                                    {userDetails.suspensionReason && (
                                                        <div>
                                                            <span className="text-sm text-gray-600">Reason: </span>
                                                            <span className="text-sm text-gray-900">{userDetails.suspensionReason}</span>
                                                        </div>
                                                    )}
                                                    {userDetails.suspendedUntil && (
                                                        <div>
                                                            <span className="text-sm text-gray-600">Suspended Until: </span>
                                                            <span className="text-sm text-gray-900">
                                                                {new Date(userDetails.suspendedUntil).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-gray-500">Unable to load user details</p>
                                            )}
                                        </div>

                                        {/* Previous Reports History */}
                                        <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                                            <h3 className="text-xs font-semibold text-purple-800 uppercase tracking-wide mb-3">
                                                📋 Previous Reports Against This User ({userReportHistory.length})
                                            </h3>
                                            {loadingHistory ? (
                                                <div className="flex items-center gap-2 text-gray-500">
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
                                                    <span className="text-sm">Loading...</span>
                                                </div>
                                            ) : userReportHistory.length === 0 ? (
                                                <p className="text-sm text-purple-700">No previous reports</p>
                                            ) : (
                                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                                    {userReportHistory.filter(h => h.id !== selectedReport.id).map(report => (
                                                        <div
                                                            key={report.id}
                                                            onClick={() => {
                                                                const fullReport = reports.find(r => r.id === report.id);
                                                                if (fullReport) setSelectedReport(fullReport);
                                                            }}
                                                            className="flex items-center justify-between p-2 bg-white rounded border border-purple-100 cursor-pointer hover:bg-purple-100 transition-colors"
                                                        >
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-medium text-gray-900">#{report.id}</span>
                                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${getPriorityBadgeColor(report.priority)}`}>
                                                                        {report.priority}
                                                                    </span>
                                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getStatusBadgeColor(report.status)}`}>
                                                                        {report.status}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-gray-500 truncate">
                                                                    {report.category} - {new Date(report.createdAt).toLocaleDateString()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {userReportHistory.filter(h => h.id !== selectedReport.id).length === 0 && (
                                                        <p className="text-sm text-purple-700">This is the first report against this user</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Resolution Summary (if resolved) */}
                                        {selectedReport.resolutionSummary && (
                                            <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                                                <h3 className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-2">
                                                    ✓ Resolution Summary
                                                </h3>
                                                <p className="text-sm text-green-900">{selectedReport.resolutionSummary}</p>
                                            </div>
                                        )}

                                        {selectedReport.reviewedAt && (
                                            <div className="mb-6">
                                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                                    Reviewed At
                                                </h3>
                                                <p className="text-base text-gray-900">
                                                    {new Date(selectedReport.reviewedAt).toLocaleString()}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="p-6 border-t border-gray-200 bg-gray-50 space-y-4">
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-700 mb-3">Update Report Status</h3>
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => handleStatusUpdate(selectedReport.id, "Reviewing")}
                                                    disabled={updating || selectedReport.status === "Reviewing"}
                                                    className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    Mark Reviewing
                                                </button>
                                                <button
                                                    onClick={() => setShowResolutionModal(true)}
                                                    disabled={updating || selectedReport.status === "Resolved"}
                                                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    Mark Resolved
                                                </button>
                                                <button
                                                    onClick={() => handleStatusUpdate(selectedReport.id, "Dismissed")}
                                                    disabled={updating || selectedReport.status === "Dismissed"}
                                                    className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg font-medium hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    Dismiss
                                                </button>
                                            </div>
                                        </div>

                                        <div className="border-t border-gray-200 pt-4">
                                            <h3 className="text-sm font-semibold text-gray-700 mb-3">Take Action on Reported User</h3>
                                            <div className="flex flex-wrap gap-3">
                                                <button
                                                    onClick={() => setActionModal("warn")}
                                                    disabled={executingAction}
                                                    className="flex-1 min-w-[140px] px-4 py-2 bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    ⚠️ Issue Warning
                                                </button>
                                                <button
                                                    onClick={() => setActionModal("suspend")}
                                                    disabled={executingAction || userDetails?.accountStatus === "Suspended"}
                                                    className="flex-1 min-w-[140px] px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    ⏸️ Suspend Account
                                                </button>
                                                <button
                                                    onClick={() => setActionModal("ban")}
                                                    disabled={executingAction || userDetails?.accountStatus === "Banned"}
                                                    className="flex-1 min-w-[140px] px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    🚫 Ban User
                                                </button>
                                                {userDetails && userDetails.accountStatus === "Suspended" && (
                                                    <button
                                                        onClick={() => setShowEditSuspensionModal(true)}
                                                        disabled={executingAction}
                                                        className="flex-1 min-w-[140px] px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        ✏️ Edit Suspension
                                                    </button>
                                                )}
                                                {userDetails && userDetails.accountStatus === "Banned" && (
                                                    <button
                                                        onClick={handleRestoreUser}
                                                        disabled={executingAction}
                                                        className="flex-1 min-w-[140px] px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        ✓ Unban User
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                    <svg
                                        className="w-16 h-16 text-gray-300 mb-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={1.5}
                                            d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                                        />
                                    </svg>
                                    <p className="text-lg font-medium">Select a report</p>
                                    <p className="text-sm">Choose a report from the list to view details</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Resolution Modal */}
            {showResolutionModal && selectedReport && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Resolve Report</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            Please provide a summary of how this report was resolved. This will be stored for record-keeping.
                        </p>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Resolution Summary
                            </label>
                            <textarea
                                value={resolutionSummary}
                                onChange={(e) => setResolutionSummary(e.target.value)}
                                placeholder="Describe how this report was resolved..."
                                rows={4}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowResolutionModal(false);
                                    setResolutionSummary("");
                                }}
                                disabled={updating}
                                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleStatusUpdate(selectedReport.id, "Resolved", resolutionSummary)}
                                disabled={updating}
                                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {updating ? "Resolving..." : "Resolve Report"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Modal */}
            {actionModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">
                            {actionModal === "warn" && "Issue Warning"}
                            {actionModal === "suspend" && "Suspend Account"}
                            {actionModal === "ban" && "Ban User Permanently"}
                        </h3>

                        <p className="text-sm text-gray-600 mb-4">
                            {actionModal === "warn" && `Issue a warning to ${selectedReport?.reportedName}. This will be recorded on their account.`}
                            {actionModal === "suspend" && `Temporarily suspend ${selectedReport?.reportedName}'s account. They won't be able to log in during the suspension period.`}
                            {actionModal === "ban" && `Permanently ban ${selectedReport?.reportedName}. This action cannot be easily reversed.`}
                        </p>

                        {/* Auto-suspension warning */}
                        {actionModal === "warn" && userDetails && userDetails.warningCount >= 2 && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-sm font-semibold text-red-800 mb-1">
                                    ⚠️ Auto-Suspension Warning
                                </p>
                                <p className="text-sm text-red-700">
                                    This user currently has <strong>{userDetails.warningCount} warning(s)</strong>.
                                    Issuing this warning will trigger an <strong>automatic 7-day suspension</strong> as they will reach 3 warnings.
                                </p>
                            </div>
                        )}

                        {actionModal === "suspend" && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Suspension Duration
                                </label>
                                <select
                                    value={suspendDuration}
                                    onChange={(e) => setSuspendDuration(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                >
                                    <option value="1day">1 Day</option>
                                    <option value="3days">3 Days</option>
                                    <option value="7days">7 Days</option>
                                    <option value="30days">30 Days</option>
                                    <option value="permanent">Permanent (until manually lifted)</option>
                                </select>
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Reason {actionModal !== "warn" && "(will be shown to user)"}
                            </label>
                            <textarea
                                value={actionReason}
                                onChange={(e) => setActionReason(e.target.value)}
                                placeholder="Enter the reason for this action..."
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setActionModal(null);
                                    setActionReason("");
                                    setSuspendDuration("7days");
                                }}
                                disabled={executingAction}
                                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUserAction}
                                disabled={executingAction || !actionReason.trim()}
                                className={`flex-1 px-4 py-2 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${actionModal === "warn" ? "bg-yellow-500 hover:bg-yellow-600" :
                                    actionModal === "suspend" ? "bg-orange-500 hover:bg-orange-600" :
                                        "bg-red-600 hover:bg-red-700"
                                    }`}
                            >
                                {executingAction ? "Processing..." : "Confirm"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Suspension Modal */}
            {showEditSuspensionModal && selectedReport && userDetails && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Suspension</h3>

                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm text-blue-800">
                                <strong>{selectedReport.reportedName}</strong> is currently suspended
                                {userDetails.suspendedUntil && (
                                    <> until <strong>{new Date(userDetails.suspendedUntil).toLocaleString()}</strong></>
                                )}
                            </p>
                        </div>

                        <p className="text-sm text-gray-600 mb-4">
                            You can reduce or extend the suspension, or lift it entirely.
                        </p>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                New Suspension Duration
                            </label>
                            <select
                                value={newSuspensionDuration}
                                onChange={(e) => setNewSuspensionDuration(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="lift">🔓 Lift Suspension (Restore Access Now)</option>
                                <option value="1day">1 Day from now</option>
                                <option value="3days">3 Days from now</option>
                                <option value="7days">7 Days from now</option>
                                <option value="30days">30 Days from now</option>
                            </select>
                        </div>

                        {newSuspensionDuration === "lift" && (
                            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                <p className="text-sm text-green-800">
                                    ✓ This will immediately restore the user's access to their account.
                                </p>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowEditSuspensionModal(false);
                                    setNewSuspensionDuration("7days");
                                }}
                                disabled={executingAction}
                                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleModifySuspension}
                                disabled={executingAction}
                                className={`flex-1 px-4 py-2 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${newSuspensionDuration === "lift"
                                        ? "bg-emerald-600 hover:bg-emerald-700"
                                        : "bg-blue-600 hover:bg-blue-700"
                                    }`}
                            >
                                {executingAction
                                    ? "Processing..."
                                    : newSuspensionDuration === "lift"
                                        ? "Lift Suspension"
                                        : "Update Suspension"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ReportsPage;
