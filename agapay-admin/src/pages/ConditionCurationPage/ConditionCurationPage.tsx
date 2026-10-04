import { useState, useEffect } from "react";
import {
  fetchConditions,
  updateCondition,
  deleteCondition,
  mergeConditions,
  fetchVerifiedConditions,
  type OtherCondition,
} from "../../api/conditionsService";
import "./ConditionCurationPage.css";

export default function ConditionCurationPage() {
  const [conditions, setConditions] = useState<OtherCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [mergingId, setMergingId] = useState<number | null>(null);
  const [verifiedConditions, setVerifiedConditions] = useState<
    OtherCondition[]
  >([]);
  const [mergeDestinationId, setMergeDestinationId] = useState<number | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");

  const loadConditions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchConditions("Pending");
      setConditions(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load conditions"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadVerifiedConditions = async () => {
    try {
      const data = await fetchVerifiedConditions();
      setVerifiedConditions(data);
    } catch (err) {
      console.error("Failed to load verified conditions:", err);
    }
  };

  useEffect(() => {
    loadConditions();
  }, []);

  const handleApprove = async (id: number) => {
    try {
      setLoading(true);
      await updateCondition(id, { status: "Verified" });
      await loadConditions();
    } catch (err) {
      setLoading(false);
      alert(err instanceof Error ? err.message : "Failed to approve condition");
    }
  };

  const handleEditStart = (condition: OtherCondition) => {
    setEditingId(condition.id);
    setEditName(condition.name);
  };

  const handleEditSave = async () => {
    if (!editingId || !editName.trim()) return;

    try {
      setLoading(true);
      await updateCondition(editingId, {
        name: editName.trim(),
        status: "Verified",
      });
      setEditingId(null);
      setEditName("");
      await loadConditions();
    } catch (err) {
      setLoading(false);
      alert(err instanceof Error ? err.message : "Failed to update condition");
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditName("");
  };

  const handleMergeStart = async (id: number) => {
    setMergingId(id);
    setSearchQuery("");
    setMergeDestinationId(null);
    await loadVerifiedConditions();
  };

  const handleMergeSave = async () => {
    if (!mergingId || !mergeDestinationId) return;

    try {
      setLoading(true);
      await mergeConditions({
        sourceConditionId: mergingId,
        destinationConditionId: mergeDestinationId,
      });
      setMergingId(null);
      setMergeDestinationId(null);
      setSearchQuery("");
      await loadConditions();
    } catch (err) {
      setLoading(false);
      alert(err instanceof Error ? err.message : "Failed to merge conditions");
    }
  };

  const handleMergeCancel = () => {
    setMergingId(null);
    setMergeDestinationId(null);
    setSearchQuery("");
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this condition?")) return;

    try {
      setLoading(true);
      await deleteCondition(id);
      await loadConditions();
    } catch (err) {
      setLoading(false);
      alert(err instanceof Error ? err.message : "Failed to delete condition");
    }
  };

  const filteredVerifiedConditions = verifiedConditions.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="condition-curation-page">
        <div className="loading">Loading conditions...</div>
      </div>
    );
  }

  return (
    <div className="condition-curation-page">
      <div className="header">
        <h1>Condition Curation</h1>
        <p className="subtitle">Review and approve user-submitted conditions</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {conditions.length === 0 ? (
        <div className="empty-state">No pending conditions to review</div>
      ) : (
        <div className="conditions-table">
          <table>
            <thead>
              <tr>
                <th>Condition Name</th>
                <th>Submitted</th>
                <th>Therapists</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {conditions.map((condition) => (
                <tr key={condition.id}>
                  <td>
                    {editingId === condition.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="edit-input"
                        autoFocus
                      />
                    ) : (
                      <span className="condition-name">{condition.name}</span>
                    )}
                  </td>
                  <td>{new Date(condition.createdAt).toLocaleDateString()}</td>
                  <td>{condition.therapistCount}</td>
                  <td>
                    <span
                      className={`status-badge status-${condition.status.toLowerCase()}`}
                    >
                      {condition.status}
                    </span>
                  </td>
                  <td>
                    {editingId === condition.id ? (
                      <div className="action-buttons">
                        <button
                          onClick={handleEditSave}
                          className="btn btn-save"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleEditCancel}
                          className="btn btn-cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : mergingId === condition.id ? (
                      <div className="merge-panel">
                        <div className="merge-search">
                          <input
                            type="text"
                            placeholder="Search verified conditions..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="search-input"
                          />
                          {filteredVerifiedConditions.length > 0 && (
                            <select
                              value={mergeDestinationId || ""}
                              onChange={(e) =>
                                setMergeDestinationId(Number(e.target.value))
                              }
                              className="merge-select"
                            >
                              <option value="">Select destination...</option>
                              {filteredVerifiedConditions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({c.therapistCount} therapists)
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div className="action-buttons">
                          <button
                            onClick={handleMergeSave}
                            className="btn btn-save"
                            disabled={!mergeDestinationId}
                          >
                            Merge
                          </button>
                          <button
                            onClick={handleMergeCancel}
                            className="btn btn-cancel"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="action-buttons">
                        <button
                          onClick={() => handleApprove(condition.id)}
                          className="btn btn-approve"
                          title="Approve"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => handleEditStart(condition)}
                          className="btn btn-edit"
                          title="Edit & Approve"
                        >
                          ✎ Edit
                        </button>
                        <button
                          onClick={() => handleMergeStart(condition.id)}
                          className="btn btn-merge"
                          title="Merge with existing"
                        >
                          ⇄ Merge
                        </button>
                        <button
                          onClick={() => handleDelete(condition.id)}
                          className="btn btn-delete"
                          title="Reject"
                        >
                          ✕ Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
