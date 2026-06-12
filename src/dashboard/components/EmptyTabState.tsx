export interface EmptyTabStateProps {
  reloading: boolean;
  onReload: () => void;
}

export function EmptyTabState({ reloading, onReload }: EmptyTabStateProps) {
  return (
    <output class="empty-tab-state">
      <div class="empty-tab-state-icon" aria-hidden="true">
        ◎
      </div>
      <h2 class="empty-tab-state-heading">No data yet</h2>
      <p class="empty-tab-state-sub">
        Data appears automatically after the page loads. If this tab is already open, reload it to
        start collecting.
      </p>
      {reloading ? (
        <div class="empty-tab-state-reloading">
          <div
            class="spinner"
            style={{ width: 16, height: 16, borderWidth: 2 }}
            aria-hidden="true"
          />
          <span>Waiting for data…</span>
        </div>
      ) : (
        <button type="button" class="empty-tab-state-btn" onClick={onReload}>
          Reload page
        </button>
      )}
    </output>
  );
}
